# Circuit Handoff

Source: saved continuity record
Record: continuity-9fbddaa6-e298-4082-a7dd-20bfec57a95e
Kind: standalone

## Goal
Continue iterating on the chemistry molecular-geometry artifact (visual polish, chip interactions, edge cases).

## Next Action
Wait for user direction, then iterate. Likely candidates: differentiate orbital-lobe hue from lone-pair so they read as distinct chip semantics; tune water default camera angle; exercise the chips manually in the real chat flow.

## State
- Chemistry pivot is shipped end-to-end. All 11 original tasks complete; build passes; smoke-tested in browser.
- Just completed a contrast iteration: lone-pair bumped to #6b46c1 @ 0.62, orbital lobe to #8b6dd5 @ 0.46, angle arc to #5a544c @ 0.85. Angle label simplified to bare text (no container, 500-weight, scale 0.5 x 0.19).
- Fixed a sprite rendering bug: the canvas transparent areas were appearing as a black rectangle due to ACES tonemapping + missing alphaTest. Added toneMapped: false and alphaTest: 0.05 to SpriteMaterial in makeTextSprite.
- /test-molecule page at src/app/test-molecule/page.tsx lets you swap molecules and toggle chips directly, no chat flow needed — much faster for visual iteration than walking the artifact arc.
- Dev environment notes: port 3000 is another local project (Code/maybe), 3001 is for this repo. Browser automation tabs occasionally wander between localhost ports during smoke tests — the /test-molecule page is more reliable than walking through the full chat flow.

## Debt
- Lone pair and orbital lobes share a purple family at similar saturation — they read as one element when both chips are on. Consider shifting orbital lobes to a different hue (teal or amber) for cleaner visual hierarchy.
- Water default camera angle in the chat flow can make the two H atoms appear overlapping on the camera axis. Could rotate the initial molecule orientation 90° around y, or angle the default camera position.
- Lone pair / orbital lobe / bond angle chips have not been exercised manually in the real chat flow yet — only via the /test-molecule page. Worth a pass to confirm they behave correctly inside the prototype-store-driven artifact context.
- Annotation-mode dimming is correctly implemented but has no visible effect on methane+Lewis (no lone pairs to dim). Worth eyeballing on ammonia+Lewis to confirm the fade pattern reads as intended.
- Decision pending: keep /test-molecule page as a dev utility, or strip before any merge to main.
