# Test core model and reducer first

The rewrite should begin with tests around the editor core model and session reducer rather than trying to test every UI detail. The first tests should prove media asset loading transitions, default selection behavior, selection bounds, export eligibility, and export success or failure state.

**Consequences**

- Core behavior can be refactored safely while the new route is still taking shape.
- UI components can remain exploratory during the first slice.
- The existing empty test suite should become meaningful by targeting the new core boundary first.
