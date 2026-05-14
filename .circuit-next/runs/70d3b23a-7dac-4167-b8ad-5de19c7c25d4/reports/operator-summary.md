Circuit
⎿ Build needs follow-up. Verification passed, but review requested fixes.

- Worker access: A worker can edit this checkout.
- Result: We've identified a set of explorability enhancements that significantly strengthen the artifact's core claim: that this is an explorable space, not a guided lesson with interactive chrome. The current v3 artifact is calm, well-paced, and pedagogically sound, but its interactivity is largely about choosing between pre-scripted states (toggling representations, advancing through beats, rotating the 3D view). This iteration adds genuine explorability: the user can produce configurations and discover behaviors the artifact's author didn't pre-script.

The criterion these features must meet:
For each feature below, the test is: can the user produce a state, configuration, or insight the artifact wasn't pre-scripted to produce? If yes, the feature crosses the explorability threshold. Implementations that look interactive but only switch between pre-built states do NOT meet this bar and should not be substituted for the features below.

Feature 1: Direct manipulation of lone pair positions.
The user can grab a lone pair in the 3D scene and drag it to a different position around the central atom. The molecule responds in real time:

- Other lone pairs and bonded atoms reposition based on a simplified electron-pair repulsion model. Adjacent groups push away from the dragged lone pair; the overall molecule deforms to accommodate the new configuration.
- The dragged lone pair experiences visible "tension" when placed in geometrically unfavorable positions (e.g., axial in a trigonal bipyramidal arrangement when other lone pairs are equatorial). Tension is rendered as a subtle visual cue: the lone pair's ellipsoid slightly compresses, a soft red/orange glow appears around it, or the molecule's overall bond angles strain visibly.
- When the user releases the drag, the lone pair settles into the nearest stable configuration. The molecule animates back to its equilibrium state. If the user releases at a stable position, the lone pair stays. If at an unstable position, it snaps to the nearest stable one with a brief animation showing the relaxation.

For XeF2 specifically, the stable configurations are: lone pairs in equatorial positions, F atoms in axial positions. Moving a lone pair to an axial position should produce visible strain (the F atoms get crowded, the bond angles compress, the molecule visibly resists). On release, the lone pair returns to equatorial.

Implementation notes:
- A full physics simulation isn't required. A simplified model that approximates VSEPR repulsion is sufficient. Each electron pair (lone or bonded) exerts a repulsion force on every other electron pair; the molecule minimizes total repulsion. Lone pairs exert slightly stronger repulsion than bonded pairs (this is real VSEPR theory).
- The simulation can run on the GPU via three.js or on the CPU. For five-pair systems, CPU is fine; the math is light.
- Dragging should feel responsive. Target 60fps. If the simulation is too expensive to run in real-time during drag, precompute stable configurations and interpolate between them, with strain feedback computed from the drag position relative to stable points.
- The drag interaction should be initiated by clicking and holding on a lone pair, then moving the mouse/finger. Release ends the drag.
- Touch support matters for mobile/tablet use.

Feature 2: Continuous slider for lone pair count.
A control near the 3D viewport that lets the user continuously vary the number of lone pairs on the central atom across the 5-electron-domain row of the VSEPR chart. Slide from 0 to 3 lone pairs and watch the molecule continuously morph:
- 0 lone pairs: trigonal bipyramidal (5 atoms total, 3 equatorial + 2 axial)
- 1 lone pair: see-saw (4 atoms + 1 lone pair, lone pair equatorial)
- 2 lone pairs: T-shaped (3 atoms + 2 lone pairs, both lone pairs equatorial)
- 3 lone pairs: linear (2 atoms + 3 lone pairs, all lone pairs equatorial, atoms axial — this is XeF2)

The slider value is continuous (not stepped). At fractional values (e.g., 2.5), the molecule shows an interpolated state: one of the equatorial positions is in the process of transitioning between an atom and a lone pair, both partially visible. This interpolation is not chemically realistic but it IS pedagogically illustrative — it shows the user how each discrete case fits into a continuous space of configurations.

Visual treatment of the slider:
- A small horizontal slider, positioned below the 3D viewport, with a clear label ("Lone pairs: 3" updating as the user drags).
- Tick marks at integer values (0, 1, 2, 3) with subtle labels showing the geometry name beneath each tick ("trigonal bipyramidal," "see-saw," "T-shaped," "linear").
- Snap-to-tick behavior with a soft pull toward integer values, but the user can hold and stop at intermediate positions.

The slider, like the lone pair manipulation, is independent of the beat sequence. The user can scrub it at any time, including during beats that don't reference it.

Feature 3: Hover-to-inspect on scene elements.
Hovering over any element of the 3D scene reveals contextual information about that element:
- Atoms: element name, atomic number, electron configuration, role in the molecule (central atom, bonded atom).
- Bonds: bond type (single, double, triple), bond length (approximate, in angstroms), bond order, sigma/pi designation if applicable.
- Lone pairs: a small label confirming what it is ("Lone pair on Xe"), with brief explanation if helpful.
- Bond angle indicators (when visible): the angle value in degrees, and the type of angle (axial-equatorial, equatorial-equatorial, etc.).

Hover information appears as a small floating tooltip near the cursor, with a brief delay (200-300ms) before showing. The tooltip is unobtrusive: small type, soft background, no chrome. It disappears when the cursor moves away.

The hover affordance is always active during the artifact's lifetime, not gated to specific beats.

How these features integrate with the existing beat sequence:
The features are additive. They don't replace the bubble-driven beat sequence; they coexist with it. The user can follow the beats and use the features during them, or deviate into pure exploration.

However, one beat should be redesigned to take advantage of the lone pair manipulation: the wrong-answer reveal in the "why equatorial?" prediction (Beat 5 in the current arc). Instead of (or in addition to) Claude verbally explaining why axial placement is unfavorable, the reveal bubble should invite the user to try it. Copy something like: "Want to see why? Try grabbing one of the lone pairs and putting it in an axial position. Watch what happens to the molecule." The user enacts the wrong belief and sees the consequences directly. This is a more powerful reveal than the verbal explanation alone.

The slider can be referenced in Beat 8 or 9 (where the artifact currently mentions that the whole VSEPR row is one consistent story). Copy something like: "You can drag the slider to scrub through the whole row — 0 lone pairs is trigonal bipyramidal, 1 is see-saw, 2 is T-shaped, 3 is linear. Same logic across the row." The user can then scrub and see the unity directly.

The hover affordance doesn't need beat integration; it's ambient.

Negative requirements — explicitly do NOT do these things:
- Do NOT implement these as pre-scripted state machines. The lone pair manipulation must actually respond to arbitrary positions, not snap between a few authored states. The slider must produce continuous interpolation, not discrete jumps. The hover must be computed from the scene, not from a hardcoded lookup table per element.
- Do NOT add a "tutorial" or "how to use these features" overlay. The features should be discoverable through the existing bubble copy (which references them at appropriate beats) and through normal interaction. Tutorials break the friend register.
- Do NOT add achievement, score, or gamification elements based on exploration. No "you tried 5 configurations" badges. The exploration is its own reward.
- Do NOT add a "reset to canonical" button as a prominent UI element. The "Reset view" button in the 3D viewport already resets camera position; if the user has deformed the molecule via lone pair manipulation, releasing the drag should snap it back to equilibrium automatically. No separate reset for molecular state.
- Do NOT make the slider gated or unlockable. It's available from the start.
- Do NOT make the lone pair manipulation feel like a game. The interaction should feel like manipulating a physical model, calm and weighty, not like flicking objects around.
- Do NOT replace the existing beat sequence with the features. The artifact still has its guided arc; these features expand what's possible within and outside the arc.

Visual and interaction notes:
The lone pair manipulation should have a clear visual affordance indicating that lone pairs are grabbable. Options:
- A subtle cursor change to a "grab" cursor when hovering over a lone pair.
- A very faint pulse or breathing animation on lone pairs to suggest they're interactive (use sparingly; too much animation breaks the calm register).
- Hover-to-inspect on a lone pair could include a tiny "drag to move" hint in the tooltip the first time it's hovered.

The first option is probably enough. The cursor change is a standard affordance and doesn't require additional chrome.

The strain feedback when a lone pair is in an unfavorable position should be visible but not alarming. Subtle is the right register. A soft warm-colored glow or a slight pulsing of the strained element. Not red flashing, not error states. The user is exploring, not breaking something.

The slider's snap-to-tick behavior should feel pleasant but not restrictive. The user should be able to overcome the snap and stop at intermediate values with a clear sense of agency. A common pattern is to use a "soft" pull toward integer values that the user can override by holding past the snap point.

Build priority:
1. Hover-to-inspect on all scene elements. Lowest complexity, establishes the explorable grammar immediately.
2. Slider for lone pair count with continuous interpolation between integer states. Medium complexity, big pedagogical payoff.
3. Direct manipulation of lone pair positions with VSEPR-based repulsion model. Highest complexity, highest impact.

If time runs out before #3 is fully working, prioritize getting something of the manipulation feature functional, even in a degraded form: at minimum, the user should be able to click a lone pair and see a brief animation showing it move to an axial position and then back, demonstrating the equatorial preference. The full free-form drag is the goal but a click-to-demonstrate fallback is acceptable.

What this iteration is for:
The pedagogical claim of the artifact is that it's an explorable space, not a guided lesson. The current v3 is excellent at the guided-lesson portion but light on the explorable-space portion. These three features close that gap. They transform the artifact from "a chemistry lesson with interactive visuals" to "a chemistry sandbox with a lesson layered on top." The user can follow the lesson, or they can experiment with the model directly, and both paths produce understanding.

The demo moment that lands the explorability claim is probably the lone pair manipulation: the evaluator sees the user grab a lone pair, move it to an axial position, watch the molecule strain, release, and see it snap back. That single interaction makes the contrast with typical educational interactives unmistakable. Make sure this lands; the rest is supporting infrastructure.

Final thought:
The artifact, with these features, becomes a genuinely new kind of educational object: a parameterized model the user can manipulate, with a friend showing them around it. That's the productizable pattern, applied here to chemistry but generalizable across domains. The features above are the minimum that demonstrates the pattern. They should feel like natural extensions of what's already there, not like a separate "explorable mode" bolted on.: Fixed three blocking errors in src/components/prototype/MoleculeScene.tsx so the already-implemented explorability features (hover-to-inspect, continuous lone-pair slider, lone-pair drag with VSEPR strain) compile and pass `pnpm run verify`: removed an orphan `setDragKey(null)` call in the pointer-up handler (no such state setter existed), converted the molecule→sliderLp reset from a setState-in-useEffect into the React derived-state pattern using a tracked-prop comparison, and changed `let pt` to `const pt` in the drag raycaster.
- Verification: passed.
- Review: requested follow-up fixes.
