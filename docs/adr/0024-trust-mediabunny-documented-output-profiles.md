# Trust Mediabunny documented output profiles

YAFFW's v1 **Output settings modal** should expose codec/container combinations documented as supported by Mediabunny instead of maintaining a conservative app-owned allow-list. Mediabunny is the browser-local media writing authority for editor-next export; runtime-specific failures should surface as **Export job** failures or profile availability issues, not as preemptive hiding of documented output profiles.

**Considered Options**

- Maintain a small allow-list such as MP4/H.264/AAC plus one WebM profile until every profile has YAFFW artifact tests.
- Trust Mediabunny's documented codec/container support matrix and let export failures reveal runtime-specific gaps.

**Consequences**

- The modal can show the full documented profile set earlier.
- YAFFW does not duplicate Mediabunny's support matrix as product logic.
- Export capability and error reporting must explain runtime/profile failures clearly when a documented profile does not work in the user's browser.
