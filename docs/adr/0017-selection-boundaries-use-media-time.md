# Selection boundaries use media time

Selection boundaries should be stored as half-open media-time timestamp ranges rather than frame numbers, represented internally as integer microseconds. Frame numbers are useful UI labels and frame-stepping helpers, but media containers, WebCodecs, Mediabunny, and FFmpeg all operate on timestamps, and variable-frame-rate media makes frame-number ownership ambiguous.

**Consequences**

- The core model can express selection and playhead positions without assuming constant frame rate.
- Selection duration is always `endUs - startUs`, and the end boundary is exclusive.
- Browser float seconds are converted at the adapter boundary instead of becoming the canonical core representation.
- Frame labels and frame-step commands are derived from metadata or frame analysis rather than becoming canonical selection identity.
- Export runners receive timestamp boundaries and may use frame analysis to prove or improve precision.
