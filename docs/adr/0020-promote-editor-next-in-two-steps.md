# Promote editor-next in two steps

Editor-next should replace the root editor through a two-step cutover: first promote `EditorNextRoute` to `/` while keeping the legacy editor reachable at a temporary route, then remove the legacy editor in a separate cleanup commit after the promoted route is verified. This separates product cutover risk from dead-code removal and supersedes the parallel-route phase from ADR 0003 once editor-next is ready to become the primary editor.

**Consequences**

- `/` becomes the editor-next workbench in the promotion commit.
- `/editor-next` redirects to `/` during the cutover so `/` is the canonical editor URL.
- The promoted editor stays inside the collapsed app sidebar shell so users can still reach non-editor routes such as bulk download; the editor workbench route should override the normal inset page framing.
- The sidebar navigation should point only to canonical product routes during the promotion commit: the primary editor at `/` and bulk download at `/bulk-download`; implementation routes such as `/editor-next` and hidden fallback routes should not appear in navigation.
- The legacy editor stays reachable through a hidden direct `/legacy-editor` route in the normal app sidebar shell only long enough to verify the promoted route and then is deleted in a follow-up commit.
- The editor workbench prototype code may remain in the repository as a reference artifact, but its route should not be available after promotion.
- Legacy editor capabilities that are not part of editor-next are intentionally dropped from the root editor rather than migrated forward; standalone bulk download remains available at `/bulk-download`.
- The cleanup commit should delete the legacy editor stack and its private mediator/manager/types/components once no route imports it, while preserving shared UI atoms, bulk download, generic providers/utilities, editor-core, editor-next, and retained prototype reference code.
