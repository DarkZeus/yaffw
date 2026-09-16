# Remove bulk download

The product now focuses on browser-local, single-asset editing. Remove standalone bulk download from the repository instead of continuing to preserve its legacy acquisition stack. This supersedes ADR-0007 and the bulk-download preservation and sidebar requirements in ADR-0020.

**Consequences**

- Remove `/bulk-download`, its UI, cookie sessions, URL metadata/download clients, and the download, Twitter/cookie, metadata, and progress-stream server routes used by that surface.
- Remove the app navigation sidebar now that the editor is the only product surface. `/editor-next` continues to redirect to `/`; the removed bulk route returns not found.
- Remove dependencies used only by acquisition. Shared UI primitives and the separate legacy upload, file-serving, and cleanup server utilities remain outside this removal.
- Preserve browser-local import, preview, Selection, export, and Generated media delivery. Downloading Generated media is a Delivery action and remains supported.
- Any future URL import requires an Import adapter producing a Media asset draft; it must not restore the deleted workflow implicitly.
