# Web Audio preview audio engine

Editor-next should replace the hidden `wavesurfer-multitrack` preview transport with a project-owned **Preview audio engine** built on Web Audio. Mediabunny prepares source-derived per-track **Preview audio resources** through same-codec remux when possible and decoded WAV fallback when necessary. The engine decodes those resources into full-track `AudioBuffer` data through Web Audio, then owns preview playback, multitrack scheduling, channel handling, **Track volume**, include/exclude, preview solo, preview mute, meter taps, and the audio-master clock in one graph. This prevents preview state from being split across a third-party multitrack player, transformed temporary blobs, and separate meter simulation.

WaveSurfer may still render visual **Waveform lanes**, but it should not own preview audio transport. The first implementation uses full-track decoded `AudioBuffer` data for simplicity, while keeping **Preview audio resource** as the broader domain term so chunked resources can replace full-track resources later.

`wavesurfer-multitrack` should be removed as soon as the preview transport replacement no longer imports it. `wavesurfer.js` may remain only for visual waveform rendering.

This revises [ADR-0022](./0022-preview-level-metering-adapter.md): **Preview level meters** no longer depend on a separate decoded-sample simulation because the **Preview audio engine** provides per-track and combined graph taps.
