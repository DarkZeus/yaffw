# Preview interruption verification

Use the user's existing server at `http://127.0.0.1:3000`. These scripts never
start a server. They use Playwright and a Chromium executable supplied by the
local environment; no project dependency is added.

```sh
export YAFFW_PLAYWRIGHT_PATH=/absolute/path/to/playwright
export YAFFW_BROWSER_EXECUTABLE=/absolute/path/to/chromium
node verification/preview-audio-interruptions/browser-check.cjs
```

The script imports the checked-in synchronized two-audio-track fixture through
the actual application, exercises recovery controls and lifecycle, and writes
JSON under `docs/verification/evidence`. Native context suspension is real;
resume rejection, delayed resume, and explicit `interrupted` reporting are
controlled injections. No OS interruption or physical-device behavior is claimed.

The browser uses its default autoplay policy. All starts/retries originate from
clicked application controls. The separate bounded scheduler measurement uses
an autoplay override to run programmatic engine trials; it does not test gesture
policy.

Generate the continuous fixture for the existing production functional checks
and five 30-second bounded-window trials:

```sh
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i 'testsrc2=size=160x90:rate=30:duration=40' \
  -f lavfi -i 'sine=frequency=440:sample_rate=48000:duration=40' \
  -f lavfi -i 'sine=frequency=880:sample_rate=48000:duration=40' \
  -map 0:v -map 1:a -map 2:a \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p \
  -c:a aac -ac 2 -b:a 128k -movflags +faststart \
  /tmp/yaffw-111-continuous.mp4
node verification/preview-audio-interruptions/bounded-check.cjs
```

`YAFFW_CONTINUITY_FIXTURE` optionally selects another local fixture. Results
record its hash and metadata. The new 40-second fixture is distinct from #109's
unavailable historical controlled fixture; the existing numerical gates are
reused unchanged. The browser runner uses the production observer/profiler and
evaluator, includes all three renderer stalls, and retains raw trial evidence.
The shared `verification/bounded-audio-trials.cjs` collector also runs the output
timing candidate's bounded checks; that caller enables presentation-time polling.
Both use the production evidence harness's trial runner, preserving the separate
controlled fixture hash requirement for historical performance evidence.
Do not edit source during measurement because Vite reloads invalidate trials.

See [results and limitations](../../docs/verification/preview-audio-interruptions.md).
