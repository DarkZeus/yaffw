# Preview level metering adapter

Revised by [ADR-0023](./0023-web-audio-preview-audio-engine.md): once the **Preview audio engine** owns preview playback, **Preview level meters** use engine graph taps instead of a separate decoded-sample simulation.

Preview level meters should be fed by a dedicated preview-metering adapter rather than by reading WaveSurfer output or private internals. The adapter translates the engine's per-track and combined graph-tap snapshots into prepared dBFS display state, including channel identity, availability, clip hold, smoothing, and pause/stop decay. The engine graph applies channel handling, **Track volume**, include/exclude, and preview solo before the relevant taps, while all taps remain before global **Preview volume** and mute. The reusable meter component stays signal-agnostic.
