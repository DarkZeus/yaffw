# Freeze bulk download during editor core rewrite

Bulk download should remain in the legacy surface while the editor core rewrite proves the single-asset path. URL acquisition can later return through import adapters, and standalone bulk acquisition can remain outside the editor core, but neither should shape the first media asset, selection, and export job slice.

**Consequences**

- Useful acquisition behavior is preserved without becoming a dependency of the editor core.
- The first rewrite milestone can ignore Twitter/X cookies, metadata previews, batch state, and bulk download progress.
- Future URL import work must produce media asset drafts instead of editor state.
