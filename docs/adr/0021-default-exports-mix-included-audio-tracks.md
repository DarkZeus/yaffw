# Default exports mix included audio tracks

When a **Media asset** has multiple audio tracks, YAFFW should not rely on the browser's native video element or downstream media players to choose which track is audible. **Audio mix decisions** are editing decisions owned by the **Single-asset editing session**: all audio tracks are included by default at 100% **Track volume**, preview and export use the same mix decisions, and v1 export mixes included audio tracks into one **Generated audio mix**.

**Consequences**

- What the user hears in preview should match the generated media unless **Export review** explicitly says otherwise.
- Mix-capable preview should prepare one decision-agnostic **Preview audio resource** per embedded audio **Media track** for the **Preview audio engine**, derived from the media asset with the local media-processing stack.
- Mediabunny should decode each selected source track directly into one timestamp-aligned full-track `AudioBuffer`. Preparation must preserve non-zero track starts and leave silent frames for decoded or packet-timeline gaps.
- The Preview audio engine should consume the prepared `AudioBuffer` directly. Preview preparation must not retain an intermediate remux Blob, WAV Blob, object URL, or a second Web Audio decode boundary.
- The direct path was validated in Chromium with Mediabunny 1.52.2 against a 120-second, 36 MB MP4 containing two distinct stereo AAC tracks and a second two-AAC fixture with non-zero starts and an intentional silence interval. See [Direct Preview audio resource investigation](../verification/direct-preview-audio-resource-investigation.md).
- Full-track **Preview audio resources** are adapter-owned browser references and must be released with the active media asset. `AudioBuffer` has no explicit disposal API, so cleanup destroys the engine, aborts preparation, and drops every retained resource reference.
- Preview-only solo belongs to **Preview audio monitoring** and does not affect generated media.
- Excluding all audio tracks is a valid choice and produces generated media with no audio track.
- An included audio track at 0% **Track volume** remains part of the **Generated audio mix** and contributes silence; only exclude removes the track from the mix plan. If every included track is at 0%, export retains a silent generated audio track.
- The **Default output profile** encodes the **Generated audio mix** as AAC, while custom **Output settings** may choose another documented compatible audio codec.
- When **Output settings** use **Preserve source** for audio codec, the **Generated audio mix** uses the codec of the first included source audio track, subject to selected-container compatibility.
- Preserving separate generated audio tracks is a future advanced export behavior, not the default.
- Implementation should start with the editor core/session decision model, then wire preview audio mixing, then wire export audio mixing, so preview and export consume the same **Audio mix decisions**.
