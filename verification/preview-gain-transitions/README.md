# Preview gain transition PCM verification

With the repository Vite development server running, open
`/verification/preview-gain-transitions/index.html` and press **Run checks**.
The page prints a serializable JSON summary. For browser automation, evaluate
`await window.runPreviewGainTransitionChecks()`; any failed assertion rejects.
No external audio fixture or installed browser-test package is needed.

The harness renders the production gain transition and production audio graph
through native `OfflineAudioContext`. Controls run at render-quantum-aligned
suspensions, so they use the actual context clock rather than cancelling future
automation before rendering begins. It checks every output sample against an
independent piecewise-linear expectation, with absolute error tolerance 0.00001
and strict equality for exact zero. Both 48 kHz and 44.1 kHz rapid retargets are
covered; the latter also tests a non-integral transition length in samples.

Coverage includes mute/unmute, nonzero endpoints, repeated and same-time target
updates, rapid retargets, retargeting after a constant hold, direct paused
initialization, settling, graph teardown/recreation, stereo routing, track/global
gain composition, contiguous PCM chunk boundaries, and meter taps before global
mute. Track coverage includes rapid interleaved monitor/volume/global changes,
same-time combined-target retargets, repeated targets, exact track mute endpoints,
six explicit channel modes, settling and destroying simultaneous track/global
ramps, and pre-global meter response to track ramps while global output is muted.
Native 5/8/10 ms reference ramps report adjacent-sample differences and
endpoint timing. These results quantify discontinuity reduction and latency;
they do not establish perceptual inaudibility.

`pnpm exec tsc --project tsconfig.json --noEmit` includes this verification entry
(the narrower production `tsconfig.editor-next.json` does not).

## Application checks

To exercise the existing development server at `http://127.0.0.1:3000`, set
`YAFFW_LIVE_APP=1` when running the script below. This mode performs no asset
interception and does not start or stop the server.

For isolated build verification without a server, run `npm run build`, then `node verification/preview-gain-transitions/browser-check.cjs`
with Playwright available in the execution environment. If it is outside normal
Node resolution, set `YAFFW_PLAYWRIGHT_PATH` to that installed module's absolute
path. Optionally set `YAFFW_BROWSER_EXECUTABLE` to a Chromium executable; otherwise
Playwright uses its installed Chromium.

The script fulfills the built static assets inside an isolated browser context
and starts no server. It imports the repository's two-audio sync fixture, operates
the real controls, checks native AudioParam targets and ramp bounds, and verifies
Close file/re-import cleanup. Audio panel checks cover Track volume, exclusion
with remembered volume, solo of an excluded track, switching solo, channel routing,
meters under global mute, and immediate paused changes. The result is written to
`/tmp/yaffw-115-browser.json`; set `YAFFW_BROWSER_RESULT_PATH` to override it.

## Native PCM check without a server

Bundle the harness with the repository's esbuild, then inject it into a blank
Playwright page. Set `YAFFW_PLAYWRIGHT_PATH` to the installed Playwright module
and optionally `YAFFW_BROWSER_EXECUTABLE` as above. This runs the same native
`OfflineAudioContext` checks without starting a server:

```sh
pnpm exec esbuild verification/preview-gain-transitions/main.ts --bundle --platform=browser --format=iife --outfile=/tmp/yaffw-pcm.js
node <<'JS'
const { launchBrowser } = require("./verification/browser.cjs");
(async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent('<button id="run">Run checks</button><pre id="result"></pre>');
    await page.addScriptTag({ path: "/tmp/yaffw-pcm.js" });
    console.log(JSON.stringify(await page.evaluate(
      () => window.runPreviewGainTransitionChecks(),
    ), null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
JS
```

The 2026-09-16 native Chromium run is recorded in
`docs/verification/evidence/track-gain-transitions-2026-09-16.json`.
