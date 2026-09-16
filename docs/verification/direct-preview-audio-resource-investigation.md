# Direct Preview audio resource investigation

Issue #103 tested whether Mediabunny 1.52.2 can prepare the Web Audio Preview resources directly, without the remux/WAV Blob and object-URL bridge introduced by issue #97.

## Fixtures

Both fixtures are real MP4 containers generated with FFmpeg and inspected with `ffprobe` before browser testing.

| Fixture | SHA-256 | Shape |
| --- | --- | --- |
| `large-two-aac.mp4` | `2123ca575a288b1f3612948df4e22793f4d6b942a97edd2289a5516a378509f6` | 36,057,506 bytes; 120 s H.264; two distinct stereo AAC 48 kHz tracks (440 Hz and 880 Hz) |
| `offset-gap-two-aac.mp4` | `633506430608cca0bc5411a7f522f26fcb545ff326425c5ecc3607cc96c61aba` | 519,518 bytes; 12 s H.264; two mono AAC 48 kHz tracks starting at 0.728 s and 1.478 s; track 2 contains silence from media time 3.478 s through 5.478 s |

The offset fixture was generated from two sine sources using `asetpts=PTS+0.75/TB` and `asetpts=PTS+1.5/TB`; the second source applies zero volume between source time 2 s and 4 s. A preliminary fixture used a missing MP4 packet interval. Mediabunny's MP4 packet and sample sinks normalize that discontinuity into a continuous packet timeline with trailing silence, so both the old remux bridge and direct path see the same normalized timeline. The encoded-silence fixture is the stable gap oracle for this dependency version; the shared assembler also has an automated regression for packet gaps when a format exposes them.

## Browser result

Chromium decoded both fixtures with zero failed tracks. The direct resources retained native track rate/layout and exact analyzed starts:

- offset fixture track 1: mono, 48 kHz, start 0.728 s, decoded duration 9.021333 s;
- offset fixture track 2: mono, 48 kHz, start 1.478 s, decoded duration 8.021333 s;
- large fixture: two stereo, 48 kHz, 120 s resources, 46,080,000 decoded bytes each.

Signal probes over 200 ms windows separated the large fixture by more than four orders of magnitude: track 1 measured about 0.062 at 440 Hz and at most 0.000002 at 880 Hz; track 2 measured about 0.062 at 880 Hz and at most 0.000002 at 440 Hz. In the offset fixture, track 2 measured RMS 0 at media times 3.6 s, 4.0 s, and 4.8 s, while track 1 remained about 0.088 RMS. This proves track separation, non-zero starts, and the intentional silence gap in the produced `AudioBuffer` data.

The live editor loaded the offset fixture, exposed both track strips, and played through the Web Audio audio-master clock. The top-bar and Preview playhead readouts advanced together; 1.5x playback and a one-second seek remained functional. Soloing Audio 1 produced signal only on Audio 1 while Audio 2 read -90 dBFS. Soloing Audio 2 produced -18.1 dBFS on Audio 2 while Audio 1 read -90 dBFS.

## Serial prototype performance and memory

The initial direct-path prototype decoded its tracks sequentially. The table compares that serial prototype with the remux/WAV bridge using the same large fixture in fresh in-app Chromium tabs. Renderer RSS is the combined resident size of the two renderer processes allocated for the tab. It is an observed process-level bound, not resource-exclusive accounting. JS heap omits native `AudioBuffer` storage and is secondary evidence.

| Measurement | Remux/WAV bridge | Serial direct prototype | Difference |
| --- | ---: | ---: | ---: |
| Resource preparation | 99.5 ms | 553.9 ms | +454.4 ms |
| Engine ready | 348.6 ms | 556.9 ms | +208.3 ms (1.60x) |
| Renderer RSS peak growth | 561,008 KiB | 170,864 KiB | -69.5% |
| Renderer RSS growth 10 s after release | 309,888 KiB | 114,720 KiB | -63.0% |
| Observed JS heap peak | 116,130,240 bytes | 149,108,828 bytes | +32,978,588 bytes |

The serial prototype removed two remux output buffers, two compressed per-track Blobs/object URLs, Blob-to-ArrayBuffer copies, and the second Web Audio decode pass. The dominant retained resource remained the unavoidable 92,160,000 bytes of full-track float PCM. Later controlled measurement showed that serial scheduling accounted for about 132 ms inside the direct algorithm; it did not explain the full difference from the native bulk decoder. The table remains historical and is not a measurement of the concurrent implementation.

## Parallel scheduling correction

Production preparation keeps the direct `AudioBuffer` path and starts independent per-track metadata and decode work concurrently. Results are collected in asset-track order, so a later track may finish first without changing resource or failure ordering. The concurrency regression test holds both decode promises open, proves both have started, resolves track 2 before track 1, and verifies the ordered result.

A fresh Chromium validation used a 34,955,625-byte, 120-second H.264 MP4 with distinct stereo AAC 48 kHz tracks at 440 Hz and 880 Hz (SHA-256 `08e17bbe1197a8d5eeb00b15b2266ed5a3bc85e65e609747daa8bb6084f83220`). Both audio strips and the master meter reached ready state with zero failed tracks. The serial table above should not be used to quote current readiness or memory behavior; a controlled head-to-head run is required for new performance figures.

## Lifecycle result

The production boundary and automated tests cover:

- immediate `Input.dispose()` on cancellation, plus scope disposal on success or failure;
- concurrent per-track decode start with deterministic asset-track result ordering;
- sample closure after copy, format errors, and aborts;
- per-track metadata/decode failure isolation and explicit degraded engine state;
- retry through preparation for only the failed track, preserving successful resources;
- stale-result rejection after asset replacement or cleanup;
- engine destruction and dropping all `AudioBuffer` references on active-asset disposal;
- seek, playback-rate, channel routing, metering, and total-failure native-video fallback.

## Decision

The proof succeeds. Preview resources are direct `AudioBuffer` values produced by the shared Mediabunny timestamp assembler. The remux/WAV Blob bridge, object-URL lifecycle, engine `decodeAudioData()` boundary, and engine-level decode retry are superseded and removed.

## Follow-up performance research

### Corrected cause

The concurrent direct path was measured separately on the same class of 120-second, two-stereo-AAC fixture:

- concurrent direct resource preparation: 675.8 ms median;
- serial direct resource preparation: 808.0 ms median;
- concurrent direct engine-ready: 682.1 ms median;
- serial direct engine-ready: 813.9 ms median.

Parallel track scheduling therefore recovered about 132 ms, or 16%, from the serial direct algorithm. It did not recover the native bridge's 348.6 ms engine-ready result.

Phase instrumentation found the remaining cause. Each track produced 5,625 decoded AAC samples. About 656 ms per track was spent in Mediabunny/WebCodecs decode-and-iteration, while copying PCM into the final `AudioBuffer` took only about 13 ms. Metadata, allocation, and the encoded-gap scan were also small.

This matches the browser architecture. WebCodecs pipelines calls to `decode()` on a codec work queue, but exposes no bulk-decode API; Chromium posts each decode request to a sequenced media task runner and each decoded output back to the decoder's execution-context task runner. With 11,250 AAC samples, the direct path crosses the JavaScript/browser boundary thousands of times. See the [WebCodecs processing model](https://w3c.github.io/webcodecs/#codec-processing-model) and Chromium [`AudioDecoderBroker`](https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/modules/webcodecs/audio_decoder_broker.cc).

Mediabunny already feeds several packets ahead. Its `AudioBufferSink` is not a full-track bulk decoder: it yields one short `AudioBuffer` for each decoded sample and retains the same underlying pipeline. See the [Mediabunny `AudioBufferSink` API](https://mediabunny.dev/api/AudioBufferSink).

### Parallelism inside one track

Splitting an AAC track among several `AudioDecoder` instances is technically possible but is not the recommended production fix. The AAC WebCodecs registration marks every AAC chunk as `key`, then explicitly warns that decoding from an arbitrary packet may not produce the expected output. A correct implementation would have to compensate for codec priming and padding, reconstruct timestamps, trim boundary PCM, merge deterministically, and generalize or fall back for other codecs. See the [AAC WebCodecs registration](https://w3c.github.io/webcodecs/aac_codec_registration.html#encodedaudiochunk-type).

The local A/B also shows decoder contention: two simultaneous track decoders improved total wall time by only 16%, not close to 2x. More decoder instances are therefore likely to have sharply diminishing returns on the measured browser and machine. That is an inference from the measurement, not a WebCodecs guarantee.

Moving one decoder per track to a dedicated worker can improve UI responsiveness, but it does not remove the per-output work. `AudioBuffer` is Window-only, so worker PCM would still need to be transferred and copied into the final `AudioBuffer`. The Web Audio working group's open `DecoderSourceNode` proposal identifies these decoder/control/render-thread handoffs as a platform gap; that node is not currently available. See [Web Audio issue #2651](https://github.com/WebAudio/web-audio-api/issues/2651).

### Short-term full-buffer prototype

The least disruptive full-buffer candidate preserves the current final `AudioBuffer` resources and direct assembler while restoring native bulk decode for the common case:

1. Keep independent tracks concurrent.
2. Scan each encoded packet timeline using the existing gap tolerance.
3. For a contiguous track with a supported same-codec output, remux its packets into a minimal single-track Mediabunny `BufferTarget`.
4. Pass `target.buffer` directly to `decodeAudioData()`—without a `Blob`, object URL, `Blob.arrayBuffer()`, or `.slice(0)` copy.
5. Publish only the resulting `AudioBuffer`, existing `startPositionSeconds`, and track identity.
6. Use the current timestamp-aware WebCodecs assembler for packet gaps, unsupported remux/container combinations, or native decode failure.

The Web Audio specification requires `decodeAudioData()` to decode off both the control and rendering threads, explicitly permits several decoding threads to service concurrent calls, detaches the input `ArrayBuffer`, and returns the final `AudioBuffer`. It decodes only the first audio track in a supplied file, which is why a small single-track remux buffer is still required. See the [Web Audio `decodeAudioData()` algorithm](https://webaudio.github.io/web-audio-api/#dom-baseaudiocontext-decodeaudiodata). Mediabunny's `EncodedAudioPacketSource` performs the needed packet copy without decode/re-encode; see [Mediabunny media sources](https://mediabunny.dev/guide/media-sources#encodedaudiopacketsource).

This is not the removed Blob bridge: the intermediate is an exclusively owned in-memory `ArrayBuffer` handed directly to the browser and detached, while the resource retained by YAFFW remains the final `AudioBuffer`. The direct timestamp assembler remains the correctness fallback.

The main tradeoff is cancellation. `AudioDecoder.close()` aborts pending WebCodecs work, while `decodeAudioData()` exposes no abort mechanism. YAFFW can reject stale results and drop the returned buffer but cannot guarantee that an already-started native decode stops consuming CPU. See the [WebCodecs `AudioDecoder.close()` algorithm](https://w3c.github.io/webcodecs/#dom-audiodecoder-close).

Multiple `HTMLMediaElement`/`MediaElementAudioSourceNode` tracks are not an acceptable shortcut for editor transport: their mutual timing is underspecified and varies across browsers. See [Web Audio issue #2652](https://github.com/WebAudio/web-audio-api/issues/2652).

### Short-term prototype acceptance gate

Prototype the hybrid in the investigation harness before changing production or the ADRs. Accept it only if:

- contiguous-track PCM matches the direct path at beginning/end priming regions;
- real packet gaps select the direct fallback and preserve silence;
- non-zero starts, channels, sample rate, duration, seek, playback rate, solo separation, and audio-master sync remain correct;
- partial failure, retry-one-track, stale completion, and cleanup semantics remain intact;
- readiness materially improves over the 682.1 ms concurrent-direct median;
- peak and retained renderer memory are measured rather than inferred;
- the uncancellable native-decode window is explicitly accepted.

If the gate passes, ADR-0021 and ADR-0023 should describe one final resource contract with two preparation strategies: native bulk decode for proven contiguous tracks and timestamp-aware WebCodecs assembly for correctness fallback.

## System-level readiness architecture research (2026-08-02)

### Reframed objective

The current implementation optimizes completion of a large batch: decode every selected audio track into full-duration PCM, then make the Preview audio engine ready. That is stricter than the product needs. The user-visible objective is **correctly mixed audio becoming playable at the current Playhead**, followed by uninterrupted playback and fast seeks. Finishing PCM for media time the user may never visit is not part of that critical path.

The measurement supports this reframing. Each 120-second AAC track decodes in about 656 ms, or roughly 183 times faster than real time. The decoder has ample sustained throughput; readiness is slow because all 120 seconds are required before the first second may play. Full-track PCM also makes memory proportional to duration: the two-track fixture retains 92,160,000 bytes of sample data before browser overhead.

The important metrics should therefore be:

- import-to-audible priming latency at the current Playhead;
- seek-to-audible latency;
- underrun/glitch count during playback;
- main-thread responsiveness while decoding;
- peak and retained PCM bytes;
- audio/video and inter-track synchronization.

Full-track decode completion should remain a diagnostic measurement, not the readiness definition.

### Recommended architecture: a bounded Preview audio window

Replace a full-track `AudioBuffer` Preview audio resource with a disposable, timeline-aware resource provider that yields timestamped `AudioBuffer` chunks for a requested media-time range. This retains the useful work already implemented: Web Audio remains the Preview audio engine, each track still feeds the existing channel-routing/gain/meter graph, the `AudioContext` remains the audio-master clock, and decoded PCM still crosses the engine boundary as `AudioBuffer` data. Only the amount and lifetime of PCM change.

Mediabunny's official advanced media-player example already demonstrates the core mechanism. It creates an `AudioBufferSink`, starts iteration at the current playback time, schedules each short buffer on the `AudioContext` timeline, limits scheduling to about one second ahead, cancels the iterator and stops queued nodes on pause or seek, and derives video time from the audio clock. See the [official example source](https://raw.githubusercontent.com/Vanilagy/mediabunny/refs/heads/main/examples/media-player/media-player.ts) and [Mediabunny media-player example](https://mediabunny.dev/examples/media-player/). Mediabunny documents range iteration and sparse reads as intended sink behavior; its `AudioSampleSink` also pre-decodes a small number of samples ahead rather than requiring a complete track. See [Reading media files](https://mediabunny.dev/guide/reading-media-files) and [`AudioSampleSink`](https://mediabunny.dev/api/AudioSampleSink).

YAFFW's multitrack form should work as follows:

1. Retain the Mediabunny `Input` and per-track sink/provider for the lifetime of the active media asset instead of disposing it after full preparation.
2. On load, play, or seek, begin one new scheduling generation and request a small window at the Playhead for every monitored track. Independent track windows may decode concurrently.
3. Do not start the shared playback epoch until each required track has either supplied its initial window, established that the window is silent, or failed explicitly. This prevents a faster track from becoming audible before a slower track.
4. Schedule every track against the same `AudioContext` epoch and connect its chunk sources to the track's existing routing input. `AudioBufferSourceNode.start()` is defined to schedule playback at an exact context time, and the node is designed for high-accuracy in-memory scheduling. See [Web Audio `AudioScheduledSourceNode.start()` and `AudioBufferSourceNode`](https://www.w3.org/TR/webaudio-1.1/#AudioBufferSourceNode).
5. Keep a bounded look-ahead horizon, initially about one to two seconds, and decode more only as playback approaches the horizon. A 25-100 ms control loop can schedule against the precise audio clock without making timer callbacks themselves the clock. This is the standard Web Audio look-ahead pattern; see [A tale of two clocks](https://web.dev/articles/audio-scheduling).
6. On pause, seek, playback-rate change, channel-routing rebuild, retry, asset replacement, or destruction, invalidate the generation, return its iterators, stop future source nodes, and discard late chunks. Seeking starts a fresh bounded range at the new Playhead.
7. Preserve real packet gaps by adapting the existing timestamp projector to the requested window or by maintaining a lightweight packet-timeline index. A missing range schedules no source and therefore remains silence. Do not reintroduce a full-track packet scan into the initial critical path.

For the measured two-track 48 kHz stereo fixture, a two-second PCM horizon is about 1.54 MB rather than 92.16 MB, before implementation overhead. More importantly, both startup work and retained PCM become proportional to the horizon and track count, not asset duration.

The simplest prototype should follow Mediabunny's example and schedule its short buffers directly. If profiling shows excessive node creation or garbage collection, adjacent timestamp-contiguous samples can be copied into larger 100-250 ms `AudioBuffer` chunks before scheduling. The local copy measurement—about 13 ms for an entire 120-second track—shows that such batching is unlikely to be the dominant cost, but this remains a prototype hypothesis.

### Where workers and AudioWorklet fit

A Dedicated Worker is a responsiveness optimization behind the chunk provider, not the architectural starting point. WebCodecs exposes `AudioDecoder` in `DedicatedWorker`, and `AudioData` is transferable; a worker can therefore demux, decode, batch planar PCM, and transfer bounded buffers without running thousands of decode callbacks on the UI thread. See the [WebCodecs exposure and transfer model](https://w3c.github.io/webcodecs/).

An `AudioWorklet` plus a ring buffer is the stronger renderer if scheduled short buffers exhibit underruns or unacceptable node churn. The Web Audio specification explicitly recommends `AudioWorkletNode` for sample-accurate playback of disk- or network-backed assets, and the W3C WebCodecs synchronized-player sample uses WebCodecs, Web Audio, an AudioWorklet, and `SharedArrayBuffer`. See [Web Audio `AudioBufferSourceNode`](https://www.w3.org/TR/webaudio-1.1/#AudioBufferSourceNode) and the [WebCodecs audio/video player sample](https://w3c.github.io/webcodecs/samples/audio-video-player/audio_video_player.html).

That version has a real deployment cost: efficient worker-to-worklet sharing through `SharedArrayBuffer` requires cross-origin isolation, which the W3C sample calls out and YAFFW does not currently configure. The worklet also needs explicit underrun behavior, ring reset on seek, playback-rate handling, and multichannel output routing. It should follow evidence of glitches in the simpler bounded-buffer prototype, not precede it.

### Other solution families

| Approach | What it improves | Why it is not the primary architecture |
| --- | --- | --- |
| Full-track `decodeAudioData()` hybrid | Likely recovers much of the immediate regression while retaining one full `AudioBuffer` per track | Readiness and PCM memory still grow with asset duration; decode cannot be aborted once started. It is a reasonable short-term bridge, described above. |
| One native media element | Browser owns streaming, buffering, and decode | The HTML track API exposes per-track enable/disable but not per-track gain or samples for independent meters. A single mixed output cannot implement YAFFW's track decisions. See the [HTML `AudioTrack` interface](https://html.spec.whatwg.org/multipage/media.html#audiotrack). |
| One media element per audio track | Gives Web Audio a separate graph input per track without full PCM | The elements retain independent media timelines; robust mutual synchronization is not specified. See Web Audio issue [#2652](https://github.com/WebAudio/web-audio-api/issues/2652). |
| Persistent PCM cache in OPFS | Can accelerate repeat opens and repeated seeks | It does nothing for the first open, may read/write more bytes than decoding the compressed source, and needs identity, versioning, quota, and eviction policy. OPFS is useful for bounded derived-data caches, not as the first fix. See the [File System Standard](https://fs.spec.whatwg.org/#sync-access-handle). |
| WASM audio decoder | Can add unsupported codecs or deterministic codec behavior | WebCodecs already invokes the browser's native codec stack. WASM adds binary size, its own threading/memory design, and PCM transfer; it does not remove the mistaken full-duration readiness gate. |
| Desktop-native decoder | Can provide a future runtime capability with native FFmpeg or platform codecs | It does not solve the Chromium browser path and would create a materially different runtime implementation. It remains a capability option under ADR-0016, not this preview fix. |

Caching can still help at smaller layers. A compact packet/gap index and existing waveform/channel analysis are better cache candidates than complete PCM because they accelerate range lookup and preserve correct scheduling without making storage proportional to uncompressed duration. In-memory decoded chunks should use a bounded least-recently-used window around the Playhead; an OPFS cache should be considered only after repeat-open measurements justify it.

### Staged prototype and acceptance gate

The next investigation should prototype the bounded scheduler without changing the production resource contract first:

1. Adapt Mediabunny's official single-track player loop in the Chromium harness.
2. Add the second track, one shared playback epoch, and the production gain/meter routing inputs.
3. Prime a configurable one- or two-second horizon concurrently across tracks, then measure first-audible latency.
4. Add pause, arbitrary seek, playback-rate changes, non-zero starts, intentional packet gaps, and generation cancellation.
5. Compare direct short-buffer scheduling with 100-250 ms batching. Add a worker only if main-thread traces justify it; add an AudioWorklet only if audio traces show underruns or node churn.

Accept the architecture only if:

- 120-second and substantially longer fixtures have similar priming latency, demonstrating that duration left the critical path;
- both tracks begin from the same media-time epoch and preserve the intentional silence fixture;
- repeated arbitrary seeks do not emit stale audio and return to audible output promptly;
- playback rate, track volume, include/exclude, preview solo, channel routing, per-track meters, combined meters, and muted-video following remain correct;
- partial track failure degrades explicitly without stopping successful tracks;
- no underruns or audible seams occur in a sustained playback run;
- renderer memory stays near the configured horizon rather than full-track PCM size;
- decoding does not create unacceptable main-thread long tasks.

The full-track direct assembler should remain as a correctness oracle and fallback during the prototype. The short-term `decodeAudioData()` hybrid remains useful if a small production patch is needed before the resource-provider change is ready.

### ADR effect

This direction is consistent with ADR-0023's explicit statement that `Preview audio resource` is broader than a full-track buffer and that chunked resources may replace full-track resources later. It conflicts with ADR-0021's stronger requirement that Mediabunny decode each source track into one full-track `AudioBuffer`, so ADR-0021 must be revised or superseded before production adoption. ADR-0023 should then record a bounded, timeline-aware resource contract while preserving the Web Audio engine, audio-master clock, mix graph, metering, and adapter-owned disposal decisions.
