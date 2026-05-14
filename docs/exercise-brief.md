# Brief: In-Context Learning Affordances in Claude

## Vision

This prototype demonstrates a learning relationship with Claude that emerges in-context. When a moment of consequence arises in conversation, Claude offers a structured exchange — predict, reveal, reflect — that surfaces what the user actually understands. The exchange leaves behind a node on a new surface: the user's map, a personal record of concepts encountered with Claude. Each node opens into a workshop, a bespoke interactive space for deepening understanding of that concept.

The prototype demonstrates one focused arc: a single concept encountered, captured, and explored. Over time, the map and its workshops could grow into a substrate for spaced revisits, cross-conversation continuity, and richer personalization — but those possibilities are intentionally not the focus of what we're showing here.

## The principles that shaped it

These shaped moment-by-moment decisions throughout the design. They constrain together.

- The artifact is the user's, not Claude's. Concepts on the map represent territory the user has covered, not curriculum imposed on them. The user can challenge, refine, and remove anything.
- The mechanic is visible only when relevant. The affordance does not appear on every message. The system stays out of the way most of the time.
- Calibration matters more than capability. A well-placed affordance beats a more sophisticated affordance fired at the wrong moment.
- Friction is a feature only when its purpose is legible. The user must understand why a slowing-down is being offered. Unjustified friction is just friction.
- Construction beats consumption. The user shapes the artifact through engagement; the system contributes scaffolding but never the user's own articulations.
- Co-construction beats imposition. When in doubt, give the user the move rather than making it for them.
- Honor the user's prior thinking before correcting it. Wrong predictions are usually almost-right; the reveal should locate the gap rather than dismiss the attempt.
- Reversibility is the permission. Any path the user enters must have an obvious exit. The contract is "try this, leave whenever."
- The system disappears in proportion to the user's engagement with the underlying material.
- Plain language over labels. The voice should sound human and direct, not like a product trying to be helpful.
- Quiet typography for system contributions; the user's voice gets the expensive type.
- Warmth, not darkness. Unknown territory feels like an unlit field, not a void.
- Suggestions are reached for, not cleared. The user moves toward an offering rather than away from an imposition.

## What we deliberately don't do, and why

- No "not sure" option in predictions. Productive struggle requires attempting; "your best guess is fine" framing lowers stakes without removing engagement.
- No streaks, scores, badges, XP, or progress bars. The artifact is the progress; the work is the reward. Borrowing extrinsic-motivation mechanics from consumer apps is the failure mode we're designing against.
- No claims of mastery, learning, or comprehension. Concepts are encountered, revisited — never "learned." The user makes their own judgment about understanding.
- No global progress dashboard. The map shows territory, not achievement.
- No pre-populated text in the composer. The composer is the user's space; placing text there blurs a line that should be clean.
- No claim of canonical concept structure. Claude infers concepts and connections per user; users' maps will differ from each other and from a textbook, and that is correct.
- No real-time AI-generated workshop UI in this prototype. The pattern of "spaces generated per concept at runtime" is gestured at but not claimed as built.
- No spaced-repetition scheduler in this prototype. The chrome offers the affordance; the destination is stubbed.
- No mascot, no celebratory animations, no "Great job!" feedback. Adult register throughout.

## The arc of the experience

Someone is working in Claude. They send a message that pattern-matches a fix to a problem they don't fully understand. In response, Claude does something slightly unusual: rather than just performing the requested task, it offers a brief, framed alternative — spend ninety seconds understanding what's actually happening first, and the original task is still available either way. Both paths are real.

If the user accepts the alternative, what follows is small. A single prediction question, with three options or a free-text field. The framing is "your best guess is fine"; the wrong answers reflect real misconceptions, not made-up distractors. After the user commits, Claude reveals what actually happens, honoring the prediction before locating its gap, and ties the reveal back to the user's original task. The user is then invited to write a sentence or two about what stuck. They can skip.

After the exchange, a small card appears in the chat. It names the concept and offers an Open affordance. Claude returns to the original task; the user can ignore the card or click it.

Clicking opens a side panel: a map, mostly empty, with a single illuminated node at the center surrounded by softer ghost nodes representing adjacent concepts. The visual register is warmth and territory rather than checkpoints and progress. The user can hover ghost nodes to glimpse what they might lead to. They can click the central node, which opens a workshop — an interactive space dedicated to the concept just covered, with a visualization the user can manipulate and a chat that's contextually aware.

The workshop orients the user immediately with a framed challenge, a prediction, and a reveal that plays out in the visualization itself. From there, the user can explore. At any moment they can close the side panel and return to ordinary chat.

That's the demonstration. One arc, one concept, one map with one workshop on it. The fuller picture is implied.

## On research

The design's choices were informed by work on long-term retention, concept mapping, and the development of mental models in technical domains. We used the literature to pressure-test our intuitions, not as authority for individual design moves. The prototype's specifics are design judgments, not findings; the literature shaped how those judgments were reached.

## What this could become

A few directions worth naming briefly, without trying to demonstrate them in the prototype:

- Returning to a workshop with spaced cadence — opt-in, with timing tied to the user's stated intent rather than abstract retention curves. The chrome's spaced-repetition control gestures at this.
- Cross-conversation continuity. The map persists; concepts surfaced in one chat become available when relevant in others, with Claude bringing them forward at moments where they apply.
- Concept-specific workshops generated at runtime. The prototype shows one workshop, built once. The longer arc is workshops as concept-tailored generative artifacts.

The longer-term direction is a substrate for an ongoing learning relationship between a user and Claude, with the map as its persistent surface. The prototype shows the first observable moment of that relationship.

## How we'd measure success

Not detailed metrics, but the framing matters. We'd watch for:

- Whether users who encounter the affordance engage with it — and whether engagement correlates with reported value, not just continued use.
- Whether users return to the map and workshops without prompting.
- Whether the design's restraint holds up against the temptation to add streak-style mechanics; whether intrinsic engagement is sufficient over time.
- Whether users feel ownership of the map, including the willingness to challenge and revise what Claude has placed there.

These are framings, not KPIs. The metrics that operationalize them would need to be developed alongside any real ship.