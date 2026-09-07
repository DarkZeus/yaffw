# Default exports mix included audio tracks

When a **Media asset** has multiple audio tracks, YAFFW should not rely on the browser's native video element or downstream media players to choose which track is audible. **Audio mix decisions** are editing decisions owned by the **Single-asset editing session**: all audio tracks are included by default at 100% **Track volume**, preview and export use the same mix decisions, and v1 export mixes included audio tracks into one **Generated audio mix**.

**Consequences**

- What the user hears in preview should match the generated media unless **Export review** explicitly says otherwise.
- Auto-fix quiet side is an approved Preview approximation (#109, 2026-09-07): Preview classifies each bounded PCM chunk, while export classifies the full Selection. Audio and Export review explain that stereo placement may differ; explicit channel modes retain consistent placement.
- Mix-capable preview should prepare one decision-agnostic **Preview audio resource** per embedded audio **Media track** for the **Preview audio engine**, derived from the media asset with the local media-processing stack.
- Preview uses bounded, playhead-local PCM from one asset-owned Mediabunny `Input`; the engine primes every audio track concurrently to playable PCM, metadata-proven silence, or explicit failure before playback. It never waits for a full-track decode or Waveform generation.
- The accepted #108 contract retains a 2-second media-time window, replenishes below 1.5 seconds every 50 ms, and batches PCM into chunks no longer than 200 ms. All track chunks use one `AudioContext` epoch and preserve source offsets and timestamp gaps.
- Preview preparation must not retain an intermediate remux Blob, WAV Blob, object URL, second Web Audio decode boundary, or full-track PCM resource. Export still decodes the requested Selection through its separately owned export adapter.
- The engine owns bounded PCM, decoder generations, scheduled nodes, and graph taps. The asset hook owns the provider and input. Pause stops sources and replenishment while retaining the current bounded window; seek, rate changes, routing rebuilds, retry, replacement, and teardown invalidate the affected work and return iterators. Every sample is closed and every obsolete PCM reference released.
- [The #108 investigation](../verification/bounded-preview-audio-window.md) accepted scheduled `AudioBufferSourceNode` chunks without AudioWorklet. [Production adoption #109](../verification/production-preview-audio-window.md) records the integrated measurements and lifecycle verification.
- Preview-only solo belongs to **Preview audio monitoring** and does not affect generated media.
- Excluding all audio tracks is a valid choice and produces generated media with no audio track.
- An included audio track at 0% **Track volume** remains part of the **Generated audio mix** and contributes silence; only exclude removes the track from the mix plan. If every included track is at 0%, export retains a silent generated audio track.
- The **Default output profile** encodes the **Generated audio mix** as AAC, while custom **Output settings** may choose another documented compatible audio codec.
- When **Output settings** use **Preserve source** for audio codec, the **Generated audio mix** uses the codec of the first included source audio track, subject to selected-container compatibility.
- Preserving separate generated audio tracks is a future advanced export behavior, not the default.
- Implementation should start with the editor core/session decision model, then wire preview audio mixing, then wire export audio mixing, so preview and export consume the same **Audio mix decisions**.
