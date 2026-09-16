# Runtime capabilities over app modes

Browser and desktop distributions should share the same editor model; the core should ask which runtime capabilities are available instead of branching into separate browser-mode and desktop-mode architectures. The first slice can rely on browser capabilities such as Mediabunny and WebCodecs, while a future desktop runtime may provide native FFmpeg, GPU-assisted export, stream-copy, or smart rendering as additional capabilities.

**Consequences**

- Unsupported operations fail because a capability is unavailable, not because the user is in the wrong app mode.
- Export capability can grow from best-effort browser export to precise re-encode, native FFmpeg, or smart rendering without reshaping the editor session model.
- UI may present different available actions per runtime, but editing decisions remain the same.
