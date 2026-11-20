"""Audit a completed Verify run's entire required-result path; never rerun checks."""

import argparse
import datetime
import json
import os
import pathlib
import subprocess


def api(path):
    return json.loads(subprocess.check_output(["gh", "api", path]))


def elapsed(start, end):
    if not start or not end:
        return None
    parse = lambda value: datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
    seconds = (parse(end) - parse(start)).total_seconds()
    return seconds if seconds >= 0 else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_id", type=int)
    args = parser.parse_args()
    repository = os.environ.get("GITHUB_REPOSITORY", "DarkZeus/yaffw")
    base = f"repos/{repository}/actions/runs/{args.run_id}"
    run = api(base)
    jobs = api(base + "/jobs?per_page=100")["jobs"]
    by_name = {job["name"]: job for job in jobs}
    violations = []
    observations = []

    def budget(name, value, maximum):
        observations.append({"name": name, "seconds": value, "strictUpperBudget": maximum})
        if value is None:
            violations.append(f"{name}: unknown (never treated as within budget)")
        elif value >= maximum:
            violations.append(f"{name}: {value:g}s exceeds <{maximum:g}s budget")

    if run["conclusion"] != "success":
        violations.append(f"Source Verify did not succeed: {run['conclusion']}")
    for owner in ("Editor", "Landing"):
        job = by_name.get(f"{owner} verification", {})
        step = next((step for step in job.get("steps", []) if step["name"] == f"Complete {owner.lower()} contract"), {})
        ran = step.get("conclusion") in ("success", "failure")
        budget(f"{owner} queue including workflow dispatch", elapsed(run.get("created_at"), job.get("started_at")), 5)
        budget(f"{owner} setup including checkout/provisioning", elapsed(job.get("started_at"), step.get("started_at")) if ran else None, 15)
        budget(f"{owner} execution lane", elapsed(step.get("started_at"), step.get("completed_at")) if ran else None, 35)
    gate = by_name.get("verify", {})
    budget("Aggregate queue", elapsed(gate.get("created_at"), gate.get("started_at")), 5)
    check = api(gate["check_run_url"]) if gate.get("check_run_url") else {}
    reported = check.get("completed_at")
    budget("Run creation to required reported result", elapsed(run.get("created_at"), reported), 120)
    if run["event"] in ("push", "pull_request"):
        budget("Commit to required reported result", elapsed((run.get("head_commit") or {}).get("timestamp"), reported), 120)
    budget("Final check reporting after job completion", elapsed(gate.get("completed_at"), reported), 5)
    result = {"runId": args.run_id, "revision": run["head_sha"], "url": run["html_url"], "event": run["event"], "reportedAt": reported, "passed": not violations, "observations": observations, "violations": violations,
              "limits": "API timestamps have one-second resolution. Commit timestamps are client metadata. This is a per-run audit; percentile claims require comparable samples. Manual dispatch commit age is not change-feedback latency."}
    output = pathlib.Path("tmp/ci-latency-budget.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        rows = [f"Latency of [Verify {args.run_id}]({run['html_url']}) at `{run['head_sha']}`", "", "| Observation | Seconds | Budget |", "| --- | ---: | ---: |"]
        for item in observations:
            value = "unknown" if item["seconds"] is None else f"{item['seconds']:g}"
            rows.append(f"| {item['name']} | {value} | <{item['strictUpperBudget']} |")
        rows.extend(["", result["limits"], "", *violations])
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
            summary.write("\n".join(rows) + "\n")
    return 0 if not violations else 1


if __name__ == "__main__":
    raise SystemExit(main())
