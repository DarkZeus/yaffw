# Remove unused repository scaffolding

The repository maintains the browser-local editor and the standalone NLE editor prototype. Remove the unused legacy upload/file-serving/cleanup server, design exploration artifacts, starter integrations, and UI components with no callers in either editor. Git history retains removed reference material.

This supersedes the legacy server and unused shared UI preservation clauses in [ADR-0025](./0025-remove-bulk-download.md). The server availability described in ADR-0001 and ADR-0010 is now a future option, not a shipped implementation; no current import or export path needs it.

**Consequences**

- Preserve `prototypes/nle/`, its media, dependencies, and verification commands.
- Preserve architectural decisions, current product/design documentation, media fixtures, and playback/export verification tools and evidence.
- Remove the Hono server and its scripts/dependencies, along with Vite's uploads-directory cleanup side effect.
- Remove unused React Query and Web Vitals scaffolding, the production React Scan script, and unused shared UI components/dependencies.
- Remove generated design mockups and starter assets. Keep the app title and manifest aligned with YAFFW.
- Future server-backed import must be an explicit product decision rather than an accidentally retained legacy API.
