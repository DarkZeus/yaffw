# Start rewrite with a local-file vertical slice

The rewrite should begin with a separate local-file-only path that runs from media asset draft to media asset, selection, and export job. This deliberately excludes URL imports, Twitter/X cookies, bulk download, server fallback export, and the existing quality modal so the new core model can be proven before legacy acquisition and advanced export behavior are reintroduced.

**Consequences**

- Existing features remain available in the legacy app while the new path is developed.
- The first rewrite milestone is judged by whether the new primitives hold together, not by feature parity.
- Legacy managers and routes should not be refactored in place until the new vertical slice proves the architecture.
