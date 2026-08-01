# Dependency audit: Mediabunny 1.52.2

This audit completes the release and direct-dependency review required by
issue #97. It was prepared on 2026-08-01 from the upstream Mediabunny GitHub
releases, the published 1.52.2 type declarations, package registry metadata,
and every YAFFW production import or call site.

## Mediabunny production call sites

| Boundary | Production file | Audit result |
| --- | --- | --- |
| Media asset analysis | `src/editor-next/media-asset/adapters/browser-local-asset-analyzer.ts` | Adopt `Input.canRead()` and metadata-first duration with measured fallback. Keep deprecated InputTrack property migration for #104. |
| Preview audio preparation | `src/editor-next/audio/engine/preview-audio-resources.ts` | Cleanup fixes apply automatically. Keep the remux/WAV bridge pending the proof in #103 and keep InputTrack getter migration in #104. |
| Generated audio mix | `src/editor-next/audio/engine/browser-audio-mix.ts` | Decoder, resampler, and sample-cleanup fixes apply automatically. Direct Preview-resource decoding remains #103. |
| Waveform loading | `src/editor-next/selection/waveform/selection-waveform-lanes-loader.ts` | Decoder and disposal fixes apply automatically. Exact decoded track duration remains appropriate for bounding samples. |
| Selection video strips | `src/editor-next/selection/video-strip/selection-video-strip-loader.ts` | Decoder and canvas-resize fixes apply automatically. Exact track duration remains appropriate; getter compatibility remains #104. |
| Output quality adapter | `src/editor-next/export/adapters/mediabunny-output-quality.ts` | Replace deprecated constants and bitrate fields with `Quality`. |
| Documented output profiles | `src/editor-next/export/adapters/mediabunny-output-support.ts` | Existing format-derived support automatically includes newly documented codecs such as ProRes, consistent with ADR-0024. |
| Export runner | `src/editor-next/export/runners/default-export-runner.ts` | Pass `quality` to conversion and audio encoding. Current conversion owns its Output; composition, pause, and step controls do not fit the current Export job contract. |
| Generated media inspection | `src/editor-next/export/generated-media/generated-media-inspector.ts` | Input/container fixes apply automatically. Keep measured duration because export-correctness evidence must not substitute optional metadata for artifact measurement; getter migration remains #104. |

Consumers of these boundaries in the Export inspector, Output settings modal,
single-asset editing session, and artifact harness were also checked. They do
not call Mediabunny directly and require no API migration.

## Stable Mediabunny release-to-code matrix

Prereleases are intentionally excluded. Every stable release from v1.25.0
through v1.52.2 is represented below.

| Release | Relevant upstream change | YAFFW decision |
| --- | --- | --- |
| v1.25.0 | Track disposition metadata and disabled ISOBMFF tracks | No product use yet; track selection remains all analyzed tracks. Getter migration stays in #104. |
| v1.25.1 | Rollup pure-annotation warning fix | Adopt through upgrade; no code change. |
| v1.25.2 | Stop UrlSource retries on disposal; stronger Firefox encodability checks | Disposal fix is useful in principle, but YAFFW uses BlobSource and a Chromium-first runtime. No code change. |
| v1.25.3 | Capped range-request handling and TypeScript 5.9 typed-array types | UrlSource is unused. Adopt the TS 5.9 boundary fixes required in audio mixing and artifact Blob creation. |
| v1.25.4 | AudioSample cleanup and AV1 parsing fixes | Adopt through upgrade for decoded audio and AV1 inspection. |
| v1.25.5 | Correct optional conversion trim types | Adopt through upgrade; YAFFW already supplies both Selection boundaries. |
| v1.25.6 | Packaging-only republish | No action. |
| v1.25.7 | MP3 timestamps, audio gap filling, and rare ISOBMFF B-frame fixes | Adopt through upgrade for import, Preview, and export correctness. |
| v1.25.8 | Safari worker frame order and AVC recovery-point keyframes | Adopt through upgrade; no Safari support expansion is claimed. |
| v1.26.0 | Rotation-metadata conversion option and MediaStream source pause/resume | No action: YAFFW does not use MediaStream sources and retains default rotation behavior. |
| v1.27.0 | VideoSample copy options and conversion hardware preference | No action: current CanvasSink and Conversion defaults fit the browser-local path. |
| v1.27.1 | Chromium key-frame decoder workaround | Adopt through upgrade for Preview and video-strip reliability. |
| v1.27.2 | Disposed UrlSource aborts requests | No code change; current sources are local Blobs. |
| v1.27.3 | WebKit AudioData copy workaround | Adopt through upgrade without broadening supported-runtime claims. |
| v1.27.4 | VideoSample validation and sample-range upper-bound fix | Adopt through upgrade for sink iteration correctness. |
| v1.27.5 | Conversion cancellation resolution, sample cleanup, and Matroska robustness | Adopt through upgrade; existing AbortSignal-to-cancel ownership remains. |
| v1.27.6 | Disabled Matroska track fix | Adopt through upgrade for analysis correctness. |
| v1.28.0 | Ogg page-duration control and malformed-packet fix | Ogg control is not needed; demux fix applies automatically. |
| v1.29.0 | MPEG-TS support, first timestamps, trim default correction, and AAC packet support | Adopt through upgrade. YAFFW already supports MPEG-TS output and supplies explicit Selection trim boundaries. |
| v1.29.1 | Avoid full MPEG-TS read during metadata extraction | Adopt through upgrade for faster analysis. |
| v1.30.0 | Per-type track number and MPEG-TS/network improvements | Adopt track numbering automatically; network-specific behavior is unused. |
| v1.30.1 | MPEG-TS initialization segmentation fix | Adopt through upgrade. |
| v1.31.0 | ADTS ID3 support and resilient MPEG-TS demuxing | Adopt through upgrade for supported import formats. |
| v1.31.1 | MP3 XING recognition fix | Adopt through upgrade. |
| v1.32.0 | UrlSource parallelism control | No action: local Blob inputs do not use UrlSource. |
| v1.32.1 | WAVE pre-start read fix | Adopt through upgrade for Preview WAV fallback. |
| v1.32.2 | WAVE out-of-bounds packet fix | Adopt through upgrade for Preview WAV fallback. |
| v1.33.0 | AC-3/E-AC-3 recognition, negative trim, and timestamp metadata | Codec recognition flows through documented formats; no extension package or negative Selection is needed. |
| v1.34.0 | Optional AC-3 extension | No action: adding a codec extension would be speculative and changes runtime cost. |
| v1.34.1 | AC-3 package publishing fix | No action because the extension is not installed. |
| v1.34.2 | Deployment fixes | Adopt core packaging fixes through upgrade; no YAFFW code change. |
| v1.34.3 | Corrupt WAVE ID3 and MPEG-TS DTS fixes | Adopt through upgrade for import/export robustness. |
| v1.34.4 | Extension bundling and worker-lifetime fixes | Core worker cleanup applies automatically; unused extensions remain uninstalled. |
| v1.34.5 | StreamTarget and extension bundling fixes | No StreamTarget or affected extension use. |
| v1.35.0 | Non-square pixels and related video metadata | Adopt through upgrade; current display dimensions continue to drive analysis and resizing. Getter work remains #104. |
| v1.35.1 | QuickTime audio compatibility fix | Adopt through upgrade for MOV Generated media. |
| v1.36.0 | Optional AAC encoder extension | No action: Chromium/WebCodecs is the supported runtime and no fallback package is required. |
| v1.37.0 | Optional FLAC encoder extension | No action: runtime/profile failures remain explicit under ADR-0024. |
| v1.38.0 | MediaStream video sampling | No action: YAFFW does not use MediaStream sources. |
| v1.38.1 | fMP4 CTS fix and Firefox MediaStream fallback | fMP4 fix applies automatically; no Firefox support expansion or MediaStream integration. |
| v1.39.0 | First-key-packet sink helper | No action: current encoded-track copy iterates all packets and does not need a separate key-packet lookup. |
| v1.39.1 | Documentation only | No action. |
| v1.39.2 | MPEG-TS detection and GOP timestamp fixes | Adopt through upgrade. |
| v1.40.0 | FLAC streaming and video rotation/container fixes | Adopt correctness fixes; append-only FLAC is outside the single-Blob Generated media model. |
| v1.40.1 | Matroska defaults fix | Adopt through upgrade. |
| v1.41.0 | TXXX ID3 metadata | No current product use for descriptive metadata tags. |
| v1.42.0 | HLS/CMAF, multi-file I/O, async metadata getters, metadata duration/readability, runtime decode checks, source refs, and conversion expansion | Adopt `canRead()` and metadata-first Media asset duration. Keep single-artifact output, existing track decode checks, and Blob ownership. HLS/CMAF are out of scope; all InputTrack getter migration is #104. |
| v1.43.0 | Audio sample-format conversion and HEVC/MP4/PCM fixes | Adopt correctness fixes. No custom FLAC bit-depth control is required. |
| v1.43.1 | ISOBMFF pixel-aspect robustness | Adopt through upgrade. |
| v1.44.0 | BlobSource stream-reader fallback | Keep the default reader; no observed source-specific instability justifies disabling it. |
| v1.44.1 | Live-source negative timestamp fix | No live source use. |
| v1.44.2 | Audio resampler timestamp fix | Adopt through upgrade for Generated audio mix correctness. |
| v1.45.0 | Server extension, sample resources, transform API, cache and conversion/decoder fixes | Adopt core conversion and timestamp fixes. Do not add server or custom-transform extensions; direct decoded Preview resources remain proof-gated in #103. |
| v1.45.1 | Server extension dependency fix | No action because the extension is not installed. |
| v1.45.2 | ID3 parsing fix | Adopt through upgrade. |
| v1.45.3 | Chromium first-key-packet workaround | Adopt through upgrade for export reliability. |
| v1.45.4 | CustomSource rename, MP3 recovery, and Input leak fix | Adopt leak/recovery fixes. YAFFW has no StreamSource compatibility path. |
| v1.45.5 | Server leaks, ISOBMFF track enabling, color metadata, decoder workaround, and UrlSource behavior | Adopt browser/container fixes; server and URL-specific changes require no code. |
| v1.46.0 | Per-frame encode options and VideoSample improvements | No current per-frame encoding decision; adopt diagnostics and performance fixes automatically. |
| v1.47.0 | AudioSample trim, disposal rejection, and Conversion process-order fix | Adopt cleanup and conversion fixes. No direct Preview decode refactor before #103. |
| v1.48.0 | HLS options, decoder preferences, disposal error handling, and contention fix | Adopt disposal/contention fixes. Keep default decoder preference and no HLS path. |
| v1.48.1 | MPEG-TS AVC/HEVC and metadata performance fixes | Adopt through upgrade. |
| v1.49.0 | Logging control and FLAC ID3 | No logging override or FLAC-tag UI is required; this is the prior resolved baseline. |
| v1.50.0 | ProRes formats/extension, custom coder errors, alpha handling, and Conversion audio stability | Let format-derived documented profiles include ProRes under ADR-0024; do not install a decoder extension. Adopt conversion and alpha fixes. |
| v1.50.1 | ProRes bundler fixes/docs | No action because the extension is not installed. |
| v1.50.2 | ProRes Matroska packet fixes | Adopt format correctness through core upgrade. |
| v1.50.3 | ProRes Vite warning fix | No action because the extension is not installed. |
| v1.50.4 | TurboRes performance update | No action because the extension is not installed. |
| v1.50.5 | File-reading stall fix | Adopt through upgrade for local media analysis. |
| v1.50.6 | AVC AUD packet fix | Adopt through upgrade for import/export packet handling. |
| v1.50.7 | Audio resampler crackle fix | Adopt through upgrade for Generated audio mix quality. |
| v1.50.8 | ProRes 12-bit decode fix | No extension decoder is installed. |
| v1.50.9 | WAVE validation, Opus duration, worker stability, subtitle muxing, and Conversion sample cleanup | Adopt WAVE, Opus, worker, and cleanup fixes. Subtitle output remains deferred. |
| v1.51.0 | Composable, pausable, and stepped conversions | No action: one Export job owns one Output, the session has cancellation but no pause command, and no multi-input composition contract exists. |
| v1.52.0 | Expanded Quality/quantizer API, bitrate deprecations, decoder/Input disposal fixes, and alpha metadata | Migrate all YAFFW encoding configuration to `Quality`; adopt cleanup fixes. Quantizer behavior is selected automatically for subjective quality. |
| v1.52.1 | ISOBMFF compressor-name fix | Adopt through upgrade. |
| v1.52.2 | Better canvas-based video resizing | Adopt through upgrade for resized export and video-strip paths. |

## Direct dependency results

"Compatible" includes the repository's seven-day `minimumReleaseAge` and
`trustPolicy: no-downgrade` supply-chain gates. The only age exception is the
issue-mandated `mediabunny@1.52.2`; every other package must pass both gates.

| Direct package | Before | Resolved | Decision |
| --- | ---: | ---: | --- |
| `@hono/node-server` | 1.14.4 | 2.0.11 | Upgrade deliberately to the newest mature v2 release after the retained v1 version failed the production vulnerability audit. v2 keeps the current Hono 4 peer and `serve()` contract; verify package import, server syntax, tests, and build. Hold 2.0.12 for release age. |
| `@radix-ui/react-avatar` | 1.1.10 | 1.2.6 | Update, covered by component/live UI verification. |
| `@radix-ui/react-checkbox` | 1.3.2 | 1.3.11 | Update. |
| `@radix-ui/react-dialog` | 1.1.14 | 1.1.23 | Update. |
| `@radix-ui/react-progress` | 1.1.7 | 1.1.16 | Update. |
| `@radix-ui/react-scroll-area` | 1.2.9 | 1.2.18 | Update. |
| `@radix-ui/react-select` | 2.2.5 | 2.3.7 | Update. |
| `@radix-ui/react-separator` | 1.1.7 | 1.1.15 | Update. |
| `@radix-ui/react-slider` | 1.3.5 | 1.4.7 | Update. |
| `@radix-ui/react-slot` | 1.2.3 | 1.3.3 | Update. |
| `@radix-ui/react-tabs` | 1.1.12 | 1.1.21 | Update. |
| `@radix-ui/react-tooltip` | 1.2.7 | 1.2.16 | Update. |
| `@tailwindcss/vite` | 4.1.10 | 4.3.3 | Update with Tailwind. |
| `@tanstack/react-query` | 5.80.7 | 5.101.4 | Update with devtools. |
| `@tanstack/react-query-devtools` | 5.80.7 | 5.101.4 | Update with Query. |
| `@tanstack/react-router` | 1.121.12 | 1.170.18 | Update and align the pnpm workspace override. |
| `@tanstack/router-plugin` | 1.121.12 | 1.168.23 | Update to its newest published compatible release. |
| `@types/node` | 24.0.1 | 24.13.3 | Update within Node 24. Hold v26 until the repository declares a Node 26 runtime contract. |
| `@vidstack/react` | 1.15.6 | 1.15.6 | Hold exact: npm's `latest` tag points backward to 0.6.15 while 1.15.6 remains the newer `next` line. |
| `axios` | 1.18.1 | 1.18.1 | Hold 1.19.0 until it clears `minimumReleaseAge`. |
| `class-variance-authority` | 0.7.1 | 0.7.1 | Already current compatible. |
| `clsx` | 2.1.1 | 2.1.1 | Already current. |
| `hono` | 4.7.11 | 4.12.32 | Update to newest mature v4; hold 4.12.33 until it clears `minimumReleaseAge`. |
| `lucide-react` | 0.476.0 | 0.476.0 | Hold v1 for a UI-wide icon export/visual migration; current 0.x range is current. |
| `mediabunny` | 1.49.0 | 1.52.2 | Required exact update; narrowly excluded from release age by issue contract. |
| `next-themes` | 0.4.6 | 0.4.6 | Already current compatible. |
| `react` | 19.1.0 | 19.2.8 | Update with React DOM and types. |
| `react-dom` | 19.1.0 | 19.2.8 | Update with React. |
| `react-resizable-panels` | 3.0.3 | 3.0.6 | Update within v3. Hold v4 because its primitive interface requires a workbench resize migration. |
| `sonner` | 2.0.5 | 2.0.7 | Update. |
| `tailwind-merge` | 3.3.1 | 3.6.0 | Update. |
| `tailwindcss` | 4.1.10 | 4.3.3 | Update with Vite plugin. |
| `tailwindcss-animate` | 1.0.7 | 1.0.7 | Already current. |
| `wavesurfer.js` | 7.11.1 | 7.12.11 | Update visual Waveform dependency. |
| `@biomejs/biome` | 1.9.4 | 1.9.4 | Hold v2 until `biome migrate` and changed rule/formatter output are handled as one toolchain migration. |
| `@testing-library/dom` | 10.4.0 | 10.4.1 | Update. |
| `@testing-library/react` | 16.3.0 | 16.3.2 | Update. |
| `@types/react` | 19.1.8 | 19.2.17 | Update to newest mature v19; hold 19.2.18 for release age. |
| `@types/react-dom` | 19.1.6 | 19.2.3 | Update to newest mature v19; hold 19.2.4 for release age. |
| `@vitejs/plugin-react` | 4.5.2 | 4.7.0 | Update within v4. v6 requires Vite 8 and must migrate with it. |
| `jsdom` | 26.1.0 | 26.1.0 | Hold v30: its engine range excludes the current Node 25 runtime. Revisit with a declared supported Node line. |
| `react-doctor` | 0.6.2 | 0.6.3 | Update within declared 0.6 range and run the locked binary instead of bypassing the lockfile with `npx @latest`. Hold 0.9 as a potentially breaking pre-1.0 diagnostic migration. |
| `react-scan` | 0.5.7 | 0.5.7 | Already current. |
| `typescript` | 5.8.3 | 5.9.3 | Update within v5 and address typed-array boundary strictness. Hold v7 for a compiler/toolchain migration. |
| `vite` | 6.3.5 | 6.4.3 | Update within v6. Its supported dependency ranges are pinned to patched `rollup@4.62.2` and `postcss@8.5.23`; hold v8 and plugin-react v6 for a coordinated build migration. |
| `vitest` | 3.2.6 | 3.2.7 | Update within v3. Hold v4 for a runner migration. |
| `web-vitals` | 4.2.4 | 4.2.4 | Hold v6 until the reporting callback contract and soft-navigation behavior are migrated and tested. |

No direct dependency is unused. The TanStack Router override remains necessary
to keep transitive router consumers on one version and is updated to the same
current range as the direct dependency. Security overrides select patched,
mature versions supported by their parents: `rollup@4.62.2` and
`postcss@8.5.23` for Vite/Tailwind, and `diff@8.0.4` for TanStack Router tools.
With these selections, `pnpm audit --prod` reports no known vulnerabilities.

## Sources

- [Mediabunny releases](https://github.com/Vanilagy/mediabunny/releases)
- [Mediabunny 1.52.2 API declarations](https://www.npmjs.com/package/mediabunny/v/1.52.2)
- [Mediabunny Quality API](https://mediabunny.dev/api/Quality)
- [Mediabunny supported formats and codecs](https://mediabunny.dev/guide/supported-formats-and-codecs)
