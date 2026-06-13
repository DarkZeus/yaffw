# PROTOTYPE - Audio source bridge

Question: can each embedded audio track become a separate browser-playable source by same-codec remux first, with decoded WAV fallback? Follow-up: can a prepared track repair one-sided stereo captures or be decoded into mono, re-encode changed samples into a compact browser-playable source, and can selected prepared tracks be merged into one playable mixdown source?

Run:

```sh
pnpm run prototype:audio-bridge
```

Open the prototype, select a media file, and inspect the state dump plus the generated audio controls. Delete or absorb this prototype after the bridge decision is validated.

## Verdict

Validated on a 5-minute, 1.14 GB MP4 with two embedded AAC audio tracks. Both tracks remuxed through the `audio-only-mp4` same-codec path into separate playable M4A Blob URLs in near-real time:

- Track 1: 14,020 packets, 7,340,034 bytes, `audio/mp4`
- Track 2: 14,020 packets, 7,340,682 bytes, `audio/mp4`

No WAV fallback was needed for this case. This supports making same-codec per-track remux the preferred preview bridge, with decoded WAV retained as fallback.

## Follow-up controls

The expanded prototype keeps the fast per-track remux path, then lets you:

- create per-track transformed sources using channel repair or mono conversion
- merge selected prepared tracks into compact AAC/M4A plus WAV debug outputs
- choose stereo or mono mixdown output
- choose the transformed-output final peak guard; the prototype defaults to -1 dBFS, while one-sided stereo repair derives a separate channel-compensation gain from the source layout
- choose per-track mixdown channel handling: preserve channels, auto repair one-sided stereo, use left as mono, use right as mono, duplicate left to stereo, duplicate right to stereo, or average channels to mono

For the OBS-style microphone case where a stereo track only has signal in the left channel, use `Auto repair one-sided stereo` first. It detects one active channel plus one effectively silent channel, then resolves to `Use left as mono` or `Use right as mono`. The state dump records both the requested mode and the resolved mode.

The explicit duplicate modes are still available when the desired output must stay stereo:

- `Duplicate left to stereo`: `outL = inL`, `outR = inL`
- `Duplicate right to stereo`: `outL = inR`, `outR = inR`

When audio is unchanged, the prototype still copies/remuxes existing encoded packets into a browser-playable audio-only container. When samples are changed, the prototype decodes to float PCM, applies the channel transform, derives channel-compensation gain for one-sided stereo repair, measures the compensated peak, applies peak-safety gain only when the compensated samples would exceed the selected final peak guard, and then tries to encode AAC/M4A from the peak-safe `AudioBuffer`.

For OBS-style one-sided stereo repair, the channel compensation is derived from the active source channel count and the effective playback channel count. A left-only or right-only source repaired to centered mono/stereo applies `sqrt(1 / 2)`, about -3.01 dB. The resulting peak is data-dependent; in the validated microphone sample this naturally lands around -1.7 dBFS before the final guard needs to do anything.

The transformed source control also writes a WAV debug output from the exact same peak-safe samples. This keeps WAV available for inspection and fallback while proving the production-sized path does not need to persist transformed audio as large PCM WAV files. The state dump records the raw transformed peak, output peak after safety gain, applied peak gain, encoded WAV peak before clamp, and clipped sample count.

The transform path now decodes from the original `InputAudioTrack` with `AudioSampleSink`, not from the generated preview M4A Blob. This specifically tests whether the earlier audible overload came from round-tripping the remuxed preview source through `AudioContext.decodeAudioData`; the JSON debug state records `decoded.decodeSource` and sample-analysis counts for decoded, transformed, rendered, and final output buffers.
