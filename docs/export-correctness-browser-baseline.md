# Export correctness browser baseline

This note records the conservative browser/WebCodecs baseline restored for
issue #28 and published as the final baseline decision in issue #33 under the
parent export-correctness PRD in issue #11.

## Fixture catalog

The repeatable real-media fixtures live under
`public/export-correctness-fixtures/`.

- `tiny-video-only.mp4`: 2.0 seconds, 160x90 H.264 video, no audio.
- `tiny-video-with-audio.mp4`: 2.0 seconds, 160x90 H.264 video, AAC audio.
- `tiny-video-only.webm`: 2.0 seconds, 160x90 VP8 video, no audio.

The generated-media inspector reads these fixtures through Mediabunny and
reports container, duration, track inventory, and primary video dimensions. The
normal fast test loop covers those measured facts without requiring a manual
download delivery action.

## Browser artifact harness

`runFullAssetExportArtifactHarness` imports the tiny MP4 video-only fixture as a
local media asset, runs the full-asset Selection through the default browser
export runner, captures the Generated media bytes directly, and inspects the
captured artifact with the generated-media inspector.

`runSelectedRangeExportArtifactHarness` uses the same browser runner path with a
non-full Selection from the fixture catalog. Its report compares the requested
half-open Selection duration with the measured Generated media duration,
records duration drift in media-time microseconds, and feeds the conservative
range-accuracy result into the export review planner.

The harness report keeps export execution, generated-media inspection,
range-accuracy classification, export review language, and Delivery action
separate. It records the requested Selection in media-time microseconds, export
progress events, captured artifact size and MIME type, inspected duration and
track inventory, duration drift where measurable, and an explicit note that
download was not performed. Download remains a user-facing Delivery action after
export success.

The normal Vitest loop exercises the harness with injected runner and analysis
doubles so the fast tests do not depend on browser encoding availability. The
same harness defaults to the real browser analyzer, real default export runner,
and browser fixture fetch when it is invoked from a supported Chromium runtime.

`runFixtureCatalogExportArtifactHarness` extends that measured path across the
registered fixture catalog. The catalog report records one result per fixture:
`exported` results include the captured Generated media inspection, range
classification, export review, and delivery separation; `unsupported` results
name the failing capability stage, reason, and technical details. This keeps
MP4, WebM, video-only, and video-with-audio cases explicit without silently
falling back to another output profile or treating delivery as part of export
correctness.

## Measured behavior

Full-asset fixture export is the strongest current browser/WebCodecs path. The
artifact harness captures Generated media bytes before delivery, inspects the
result, and keeps the export review in the `Fast export` / `Full asset` state
because the requested Selection is `[0, durationUs)`. The tiny MP4 video-only
fixture is inspected as a roughly 2-second MP4 with one video track and no audio
track.

Catalog measurement covers three registered 2-second fixtures. The current
default MP4/H.264/AAC profile supports the MP4 video-only and MP4 video-with-AAC
cases in the harness report shape, including generated track inventory checks:
the video-only result has one generated video track and no generated audio
tracks; the video-with-audio result has one generated video track and one
generated audio track. The WebM video-only fixture is explicit rather than
silent fallback: if the runtime cannot export it with the default profile, the
catalog result is `unsupported` at the capability stage with technical details.

Selected-range fixture export remains a duration-only measurement. The
registered selected range is `[500000, 1500000)`, a 1-second half-open
media-time Selection inside each 2-second fixture. The selected-range harness can
inspect generated duration and report drift in microseconds; the committed fast
test path records a 2-second Generated media artifact for that 1-second request,
so the report exposes `+1000000us` duration drift and keeps export review in
`Best-effort export` / `Best effort`. That duration evidence is useful because
it catches overlong or short artifacts, but it does not identify whether the
start boundary, end boundary, or both boundaries drifted.

## Precision policy

Known or estimated frame timing is useful for tolerances, but it does not prove
selected-range export precision. Editor-next now keeps selected ranges labeled
as best effort until generated-media evidence proves both requested boundaries
within the current frame tolerance.

Measured duration alone can expose drift, but it does not prove boundary
precision because it cannot identify whether the start, end, or both boundaries
moved.

Full-asset export remains a separate classification. A full-asset export can be
reported as full asset without claiming selected-range boundary precision,
because no trim boundary is being validated.

## Current baseline

The current committed baseline can guarantee:

- Default output review does not silently fall back to another output profile.
- Full-asset selections are classified separately from selected-range precision.
- Selected ranges are best effort unless a range-accuracy report contains
  measured start and end boundary evidence.
- Selected-range harness reports can now compare requested and generated
  duration in media-time microseconds.
- Fixture inspection can report duration and track inventory for tiny MP4 and
  WebM assets.
- Catalog fixture export measurement can cover the tiny MP4 video-only and MP4
  video-with-audio cases through the same artifact report shape, including
  generated video/audio track inventory checks.
- WebM fixture measurement is explicit: it either produces inspected Generated
  media through the current runtime or records an unsupported capability result
  with technical details. It does not silently change the default output
  profile.

The current baseline does not yet prove:

- Browser-runner selected-range boundary accuracy.
- Start or end boundary drift for generated export artifacts.
- Audio/video alignment in generated export artifacts.
- Track inventory beyond the registered tiny fixture catalog.
- Runtime support across broader browsers, containers, codecs, durations, and
  multi-track media.

Track inventory measurement currently proves only whether inspected generated
tracks are present in the fixture result. It does not prove audio/video sync,
codec suitability beyond the default profile facts, or behavior for media with
more than one audio track.

Out of scope for this baseline: server export fallback, native FFmpeg export,
smart rendering, custom output settings, and generated media preview.

## Follow-up direction

The issue #33 decision is: keep the browser/WebCodecs export path, but defer
stronger selected-range precision claims. Full-asset browser export can continue
to be presented as full-asset output when default profile capability is
available. Selected-range browser export must remain best effort until YAFFW has
generated-media evidence for both the requested start and end boundaries.

The next implementation direction should be browser hardening only where it
creates missing evidence: add start/end boundary measurement and audio/video
alignment checks to the artifact harness, then feed those facts through the
existing conservative classifier. Do not add server fallback, native FFmpeg,
smart rendering, custom output settings, or Generated media preview in this
decision slice.

Native FFmpeg should be considered as a future runtime capability only if the
next boundary/alignment measurements show browser/WebCodecs drift outside the
current frame tolerance or missing track behavior that the browser runner cannot
reasonably harden. Until that evidence exists, the product decision is to keep
honest best-effort selected-range language rather than introduce another export
runtime.
