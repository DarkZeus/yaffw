# Mediabunny 1.65.2 upgrade

Issue [#117](https://github.com/DarkZeus/yaffw/issues/117), verified 2026-11-06
(Europe/Kiev). The manifest and pnpm lockfile move exactly from 1.65.0 to 1.65.2;
no other dependency resolution changes. This extends the
[1.65.0 audit](dependency-audit-mediabunny-1.65.0.md).

[1.65.1](https://github.com/Vanilagy/mediabunny/releases/tag/v1.65.1) addresses
invalid Conversion packet timestamps and encoder input-format stability.
[1.65.2](https://github.com/Vanilagy/mediabunny/releases/tag/v1.65.2) includes
sparse-keyframe lookup fixes, fragmented MP4 keyframe information and AES stream
descriptions. YAFFW retains its zero copy timestamp shift, shared audio packet
timeline, decoder ownership and ADR-0024 output-profile policy. No custom
keyframe index is removed and no export-boundary policy changes.

## Preview source correction

The required MKV application check exposed an existing provider-selection defect:
YAFFW forwarded the File MIME type `video/x-matroska` to Vidstack. That type is
absent from Vidstack 1.15.6's native-video provider types, so a Blob URL selected
no provider and Play stayed at zero. Chromium could play the exact H.264/AAC
bytes in an independent native video element. VP9/Opus MKV also failed provider
selection, so changing codecs did not address the cause.

Local Preview Blob URLs now use Vidstack's `video/object` dispatch type with a
focused public `VideoProviderLoader` extension. Vidstack 1.15.6 also calls native
`canPlayType` on string URL hints, which rejects even `video/object`; the local
loader selects only video Blob URLs and delegates loading with the provider's
unknown-type marker (`?`). That assigns the existing URL directly without a
`source` MIME attribute. Browser decoding retains container/codec responsibility,
and YAFFW retains creation/revocation ownership of the same URL. Ready media
assets require video; no audio-only provider path is added.

The obsolete MIME prop is removed. This changes only the native adapter boundary,
consistent with ADR-0013; it does not add transcoding, remuxing, another player or
a compatibility runner. Regression tests cover MKV, generic, MP4 and empty file
MIME types, local-only loader selection and direct URL loading.

## MKV audio timing correction

The real selected-range MKV export initially failed the flash/click check. Video
flash onsets at 1.020 through 5.020 seconds paired with audio onsets at 1.060,
2.085, 3.105, 4.125 and 5.145 seconds: growing 40–125 ms delay measured with 5 ms
PCM bins. A raw packet comparison of installed 1.65.0 and 1.65.2 found identical
zero-duration AAC packet metadata at cluster boundaries (2.005, 3.008, 4.010,
5.013 seconds and later). This was an existing YAFFW integration defect.

Both audio timeline readers discarded duration-zero packets, even though they
contain encoded audio. The projector then inserted a phantom gap for each lost
packet. They now retain those packet positions. The shared compressed-audio
timeline infers unknown extent from the next timestamp; its existing
cadence-based rule still separates actual packet gaps. A final unknown extent
uses observed positive cadence. PCM keeps declared extents. Range decoding also
retains the immediate unknown predecessor and preceding cadence context when it
may overlap the requested start. No decoder error is converted to silence.

Real browser checks now verify primary-track click onsets at 1.020 through 9.020
seconds through both Preview windows and the Generated-audio-mix source decoder,
including starts at 2.005 and 2.010 seconds inside that boundary packet. Existing
Opus/AAC/Vorbis missing-packet cases remain silent in the gap. Regression tests
exercise inferred occupancy, real gaps after unknown packets, PCM handling and
range-start context.

## Reproducible evidence

Use the user-owned app at `127.0.0.1:3000`; no server is started. Recipes,
assertions and commands live in
[the upgrade harness](../verification/mediabunny-upgrade/README.md) and
[frame timing harness](../verification/frame-timing/README.md).
The retained [adapter report](verification/evidence/mediabunny-1.65.2-adapters-2026-11-06.json),
[application report](verification/evidence/mediabunny-1.65.2-app-2026-11-06.json),
[pre-fix MKV signal](verification/evidence/mediabunny-1.65.2-mkv-before-fix-2026-11-06.json)
and [version comparison](verification/evidence/mediabunny-zero-duration-versions-2026-11-06.json)
keep positive and negative evidence inspectable. Frame-timing reports retain
[analysis](verification/evidence/mediabunny-1.65.2-frame-analysis-2026-11-06.json)
and [application checks](verification/evidence/mediabunny-1.65.2-frame-app-2026-11-06.json).

Recorded runtime: Brave Chromium **155.0.8059.85**, WebCodecs, headless, on macOS;
Mediabunny **1.65.2**. ffmpeg creates fixtures and ffprobe independently checks
packet timestamps. Retained reports are under `docs/verification/evidence/`.

- Eleven adapter fixtures: 61-second H.264 MP4 with B-frames and 20-second GOPs;
  the same video in an MKV with exactly one CuePoint (three replaced with EBML
  Void without changing cluster offsets); a two-audio flash/click MKV remux, and gap/continuous twins for Opus
  WebM, Vorbis WebM, AAC MKV and AAC MP4.
- Late, adjacent, reverse and cross-GOP packet lookups and production decoded
  scrub results match ffprobe presentation timestamps. All requested production
  video-strip images are nonempty. First 59.83-second requests resolve video
  packet 59.8 seconds and keyframe 40 seconds in both containers. Lookup and scrub
  elapsed times are recorded per request, without a before/after speedup claim.
- Both production Generated-audio-mix source decoding and Preview windows run
  from 0, 2.5 and 3.2 seconds. Gap files retain silence at 2.5 seconds and audible
  signal afterward; continuous twins remain audible. AAC/Opus expose negative
  first-packet timestamps and retain audible PCM at 50 ms. Every generation and
  provider is disposed; unit tests cover cancellation races, late samples,
  sample closure, iterator return, source errors and Export cleanup.
- Six frame-timing fixtures retain exact Node/browser metric parity, production
  analysis, visible confidence/spacing facts, nominal frame steps and bounds.
  The application test also exports a VFR Selection, explicitly delivers it,
  re-imports it and confirms Close file.
- The real MP4 and H.264/AAC MKV application checks exercise import, Play/Pause,
  late seek, frame step, keyboard Selection `[2,000,000, 8,000,000)`, mixed export,
  explicit download, and re-import. Delivered artifacts contain one video and
  one Generated audio mix. ffmpeg independently checks bright video and audible
  PCM at five corresponding flash/click events and a quiet/dark control point.
  Two worker-generated 8,192-bucket Waveform lanes render through WaveSurfer;
  packet-gap Waveform placement remains
  the separately scoped investigation in #118.

## Verification limits

- No reproducible invalid-timestamp input is in the fixture catalog. The upstream
  packet-dropping correction is adopted but not independently triggered here.
  Successful exports do **not** establish that no frames were dropped.
- The production Generated audio mix passes stable encoder input formats; the
  application report records the observed formats. This path does not naturally
  change formats midstream, so the upstream internal reset fix is conditional,
  not claimed as independently exercised.
- Sparse-cue results establish correctness on these synthetic inputs, not a
  speedup, a replacement for the background index (#122), or the original
  upstream report's exact cluster/cue layout. No real long recording, physical
  A/V output, Firefox or Safari measurement is claimed.
- Mediabunny can report the final unknown-duration AAC packet's start as track
  end (4.992 seconds in the continuous MKV fixture). The timeline now retains its
  inferred occupied extent, but the Preview provider still respects the library
  track endpoint. Exact final-frame audio presentation remains unproven; this
  upgrade does not change asset/track duration policy.
- Representative flash/click checks do not prove exact first/last selected
  frames or eliminate AAC endpoint padding. Export review remains best effort
  under ADR-0015. No code for #118–#124 is adopted in this upgrade.
- Typecheck, tests, production build, frozen offline install, harness TypeScript,
  and lint/format checks for affected source and harness files are required.
  Exploratory unscoped `npm run lint` and `npm run format` also reveal existing
  errors in untouched shared UI files and unreadable `.tanstack/tmp` files.
  Those pre-existing repository-wide cleanup problems are outside this issue;
  affected-file checks are run without disabling rules or excluding changed code.

Preview transport verification also exposed a pre-existing test scheduling race:
its RAF stub ignored cancellation and tests could consume a frame before the
passive effect scheduled it. The stub now removes cancelled callbacks with unique
IDs, affected tests await a pending frame, and the recovery assertion checks one
pending loop callback versus none after stopping. Production transport behavior
is unchanged.

## Final result

- `npm run typecheck`: passed.
- `npm run test`: 617 tests across 75 files passed.
- `npm run build`: passed, including its TypeScript gate; existing large-chunk
  warning remains.
- `pnpm install --frozen-lockfile --offline`: passed with the exact lockfile.
- Harness TypeScript and all affected source/harness Biome checks: passed.
- Eleven adapter fixtures and six frame-timing analysis/application fixtures:
  passed. MP4 and MKV actual application export/delivery/re-import: passed.

Both delivered six-second Selections have 6.036-second container duration (AAC
padding). Five decoded flash onsets and PCM click onsets coincide within the
5 ms audio probe resolution: MP4 at 1–5 seconds and MKV at 1.020–5.020 seconds.
Both encode the Generated audio mix from `f32-planar` inputs. These measurements
establish representative synchronization, while selected boundary/EOF limits
and conditional upstream cases above remain explicit.
