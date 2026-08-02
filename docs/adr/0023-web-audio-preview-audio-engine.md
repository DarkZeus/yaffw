# Web Audio preview audio engine

Editor-next should replace the hidden `wavesurfer-multitrack` preview transport with a project-owned **Preview audio engine** built on Web Audio. Mediabunny directly prepares one timestamp-aligned full-track `AudioBuffer` **Preview audio resource** per source track. The engine consumes those buffers without an intermediate Blob or `decodeAudioData()` pass, then owns preview playback, multitrack scheduling, channel handling, **Track volume**, include/exclude, preview solo, preview mute, meter taps, and the audio-master clock in one graph. This prevents preview state from being split across a third-party multitrack player, transformed temporary blobs, and separate meter simulation.

WaveSurfer may still render visual **Waveform lanes**, but it should not own preview audio transport. The first implementation uses full-track decoded `AudioBuffer` data for simplicity, while keeping **Preview audio resource** as the broader domain term so chunked resources can replace full-track resources later.

Preparation owns browser decode capability checks, timestamp/gap assembly, cancellation, per-track failure isolation, and retry. The engine owns only ready resources plus explicit failures; a retry regenerates the failed resource through the preparation boundary rather than retaining a second engine-level decode lifecycle.

`wavesurfer-multitrack` should be removed as soon as the preview transport replacement no longer imports it. `wavesurfer.js` may remain only for visual waveform rendering.

This revises [ADR-0022](./0022-preview-level-metering-adapter.md): **Preview level meters** no longer depend on a separate decoded-sample simulation because the **Preview audio engine** provides per-track and combined graph taps.

Each per-track tap branches after channel handling, **Track volume**, and **Preview audio monitoring** gain. A separate branch observes the explicit monitored-output mix before global **Preview volume** and mute. Every branch uses a `ChannelSplitterNode` and one `AnalyserNode` per displayed channel; analyser outputs remain disconnected so metering cannot duplicate audible output. The UI adapter owns smoothing, clip hold, and pause/stop decay, while the engine reports silence whenever its graph is not playing.
