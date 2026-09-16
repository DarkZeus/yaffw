# Client-first editor processing

YAFFW is a local-first media editor, so editor processing should run in the browser by default instead of requiring every media asset to be committed to server storage before export. The server remains available for import adapters and explicit fallback jobs, but the core editing path should be modeled around a media asset, editing decisions, and export jobs rather than server file paths.

**Consequences**

- Browser codec and container support become product constraints that must be surfaced clearly.
- Server processing is allowed only when the user or workflow explicitly opts into a fallback.
- URL download, Twitter/X cookies, and other acquisition behavior must stop shaping the editor core.
