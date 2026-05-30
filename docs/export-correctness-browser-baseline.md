# Export correctness browser baseline

This note records the conservative browser/WebCodecs baseline restored for
issue #28 under the parent export-correctness PRD in issue #11.

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

## Precision policy

Known or estimated frame timing is useful for tolerances, but it does not prove
selected-range export precision. Editor-next now keeps selected ranges labeled
as best effort until generated-media evidence proves both requested boundaries
within the current frame tolerance.

Full-asset export remains a separate classification. A full-asset export can be
reported as full asset without claiming selected-range boundary precision,
because no trim boundary is being validated.

## Current baseline

The current committed baseline can guarantee:

- Default output review does not silently fall back to another output profile.
- Full-asset selections are classified separately from selected-range precision.
- Selected ranges are best effort unless a range-accuracy report contains
  measured start and end boundary evidence.
- Fixture inspection can report duration and track inventory for tiny MP4 and
  WebM assets.

The current baseline does not yet prove:

- Browser-runner selected-range boundary accuracy.
- Start or end boundary drift for generated export artifacts.
- Audio/video alignment in generated export artifacts.
- Runtime support across the broader fixture catalog.

Out of scope for this baseline: server export fallback, native FFmpeg export,
smart rendering, custom output settings, and generated media preview.

## Follow-up direction

The next slice should capture generated media from the real browser export
runner and feed it through the inspector. Until that harness provides boundary
evidence, browser selected-range export should keep conservative best-effort
language. If later measurements show boundary drift or audio/video alignment
outside tolerance, native FFmpeg should be considered as an additional runtime
capability instead of weakening the editor model.
