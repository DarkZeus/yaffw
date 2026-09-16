# Editor-next requires a WebCodecs runtime

Editor-next should require a browser/runtime with the media APIs needed for the intended local-first editing workflow, starting with WebCodecs, and should be optimized for Chromium-based browsers. YAFFW is an opinionated personal media editor, so the first slice should block unsupported runtimes clearly instead of degrading into a lower-capability browser app.

**Consequences**

- The app can keep its first export and analysis path focused on the runtime Fuad actually intends to use.
- Unsupported browsers receive a clear unsupported-runtime message before import or editing begins.
- Non-Chromium browsers are supported only when they expose the required standards-based media API surface.
- Compatibility fallbacks such as WebM output or non-WebCodecs export can be added later only if they serve a concrete workflow.
