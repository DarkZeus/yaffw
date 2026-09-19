# Output timing functional verification

Run against the existing development server at `http://127.0.0.1:3000`:

```sh
YAFFW_PLAYWRIGHT_PATH=/absolute/path/to/playwright \
YAFFW_BROWSER_EXECUTABLE=/absolute/path/to/chromium \
node verification/preview-output-timing/browser-check.cjs
```

No server is started and no project dependencies are added. Stop source edits
and run this separately from performance measurements to avoid HMR and browser
resource contention.

The runner imports the checked-in synchronized flash/click fixture through the
actual app. It repeats the same transport checks with production timing, the
candidate, and the candidate without `getOutputTimestamp`. Candidate activation
intercepts only the dedicated `preview-output-timing-enabled.ts` module and
asserts that the disabled constant was replaced. Production files remain intact.

Checks include 0.5x/1x/2x playback, paused seeking and frame steps, Selection
[2,8] repeated loops, real context suspension and controlled rejected recovery,
media end, and asset close/replacement. Chromium uses its default autoplay
policy, and all starts use actual application controls.

Evidence is written to
`docs/verification/evidence/preview-output-functional-2026-09-19.json` with
native media events, PCM source-start parameters, context configuration, and
click-to-native-pause timings. Those timings exclude physical speaker and
display latency. Visible wrap events cannot establish exact PCM source clipping;
the production scheduling harness and deterministic transport tests provide
that evidence. This runner does not measure physical audio/video alignment.

Run the preserved production functional and bounded scheduling gates against
the candidate separately:

```sh
YAFFW_PLAYWRIGHT_PATH=/absolute/path/to/playwright \
YAFFW_BROWSER_EXECUTABLE=/absolute/path/to/chromium \
node verification/preview-output-timing/bounded-check.cjs
```

This uses `/tmp/yaffw-111-continuous.mp4` (or `YAFFW_CONTINUITY_FIXTURE`), generated
with the command in [the interruption runner README](../preview-audio-interruptions/README.md).
It executes the existing production functional checks and five 30-second trials,
including the existing 250/500/1000ms renderer stalls and unchanged evaluators.
During each trial it polls `getPresentationTime()` approximately every 20ms to
exercise the candidate's timing work alongside scheduling. It writes
`docs/verification/evidence/preview-output-bounded-2026-09-19.json`.
The bounded runner uses an autoplay override for programmatic engine trials;
it does not test gesture policy. The actual-app runner above uses default policy.
