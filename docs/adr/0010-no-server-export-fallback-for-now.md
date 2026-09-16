# No server export fallback for now

The editor-next architecture should not implement or abstract around server-side export fallback yet. Client-side export is the only export path for the current rewrite; unsupported client export should fail clearly rather than silently switching to server processing.

**Consequences**

- The server can still support import adapters, but export behavior remains local-first.
- Future server export can be reconsidered when there is a concrete unsupported workflow worth paying for.
- The first export runner does not need a fallback orchestration layer.
