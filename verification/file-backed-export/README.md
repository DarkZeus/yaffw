# File-backed export proof (#124)

This is an isolated comparison, **not a second production runner**. It uses the
existing app at `http://127.0.0.1:3000`; no command starts a server or installs
packages. Requirements: installed Playwright, Chromium with AVC/AAC, ffmpeg and
ffprobe, and the pinned Mediabunny 1.65.2.

```sh
export YAFFW_PLAYWRIGHT_PATH=/absolute/path/to/playwright
export YAFFW_BROWSER_EXECUTABLE=/absolute/path/to/chromium
node verification/file-backed-export/fixtures.mjs
node verification/file-backed-export/check.mjs
node verification/file-backed-export/inspect.mjs
node verification/file-backed-export/lifecycle.mjs
node verification/file-backed-export/app-check.mjs
node verification/file-backed-export/retain.mjs
pnpm exec tsc --project verification/file-backed-export/tsconfig.json
pnpm exec biome check --config-path verification/file-backed-export verification/file-backed-export
npm run typecheck
npm run test
npm run build
```

`YAFFW_ORIGIN` optionally overrides the origin; `YAFFW_REPEATS` defaults to two.
Keep at least two repetitions, reversing order on the second. Generated files,
screenshots, raw memory samples, packet evidence and reports go under ignored
`tmp/file-backed-export/`. The fixture generator also reuses the #121 CFR/VFR
barcode/flash/click files under `tmp/copy-boundaries/`. Browser profiles are
ephemeral and isolated from the user's open browser.

`instrument.mjs` asserts unique replacements in Vite's served production module.
The candidate replaces BufferTarget with seekable OPFS StreamTarget (1 MiB
chunks), MP4 fast-start with `reserve`, adds mixed AAC packet reservation, and
returns the finalized OPFS File. Everything else, including copy timestamp shift,
Selection, audio mixing, codecs and delivery, is the production path. The helper
is only imported by this request-time instrumentation. Tests use real Mediabunny
WAV output with fake OPFS to exercise writes/backpatches without browser codecs.

The large stress source is 16 seconds, 1280×720/30 AVC with B frames, 2-second GOPs,
40 Mb/s CBR filler and two mono 48 kHz AAC tracks. Filler deliberately stresses
encoded-byte storage; it is not representative compression/throughput evidence.
Both policies export `[1.137,13.283)` with default settings and both tracks
included. The resulting single AAC Generated audio mix is independently encoded.
Same source hash, browser and output settings are retained in the report.

Measurement boundaries:

- CDP `Runtime.getHeapUsage` samples every **at least** 20 ms, plus explicit
  retained/inspection/delivery snapshots. These are sampled V8 backing-store and
  JS-heap observations, **not exact process peaks, browser Blob storage, GPU,
  native codec/AudioBuffer memory, or total resident memory**. Finalization can
  finish between samples. Heap and page phase reads are sequential, not atomic;
  the report separates whole-observation maxima from approximately tagged
  export samples and does not infer a proven export-processing peak reduction.
  Inspection does not call `File.arrayBuffer()`.
- A weak reference observes BufferTarget capacity without extending its lifetime;
  its write callback captures maximum capacity deterministically. A pre-finalize
  observer separately sums mux sample-queue/chunk payload lengths using pinned
  library internals. Metadata objects, source caches and codec queues are not
  included in that payload count. These component counts are not added together
  as an asserted simultaneous process peak.
- The final mixed AudioBuffer reports frames, channels, rate and logical PCM
  bytes. Full-Selection source decoding, transforms and offline rendering still
  allocate additional native PCM; that total/peak is not established by CDP.
  Neither policy changes the audio decoder/mixer. No bounded-memory export claim
  follows. Forced GC after inspection records retained JS backing separately;
  it is not applied during export.
- Download uses the existing anchor/object-URL Delivery action. Playwright saves
  the completed download outside the renderer and checks its byte size. This is
  separate from metadata inspection and does not base64/materialize the artifact
  in page JS. Browser-managed delivery storage is not quantified.
- Independent ffprobe packet hashes/timestamps compare each complete encoded
  track, and a top-level MP4 box walk proves `moov` precedes `mdat`. Both track
  packet counts are checked against reservations. The video bound is Conversion's
  automatic estimate; mixed AAC uses `ceil(1.5 * frames / 1024) + 64`, matching
  the pinned library's estimate/headroom. This is not a universal codec bound.

The lifecycle runner cancels a real mixed export during processing and injects
write-quota/unavailable-storage errors; all must fail explicitly and leave no
proof files. The memory runner also deliberately deletes staging immediately
after Download. Its asserted canceled download and `NotFoundError` reproduce the
**failed adoption gate**, not a successful delivery feature.

The actual UI runner covers CFR/VFR/No audio, selected boundaries, explicit
Download, invalidation, Close file, replacement by re-import, and playback. It
observes that product invalidation only drops the Blob reference; proof-owned
disposal explicitly removes staging afterward. It does **not** pretend the
production store owns cleanup. Stale-job cleanup and automatic Close file/
replacement cleanup remain adoption requirements, not shipped claims.

[Recorded outcome and next step](../../docs/verification/file-backed-export.md).
