"""Fetch up to 150 Verify runs and retain inspectable GitHub evidence (requires gh)."""

import argparse
import concurrent.futures
import datetime
import json
import pathlib
import re
import subprocess


def api(path):
    return subprocess.check_output(["gh", "api", f"repos/DarkZeus/yaffw/{path}"])


def timestamp(value):
    return datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))


def seconds(start, end):
    return (timestamp(end) - timestamp(start)).total_seconds()


def collect_run(run):
    jobs = json.loads(api(f"actions/runs/{run['id']}/jobs?per_page=100"))
    timing = json.loads(api(f"actions/runs/{run['id']}/timing"))
    row = {key: run[key] for key in (
        "id", "head_sha", "event", "conclusion", "created_at", "updated_at",
        "run_started_at", "html_url", "run_attempt",
    )}
    row["commit_timestamp"] = run["head_commit"]["timestamp"]
    row["commit_to_report_s"] = seconds(row["commit_timestamp"], row["updated_at"])
    row["created_to_report_s"] = seconds(row["created_at"], row["updated_at"])
    row["timing"] = timing
    row["jobs"] = jobs["jobs"]
    row["logs"] = []
    for job in row["jobs"]:
        # Preserve logs, including phase boundaries not exposed by the step API.
        try:
            log = api(f"actions/jobs/{job['id']}/logs").decode()
        except subprocess.CalledProcessError:
            log = "Logs unavailable; phase durations are unknown."
        row["logs"].append({"job_id": job["id"], "text": log})
    return row


def summarize(row):
    jobs = row["jobs"]
    row["queue_s"] = seconds(row["created_at"], min(j["started_at"] for j in jobs))
    row["finalization_s"] = seconds(max(j["completed_at"] for j in jobs), row["updated_at"])
    phases = {}
    for job in jobs:
        for step in job["steps"]:
            if step["started_at"] and step["completed_at"]:
                phases[step["name"]] = seconds(step["started_at"], step["completed_at"])
    row["steps_s"] = phases
    log = "\n".join(item["text"] for item in row.pop("logs"))
    row["pnpm_cache_hit"] = "Cache restored from key: node-cache-" in log
    row["pnpm_exact_cache_hit"] = "Cache hit occurred on the primary key node-cache-" in log
    row["runner_image"] = re.findall(r"Image: (ubuntu-\S+)", log)
    row["phases_s"] = {}
    # These are observed script-start intervals, including pnpm/process overhead,
    # NOT CPU timings. Never infer missing boundaries from the total shell step.
    markers = []
    for line in log.splitlines():
        match = re.match(r"(\S+) > (\.@|yaffw-landing@) (\S+) /", line)
        if match:
            markers.append((match[1], match[2], match[3]))
    boundaries = {
        (".@", "format:check"): (".@", "lint"),
        (".@", "lint"): (".@", "test"),
        (".@", "test"): (".@", "build"),
        (".@", "build"): (".@", "typecheck"),
        (".@", "typecheck"): ("yaffw-landing@", "verify"),
        ("yaffw-landing@", "format:check"): ("yaffw-landing@", "lint"),
        ("yaffw-landing@", "lint"): ("yaffw-landing@", "typecheck"),
        ("yaffw-landing@", "typecheck"): ("yaffw-landing@", "build"),
        ("yaffw-landing@", "build"): ("yaffw-landing@", "test:smoke"),
    }
    for start, owner, script in markers:
        end = next((t for t, o, s in markers if (o, s) == boundaries.get((owner, script)) and t > start), None)
        if script == "test:smoke":
            end = next((line.split()[0] for line in log.splitlines() if "Post job cleanup." in line and line.split()[0] > start), None)
        if end:
            row["phases_s"][f"{owner}/{script}"] = seconds(start, end)
    instrumented = re.findall(r"VERIFY_RESULT (\{[^\n]+\})", log)
    if instrumented:
        row["verifications"] = [json.loads(item) for item in instrumented]
        scopes = {item.get("scope", "all") for item in row["verifications"]}
        complete = scopes == {"all"} or scopes == {"editor", "landing"}
        row["verification"] = {
            "complete": complete,
            "correctnessPassed": complete and all(item["correctnessPassed"] for item in row["verifications"]),
            "budgetsPassed": complete and all(item["budgetsPassed"] for item in row["verifications"]),
            "results": [result for item in row["verifications"] for result in item["results"]],
        }
        row["phases_s"] = {
            result["name"]: result.get("seconds")
            for result in row["verification"]["results"]
        }
    setup = re.findall(r"^\S+Z (\{[^\n]+\"setupSeconds\"[^\n]+\})", log, re.M)
    if setup:
        row["setups"] = [json.loads(item) for item in setup]
        row["setup_evidence"] = json.loads(setup[-1])
    row["jobs"] = [{key: job[key] for key in (
        "id", "name", "conclusion", "started_at", "completed_at", "runner_name", "labels", "steps",
    )} for job in jobs]
    return row, log


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=pathlib.Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    runs = []
    for page in (1, 2):
        batch = json.loads(api(f"actions/workflows/verify.yml/runs?per_page=100&page={page}"))["workflow_runs"]
        runs.extend(batch)
        if len(batch) < 100:
            break
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        rows = []
        for data in pool.map(collect_run, runs[:150]):
            row, log = summarize(data)
            (args.output / f"{row['id']}.log").write_text(log)
            rows.append(row)
    (args.output / "runs.json").write_text(json.dumps(rows, indent=2) + "\n")
    print(f"Collected {len(rows)} of up to 150 runs in {args.output}")


if __name__ == "__main__":
    main()
