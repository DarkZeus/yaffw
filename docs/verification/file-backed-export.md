# File-backed Generated media outcome (#124)

On 2026-11-06, Chromium **151.0.7922.71** with Mediabunny **1.65.2** demonstrated
a repeatable reduction in the whole-observation V8 backing-store maximum with
OPFS output and reserved MP4 metadata; an export-processing peak reduction is
**not established**. **Retain production's buffered export.** The candidate
fails the existing Delivery action/lifecycle contract: deleting staging
immediately after Download cancels the download in both trials, and the retained
File subsequently fails to read with `NotFoundError`.

This completes the issue's explicitly allowed proof/no-adoption outcome after
prerequisite #117. No production alternate runner, storage dependency, fallback,
new product UI, or output-profile restriction is introduced. ADR-0001/0010,
ADR-0011, ADR-0015/0017, and ADR-0021/0024 remain unchanged.

## Measured evidence

[Reproduction and observer definitions](../../verification/file-backed-export/README.md)
describe the browser, fixture recipe, instrumentation, commands and limits.
[Retained evidence](evidence/file-backed-export-2026-11-06.json) contains compact
paired memory/artifact observations, lifecycle failures and actual editor flows.
Raw samples and delivered artifacts remain reproducible in ignored `tmp/`.

Two fresh-page repetitions reverse baseline/candidate order. Both use the same
79,799,371-byte source, `[1.137,13.283)` Selection, AVC output and two included
48 kHz mono AAC source tracks mixed to one stereo AAC track. CBR filler stresses
encoded-byte storage; this does not predict real-world encoding throughput.

| Observation | BufferTarget baseline | OPFS + reserve candidate |
| --- | --- | --- |
| Output bytes | 66,299,331 | 66,363,123 |
| Sampled V8 backing maximum across export, retention, inspection and delivery, trials 1 / 2 | 167.60 / 162.94 MB | 133.62 / 136.28 MB |
| Samples tagged export phase, backing maximum | 101.35 / 96.69 MB | 133.62 / 136.28 MB |
| Runner elapsed, trials 1 / 2 | 380.5 / 320.6 ms | 342.2 / 341.3 ms |
| Maximum BufferTarget capacity | 67,108,864 bytes | No BufferTarget output |
| Encoded mux payload queued before finalize | 66,168,232 bytes | 66,168,232 bytes |
| Final mixed PCM logical size | 4,664,064 bytes | 4,664,064 bytes |
| Retained V8 backing after inspection + forced GC | approximately 8.38 MB | approximately 8.40 MB |

MB above is decimal. The whole-observation sampled maximum reductions are approximately **20.3%
and 16.4%**. Samples tagged export actually show higher candidate maxima;
baseline finalization/output allocation is observed after the phase changes to
retained. CDP heap reads and page phase reads are sequential, not atomic, and
fast finalization can run between polls. Consequently these samples do not
establish a lower export-processing peak. Elapsed times vary; no stable speedup or slowdown is established. These are sampled V8 observations,
**not exact process/RSS peaks or fully bounded memory**. The successful candidate
retains approximately 66 MB on disk until disposal. Post-GC JS backing does not
show a meaningful retained-memory benefit; browser Blob/disk storage is outside
that counter. Inspection reads metadata through BlobSource, and delivery uses
the existing object-URL anchor without a page-JS full artifact materialization.
Browser-managed download memory is unmeasured.

Crucially, seekable output does not bound the current mux path: at the
pre-finalize checkpoint both policies have all **400 video packets** queued
while mixed audio has not yet initialized its mux track. The separate whole
AudioBuffer encoder and fast video copy outrun each other. Reserve removes the
output ArrayBuffer but cannot by itself prevent encoded packet accumulation.
The full-Selection decoder/mixer is unchanged. The final mix is 583,008 stereo
frames at 48 kHz; decoded source PCM, channel transforms and offline rendering
allocate additional native memory not established by CDP. Component payload
counts are not summed as an exact simultaneous total.

Conversion reserves **662** video packets automatically. The independently
added mixed AAC track reserves **919**, using the pinned library's conservative
1024-frame estimate with `1.5× + 64` headroom. Independent ffprobe reads **400
video / 573 audio packets**. Each complete encoded track's hashes, PTS, DTS,
durations and packet sizes match baseline exactly in both trials. The candidate
contains `moov` before `mdat`, usable reserved padding, and two backpatch writes;
maximum observed sink write size is 1 MiB. Metadata remains proportional to
packet count. The estimate is tested for this AAC encoder/runtime, not promised
for arbitrary codecs or inputs.

## End-to-end and failed lifecycle gate

All three actual editor paths pass: CFR, VFR and No audio import, Preview,
selected-range export, explicit Download, external artifact inspection,
Generated media invalidation, Close file, re-import and playback. Export does
not trigger an automatic download. Presented start remains within 40 ms and end
within 100 ms of the requested fixture boundary; the existing best-effort
boundary policy is preserved. Barcode/flash/click artifact evidence is retained;
all eight decoded flash/click events add less than 1 ms A/V error, and
packet parity establishes no changed A/V timing for the large comparison. No
physical speaker/display sync or exact sub-frame endpoint claim is made.

Cancellation during real mixed export, injected quota failure on an actual OPFS
write, and unavailable storage fail explicitly and leave no proof files. Eight
deterministic helper tests additionally cover seek/backpatch, finalized-only
readout, setup quota cleanup, target cancellation, failed writes, idempotent
disposal and packet-count validation.

The UI proof exposes the adoption failure honestly: current invalidation drops
the Blob reference but leaves the temporary file. Proof-owned disposal removes
it only after download completion is observed externally by Playwright. Wiring
that deletion directly to invalidation, Close file, replacement or stale-job
cleanup would permit deletion during an in-flight Delivery action. The separate
large-file race reproduces exactly that unsafe release: existing Download
followed immediately by disposal yields **canceled** and **NotFoundError** in
both runs. The unchanged production Blob path has no new OPFS cleanup obligation.
Automatic cleanup across those product paths is therefore **not adopted or
claimed proven**; the failed gate is the reason for retaining production.

The browser File API permits read failure after deletion of the underlying file
([File error conditions](https://w3c.github.io/FileAPI/#file-error-conditions)).
Returning from `anchor.click()` is not an acknowledged completed file read.
A timeout would not establish that acknowledgement. Upstream documents both
[streaming output](https://mediabunny.dev/guide/writing-media-files) and
[Conversion reservation support](https://github.com/Vanilagy/mediabunny/releases/tag/v1.65.0);
neither supplies application delivery ownership.

## Concrete next step

Before adoption, decide whether the supported Chromium product may use an
explicit Save dialog followed by acknowledged streaming delivery, preserving a
separate user-triggered Delivery action. If the existing anchor Download must
remain, first establish an equally reliable completion/retention contract;
neither indefinite OPFS retention nor a blind timer satisfies cleanup.

With that decision, implement a disposable Generated media artifact whose
ownership transfers from runner to artifact store only for the current job.
Dispose failed/aborted/stale completions and previous artifacts; detach store
identity synchronously before asynchronous cleanup. Add a synchronous export
start guard and controller-identity validation so stale completion cannot
replace the store even when the reducer rejects its event. Give delivery a lease
until acknowledged completion; invalidation/Close file/replacement release their
ownership without deleting leased storage. Handle cleanup failure and crash/
reload orphan recovery explicitly. These are adoption requirements, not features
of this proof.

Separately verify incremental audio submission/video pacing so reserve can
actually drain mux data as tracks advance. Retest the same paired memory and
artifact gates, including multi-minute PCM budgets, quota, cancellation, stale
jobs, rapid Download plus Close file, and every retained output profile. Avoid
claiming bounded export until full-Selection audio itself has a separate budget
or a verified incremental implementation. No additional issue is created here.
