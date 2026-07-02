# Preview level metering adapter

Preview level meters should be fed by a dedicated preview-metering adapter rather than by reading directly from `wavesurfer-multitrack` output or private internals. The first adapter should read decoded per-track sample data at the current **Playhead**, apply YAFFW's preview-metering rules, including channel handling, **Track volume**, include/exclude, preview solo, and ignoring global **Preview volume** and mute, while the reusable meter component stays signal-agnostic.
