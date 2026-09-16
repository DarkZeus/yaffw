# Frame-precise selection with best-effort export

Editor-next should support frame stepping and frame-based selection as first-class editing workflow features, but the first export runner should be treated as best-effort selected-range export until precision is proven by tests. The legacy FFmpeg path used high-precision timestamps with stream copy, but stream copy does not guarantee exact frame boundaries across codecs and keyframe layouts.

**Consequences**

- The UI may allow frame-level preview and boundary selection before export precision is guaranteed.
- Export capability should distinguish precise re-encode from fast or best-effort range export if that distinction becomes necessary.
- Fixture-based export tests should measure start/end accuracy before the app claims frame-accurate generated media.
- Smart rendering remains a future export-engine capability: re-encode only non-copyable selection edges, stream-copy safe encoded ranges, then mux the pieces into one generated media file.
