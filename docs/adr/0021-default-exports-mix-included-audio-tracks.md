# Default exports mix included audio tracks

When a **Media asset** has multiple audio tracks, YAFFW should not rely on the browser's native video element or downstream media players to choose which track is audible. **Audio mix decisions** are editing decisions owned by the **Single-asset editing session**: all audio tracks are included by default at 100% **Track volume**, preview and export use the same mix decisions, and the **Default output profile** mixes included audio tracks into one generated AAC audio track.

**Consequences**

- What the user hears in preview should match the generated media unless **Export review** explicitly says otherwise.
- Mix-capable preview should expose each embedded audio track to the multitrack adapter as its own temporary playable audio source, derived from the media asset with the local media-processing stack.
- The first bridge should prefer full-track same-codec remux/copy into a browser-playable per-track audio Blob, avoiding decode/re-encode when the source codec and output container can be played reliably by the runtime.
- If same-codec remux/copy fails or produces a source the runtime cannot play reliably, the bridge should fall back to decoding that track and writing a full-track temporary WAV Blob URL.
- A prototype validated the remux-first bridge on a large MP4 with two embedded AAC tracks, producing separate playable M4A Blob URLs without requiring WAV fallback.
- Temporary preview audio sources are adapter-owned browser resources and must be revoked or otherwise disposed when the active media asset is unloaded.
- Preview-only solo belongs to **Preview audio monitoring** and does not affect generated media.
- Excluding all audio tracks is a valid choice and produces generated media with no audio track.
- Preserving separate generated audio tracks is a future advanced export behavior, not the default.
- Implementation should start with the editor core/session decision model, then wire preview audio mixing, then wire export audio mixing, so preview and export consume the same **Audio mix decisions**.
