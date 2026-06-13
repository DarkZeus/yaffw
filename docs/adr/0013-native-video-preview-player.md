# Native video preview player

Editor-next should start with a preview player adapter built on the native `<video>` element instead of ReactPlayer. The editor is local-first, import adapters should produce browser-readable media assets before editing, and native video gives direct control over playback facts such as current time, duration, playback rate, volume, muted state, and seeking.

**Consequences**

- Existing custom player UI may be reused or reworked, but ReactPlayer should remain in the legacy editor unless a concrete need appears.
- The preview adapter should expose commands and events to editor-next components rather than leaking DOM refs throughout the core.
- External media providers should be handled by import adapters, not by the editor preview player.
- Normal playback should use sampled authoritative video times plus interpolation for visual playhead motion; the editor session should not update at frame rate.
- Frame stepping should pause playback and seek directly by one frame duration using known or estimated FPS.
