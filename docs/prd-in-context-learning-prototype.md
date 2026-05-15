> **Companion:** Product intent and principles are in [`exercise-brief.md`](exercise-brief.md). This file is the implementation-facing spec from the same design session.

> **Take-home prototype:** The starter app seeds `/new` with the canonical user message and attachments so evaluators can run the arc in one send. The brief still describes the north-star: in a shipped product, the composer stays purely the user’s space (no pre-filled prompt text).

---

# PRD: In-Context Learning Affordances Prototype

## 1. Scope and stack

**Built in the prototype:**
- Demo entry on `/new`: canonical trigger message and attachments are **seeded once on mount** so the evaluator can press send immediately (scaffolding only; not the shipped UX pattern — see brief)
- The affordance UI inline in Claude's response (two-button choice, "just write the wrapper" / "think it through first")
- The structured exchange: prediction beat → reveal beat → reflection beat
- The inline card produced at the end of the exchange
- The map surface in a side panel
- The workshop surface in the side panel (replaces map when entered)
- The Promise.all interactive visualization inside the workshop
- The in-context predict-reveal moment within the workshop
- The workshop chrome: back-to-map, concept title, spaced-repetition chip (stubbed), overflow menu containing Your notes and Remove

**Stubbed for the prototype:**
- General affordance-firing / calibration logic beyond the seeded `/new` demo.
- Spaced-repetition scheduling. Chrome captures intent; nothing schedules.
- Persistence across browser sessions. Single arc demo.
- Memory of prior interactions. Not required; the experience is available to any user who sends the trigger.

**Stack:** Built on the starter repo provided by the team (Next.js, prototyping-friendly Claude chat UI). API calls go to the Claude API; everything after the first message is dynamic — the affordance content, the prediction options, the reveal, the reflection prompt, the inline card text, the map's ghost node labels, and the chat inside the workshop are all generated via API calls with appropriate system prompts and guidance. Static fallbacks should exist for cases where API responses degrade, but the demo's primary path is live API.

## 2. Surfaces and transitions

Four surfaces. The transitions carry as much of the design as the surfaces themselves.

**Chat** — the existing Claude chat. The default state. Always reachable via the composer.

**Structured exchange** — inline UI elements appearing within Claude's response in the chat thread. Not a separate screen.

**Map** — a side panel that opens when the inline card is clicked. Replaces nothing; the chat continues alongside in a narrower column.

**Workshop** — replaces the map view in the side panel. Chat continues alongside.

Transitions:

- *Chat → structured exchange*: The user sends the trigger message (after optional edits; seeded text is a shortcut, not a requirement). Claude's response contains the two-button affordance. Clicking "Think it through first" launches the prediction card inline in the response. Clicking "Just write the wrapper" produces an ordinary Claude response with the wrapper code.
- *Structured exchange → card*: After the reflection is submitted or skipped, Claude renders the inline card in the chat. The structured exchange UI collapses.
- *Card → map*: Clicking the Open affordance on the card opens the side panel with the map view.
- *Map → workshop*: Clicking the central node opens the workshop, replacing the map view in the side panel. No interstitial.
- *Workshop → map*: The back-to-map affordance in workshop chrome returns the side panel to the map view.
- *Any surface → chat*: The composer at the bottom of the chat is always active. The side panel can be closed via its own close affordance. Typing into the composer during the structured exchange exits the exchange.

## 3. The five moments in detail

### 3.1 The affordance

Triggered when the evaluator sends the trigger message from `/new` (seeded on mount for the demo; editable before send). Claude's response, generated via API call, contains:

- A short paragraph acknowledging the request and noting that Promise.all has a behavior worth knowing about that might change which fix the user reaches for
- Two buttons rendered at equal weight but with a soft visual lean toward the learning path (the second button has a slightly heavier border)

Committed copy for the buttons:
- `[ Just write the wrapper ]`
- `[ Think it through first · ~90s ]`

Suggested guidance for the API call generating the prose: honor the user's stated approach, explain in one sentence what the alternative offers, give an honest time estimate, do not preview what "thinking it through" entails. The prose should be one or two short sentences.

The prose is generated; the buttons are deterministic UI rendered alongside.

### 3.2 The structured exchange — prediction beat

Inline in the chat thread, beneath Claude's response. The framing question is in Claude's prose ("Say you call Promise.all with three requests, and the second one hangs forever — never resolves, never rejects. Just hangs. What do you think happens? Your best guess is fine."). The prose is generated.

Below the prose, the response surface:

- Header: "Your prediction · 1 of 2" on the left, "End" button on the right
- Three numbered option rows, each with a number badge and a one-sentence option
- A textarea sized to match the row height of an option, placeholder "Answer in your own words…"

No "not sure" option. Three multiple-choice + one free-text.

Options are generated via API with guidance: one correct answer (the all-or-nothing hang behavior), two wrong answers that reflect real misconceptions (one option should map to Promise.allSettled's behavior; another should map to a plausible but incorrect assumption like a default timeout). Length: each option fits on one line at typical reading sizes.

Submission: clicking an option commits that selection. Submitting the free-text textarea (via enter or a submit button — to be decided in build) commits the free-text answer.

End button: exits the structured exchange. The user returns to the chat with no card produced.

### 3.3 The structured exchange — reveal and reflection beat

After submission. The prediction is preserved at the top of the structured surface, visually faded, labeled "Your prediction · submitted." The user's selected option (or free-text answer) is shown in the faded card.

Claude's reveal appears below, generated via API. Guidance for the call:

- The user's prediction is provided as context
- The system prompt must instruct: honor the prediction before correcting it; locate the wrong answer as a near-miss to a related concept (e.g., allSettled's behavior); close the loop by connecting the correct answer back to the user's original task (the try/catch wrapper); keep the response to roughly three short paragraphs

Below the reveal, the reflection card:

- Header (label TBD, options: "Reflect", "Your take", "What stuck") and an "End" button
- Framing line, generated via API based on the conversation context. Guidance: invite reflection by naming a few specific candidate angles the user might focus on, end with "or something else that stuck"
- Textarea sized for 1–3 sentences, placeholder "In your own words…"
- Submit button below the textarea (label TBD, candidates: "Add to notes", "Capture", "Save")

Empty submission is allowed. If empty, no reflection is captured for the artifact, but the exchange completes and the card still appears.

### 3.4 The inline card

After reflection submission or skip. Claude renders a short framing line in the chat (current draft "Got it. Kept this for you:" — provisional, the working spec is "a phrase that signals something durable has been produced, without overclaiming or feeling sentimental"). The framing is generated via API with that guidance.

Below the framing, the card itself. Deterministic UI:

- Small lit-lantern icon (the feature's icon) on the left
- Concept name as a serif title (e.g., "Promise.all behavior") — generated via API based on the conversation
- Secondary line: "concept from this conversation"
- Open affordance on the right, with an outward-pointing-arrow icon

The card should feel like a notecard, not an interface. Width is constrained (max ~460px). After the card, Claude continues with the original task ("Now — about your wrapper. Here's what'll actually catch a hang…") — this is the next API call, generated with the full context of the exchange.

### 3.5 The map

Opens in the side panel when the user clicks Open on the inline card. Chat continues alongside in a narrower column.

The side panel contains:

- A small label at the top naming the surface ("Your map" — provisional)
- A close affordance (X) at the top right
- The map visualization, centered in the panel

The visualization:

- A single solid central node, the concept name (e.g., "Promise.all"), with a soft warm radial halo behind it
- Four immediately adjacent ghost nodes in dashed outlines, labeled with concepts Claude inferred as adjacent (e.g., allSettled, Promise.race, AbortController, timeouts). Labels are generated via API based on the conversation
- An irregular scatter of smaller unlabeled circles at greater distance, in fainter dashed strokes, suggesting territory beyond. Six or so, irregular spacing
- A quiet invitational line below the visualization

Ghost nodes are clickable in the prototype, but with a hint-only behavior: clicking a labeled ghost node should produce a small inline hint (tooltip or popover) of what venturing there would lead to, without actually navigating anywhere. Example: clicking "allSettled" might show "explore how this differs from Promise.all" — phrasing generated via API. The interaction is suggestive, not active. The unlabeled outer dim circles are not clickable; they're atmosphere.

Clicking the central solid node opens the workshop.

## 4. The workshop

Replaces the map view in the side panel when the central node is clicked.

### Layout

- Top chrome: thin bar across the top
- Left column: the interactive visualization (most of the workshop's area)
- Right column: a chat panel with input at the bottom

The visualization and chat are alongside on desktop. Mobile is out of scope.

### Chrome

- Back-to-map affordance on the left (icon + label or icon-only with tooltip)
- Concept title centered or left-aligned: the concept name in serif type
- Spaced-repetition chip: a small calm element showing the concept's current state (default: "no schedule" or similar). Clicking it opens a small affordance to set a schedule. The destination is stubbed — clicking through should show that intent is captured without claiming the schedule is real (a small confirmation message like "we'll let you know when there's reason to revisit" is acceptable as a stubbed response)
- Overflow menu (icon button) on the right, containing:
  - *Your notes*: opens a small slide-out or modal showing the user's reflection for this concept, editable
  - *Remove from map*: destructive, behind confirmation

### Visualization

The Promise.all visualization is to be developed iteratively in the build session. Initial direction:

- Three (or N) promise tracks laid out horizontally as timelines
- Each promise has a configurable outcome (resolves at time T, rejects at time T, or hangs forever)
- A Promise.all aggregate timeline below the tracks shows what happens when the configuration plays
- The aggregate updates live as the configuration changes
- One-click preset scenarios surface specific phenomena ("all resolve", "one rejects", "one hangs", "two reject at staggered times")

The exact mechanics and visual treatment will be explored in the build. Multiple approaches should be prototyped before settling on one.

### Workshop opening behavior

The workshop must orient the user immediately. When the user first enters:

1. The chat panel shows a short framing message from Claude — one or two sentences saying what this space is for ("Here's Promise.all, made manipulable. Let's try something quickly.") — generated via API
2. Immediately following, Claude poses a prediction in the chat using the same structured prediction UI primitive used in the original exchange. The configuration of the visualization at this moment is set to the scenario being predicted about
3. The user predicts
4. The reveal plays out in the visualization — the configuration animates or updates to show what actually happens
5. Claude's chat invites further exploration

This sequence is essential. The user must not land in the workshop and be left to figure out its purpose. The first interaction should be concrete, framed, and reveal the visualization through engagement.

### In-workshop chat

The chat panel is contextually aware of the concept. System prompt should inform Claude that it's in the Promise.all workshop, has access to the user's earlier reflection (if any), and can answer questions about the visualization. The chat is a fresh thread — not a continuation of the original conversation, but with relevant context preserved.

Claude can propose additional predict-reveal moments within the workshop chat at appropriate points. These use the same structured prediction UI primitive.

## 5. Resources and existing patterns

To lean on:

- The side panel system used for artifacts in Claude. The map and workshop both live in what is structurally an artifact-style side panel.
- The multi-step choice UI (numbered options with "or reply directly" escape). The prediction beat uses this pattern. Reuse, don't reinvent.
- Claude's existing visual language: dark theme, serif heading typeface, warm off-white accent, the lit-asterisk Claude icon, the composer treatment.
- The Suggestions surface in the composer (hover-to-preview). Not used directly, but informs the principle.

To stub:

- The affordance trigger beyond the demo seed. Only the `/new` seeded scenario is wired; broader “detect confusion” logic is not built.
- Spaced-repetition scheduling. Chrome captures intent; nothing schedules.
- Memory persistence across sessions.

## 6. Accessibility

Treat this as a required callout, to be fleshed out during build:

- All interactive elements must be keyboard reachable. The structured exchange's prediction options should support arrow-key navigation and Enter to commit, consistent with the existing multi-step choice UI primitive.
- Focus management: when the structured exchange opens, focus moves to the first option. When the card appears, focus moves to the Open affordance. When the side panel opens, focus moves to the panel's primary content. When closing surfaces, focus returns to a sensible point in the previous surface.
- ARIA: proper roles on the structured exchange (likely radiogroup for options), the side panel (dialog or complementary, TBD), the map nodes (button), and the workshop chrome controls. Labels and descriptions should match the visible copy.
- The map's visual treatment (warm halo, ghost nodes, dim outer ring) carries meaning through more than just color/contrast. Ensure ghost-node vs. central-node distinction is communicated through more than fade alone (dashed vs. solid strokes, label presence, etc., already do this — verify).
- The Promise.all visualization should have accessible alternatives for its dynamic behavior. The specifics will be worked out during the visualization build.

## 7. Scope discipline

The three places drift is most likely:

**Workshop interior.** One good visualization with one good predict-reveal moment is enough. If the workshop is growing beyond that, stop.

**Map elaboration.** Single illuminated node, four labeled ghost nodes with hint-only click behavior, scattered dim outer ring. The sparsity is the point.

**Premature spaced-repetition implementation.** Chrome captures intent; nothing schedules.

## 8. Evaluator's experience

The prototype should be experienced linearly but not on rails. The starting state:

- Chat is open on `/new`
- The canonical scenario is already in the composer (and attachments loaded) so a single send starts the arc
- The send affordance is visible

The evaluator should be able to immediately understand: press send, and see what happens. From there, every choice is real.

The two-path affordance must work both ways. Choosing "just write the wrapper" should produce a real wrapper response from Claude — no learning ambush. Choosing "think it through first" enters the structured exchange.

The structured exchange's multiple-choice options must all produce meaningful, calibrated reveals. The free-text option must produce a Claude-generated response that locates the gap between what the user typed and the truth.

The map view should be visually arresting on first appearance.

The workshop should reward exploration. Its opening should orient the evaluator into a concrete first interaction within a few seconds of arriving.

The evaluator should always be able to leave any surface and return to chat.

## 9. Open questions for CC to surface

Decide with the principal when these come up; do not silently choose.

- The label on the reflection card's section header.
- The submit button on the reflection beat ("Add to notes", "Capture", "Save", or other).
- The framing line preceding the inline card ("Got it. Kept this for you:" is provisional).
- The map surface's working title ("Your map" is provisional).
- The exact wording and visual treatment of the workshop's spaced-repetition control and its stubbed-destination affordance.
- The exact behavior of the ghost-node hint (tooltip, popover, inline text, other).
- The naming of the feature in any global-nav context (if it comes up in copy).
