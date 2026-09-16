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
mute. Native 5/8/10 ms reference ramps report adjacent-sample differences and
endpoint timing. These results quantify discontinuity reduction and latency;
they do not establish perceptual inaudibility.

`pnpm exec tsc --project tsconfig.json --noEmit` includes this verification entry
(the narrower production `tsconfig.editor-next.json` does not).

## Built application check without a server

Run `npm run build`, then `node verification/preview-gain-transitions/browser-check.cjs`
with Playwright available in the execution environment. If it is outside normal
Node resolution, set `YAFFW_PLAYWRIGHT_PATH` to that installed module's absolute
path. Optionally set `YAFFW_BROWSER_EXECUTABLE` to a Chromium executable; otherwise
Playwright uses its installed Chromium.

The script fulfills the built static assets inside an isolated browser context
and starts no server. It imports the repository's two-audio sync fixture, operates
the real controls, checks native AudioParam targets and ramp bounds, and verifies
Close file/re-import cleanup. The result is written to `/tmp/yaffw-114-browser.json`.
