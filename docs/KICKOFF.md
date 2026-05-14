# KICKOFF: In-Context Learning Affordances Prototype

Shared snapshot of what we're building, what we've decided, what we've deferred, and how we plan to build it. Pair-coding tight loop — this brief is the anchor when the work drifts.

## What we're building

A functional prototype for Anthropic Education Labs (Design Engineer take-home) demonstrating an in-context learning affordance inside Claude. One concept — the all-or-nothing hang behavior of `Promise.all` when a promise never resolves — is encountered through a structured predict→reveal→reflect exchange inline in chat, captured as a card, opens a personal "map" surface in a side panel, and the central map node opens a "workshop" — a manipulable Promise.all timeline visualization with its own predict-reveal moment. Built on the provided Next.js starter; deployed to Vercel.

**Take-home option: B** — learning through collaboration with Claude (developing domain expertise as a programmer).

Deliverables: deployed prototype URL + GitHub repo + Claude transcripts + ≤8 min screen-recorded walkthrough + short design rationale doc.

## Definition of done

No cuts. Every moment in the arc has to feel right.

- **The affordance** offers the alternative path honestly, never as an ambush. Both buttons produce real Claude responses; "just write the wrapper" produces honest hang-handling code (try/catch outer wrapper around AbortController/timeout — see γ.2 below).
- **The predict beat** lands with calibrated options that map to real misconceptions (allSettled behavior + a default-timeout assumption + the truth). Free-text predictions get a reveal that locates the gap.
- **The reveal** honors the user's prediction before correcting; **explicitly names the related concept** the prediction near-missed (e.g., "your guess maps to how Promise.allSettled behaves"); closes the loop back to the original task.
- **The reflection** is skippable; submitted text becomes part of the artifact.
- **The inline card** reads like a notecard, not a UI element. Open opens the side panel.
- **The map** is visually arresting on first appearance. Warm halo, central solid node, four labeled ghost nodes, scattered dim outer ring. Ghost nodes show hints on click; they don't navigate.
- **The workshop** orients the user into a concrete first interaction within seconds: Claude frames the space, poses the **same prediction as the chat exchange (framed visually — viz preloaded with two-resolving-one-hanging)**, the reveal plays out in the viz itself. From there exploration is real.
- **The principles hold throughout:** warmth not darkness, plain language, no progress-mechanics, user owns the artifact, friction only when legible. (See `exercise-brief.md` for the full principle stack.)

## Constraints

- **Time:** quality-driven, no hard deadline. Polish all five moments.
- **Stack:** Next.js 16 App Router on the provided starter. Tailwind v4, Base UI, Anthropic SDK already wired. Vercel for hosting.
- **Drift risks (from PRD §7):** workshop interior, map elaboration, premature spaced-repetition. Hold the line.
- **Working mode:** pair-coding tight loop. Narrate intent before action; redirect fast.

## Decisions made

### Product / experience

| Decision | Choice |
|---|---|
| Take-home option | **B** — domain expertise through collaboration with Claude. |
| "Just write the wrapper" response (γ.2) | Try/catch *outer* wrapper containing real hang-handling primitives (AbortController + timeout) inside. Honors the literal ask; fixes the real problem; no learning ambush. Wrapper path and learning path converge on the same code shape. |
| Reveal style | Named near-miss. Reveal explicitly names the related concept the prediction near-missed (e.g., "your guess maps to how Promise.allSettled behaves"). For free-text predictions, the system prompt asks Claude to map the user's prose to a registered near-miss concept if possible; falls back to implicit framing if not. |
| Workshop opening prediction | Same answer space as the chat prediction; reframed visually. Viz preloaded with two-resolving-one-hanging. Framing line makes clear we're now *watching* the answer, not re-quizzing. |
| Trigger message | "my Promise.all keeps hanging when one of these api calls doesn't come back. can you wrap it in try/catch so it doesn't lock up the whole request?" — plain-language ask, no code paste. |
| Seed chats | Keep the sourdough/cat/time-travel chats in the sidebar. Provides ambient chat-app context; no conflict with the trigger arc (which fires in a new chat). |

### Architecture

| Decision | Choice |
|---|---|
| Hosting | Vercel. Preview URL per push. |
| Runtime | **Node / Fluid Compute** on all API routes. Drop `runtime = 'edge'` from `/api/chat`. Aligns with current Vercel guidance. |
| Message data model | `Message` gains `id` but stays `{id, role, text}`. |
| State home | Separate `PrototypeProvider` composed under `ChatProvider`. PrototypeProvider owns the arc, the concept, the map, and the side panel; reads ChatStore via `useChatStore()` for chat handlers. |
| PrototypeState persistence | Persist in `localStorage` under `education-labs:prototype-state`. Reload restores the arc exactly where it was. Reset on `/new` navigation for clean fresh starts. |
| Trigger detection | **Server-side classifier** in `/api/chat` using Anthropic tool-use. Fast model (Haiku 4.5). Exponential backoff on transient failures. **Client-side string-match fallback** kicks in if `/api/chat` is unreachable after retries — static affordance prose from the registry, arc state set, demo continues. |
| Concept registry | `src/lib/concepts.ts` — shared module, importable server- and client-side. Each entry: `{ id, triggerCriteria, descriptors }`. `descriptors.title` is the canonical concept title used by card/map/workshop (no drift). `descriptors.fallback.*` carries static content for each beat used (a) as identity descriptors that downstream surfaces reuse, (b) as fallback content if the corresponding beat API degrades. |
| Streaming protocol | **NDJSON envelope**, used on every beat endpoint. First event is always `meta`; then `text` (for streaming endpoints) or `data` (for structured beats); `done` last. Future events: `reasoning` (dev mode), `error` (with `retryable` flag). |
| Structured outputs | **Anthropic tool-use** on every endpoint that returns structured JSON (classifier, prediction-options, ghost-nodes, card-meta, reflection-framing, workshop-opening). `tool_choice: { type: 'tool', name: ... }` forces emission. |
| Model | `claude-sonnet-4-6` for content beats. `claude-haiku-4-5` for the classifier. ModelPicker stays live for ordinary chat outside the trigger arc. |

### Visual / UI

| Decision | Choice |
|---|---|
| Side panel | 480px fixed width, mount inside the chat page (not the global shell — per-chat). Pushes the chat narrower (no overlay). Slide-in 250ms ease-out. Independent scroll for panel vs chat. Mobile out of scope. |
| Map viz tech | **SVG.** Halo via `<radialGradient>`. Dashed ghost-node strokes via `stroke-dasharray`. Atmospheric outer-ring circles scattered via coordinates. Token consistency preserved through CSS-var stroke/fill (`stroke="var(--color-accent)"`). |
| Workshop viz tech | **Tailwind divs + Motion (formerly Framer Motion).** Each track is a flex row with controls + a rail. Marker is a `<motion.div>` with variants for resolve/reject/hang. Aggregate timeline same shape. Real form controls (`<select>`, etc.) for outcome/time pickers — accessibility comes free. |
| Map mechanic | Preset buttons + per-track outcome picker. (Build the workshop's UI; see PRD §4 for layout.) |

### API endpoints

All use Node runtime and the NDJSON envelope.

- **`/api/chat`** — trigger-aware. Server runs classifier (Haiku) on the user message + history → `{ conceptId | null, reasoning }`. Then:
  - If `conceptId` → emit `meta` with `{ isArc: true, conceptId, descriptors }`, then stream affordance prose generation (Sonnet) using the affordance system prompt.
  - Else → emit `meta` with `{ isArc: false }`, then stream a normal chat response.
- **`/api/wrapper-response`** — streamed text. Fires when the user picks "Just write the wrapper". Generates the γ.2 try/catch-with-hang-handling response.
- **`/api/prediction-options`** — `data`. Returns `{ framing, options: [{id, label, isCorrect, misconceptionTag}] }`. Three options: one truth, one allSettled-shaped distractor, one timeout-shaped distractor.
- **`/api/reveal`** — streamed text. Takes the user's submitted prediction in context; honors before correcting; explicitly names the near-miss concept.
- **`/api/reflection-framing`** — `data`. Returns `{ framing }` — invites reflection with concrete candidate angles ending "or something else that stuck".
- **`/api/card-meta`** — `data`. Returns `{ conceptTitle, framing }`. ConceptTitle should match the concept's `descriptors.title` (the prompt is given the title and asked to use it).
- **`/api/ghost-nodes`** — `data`. Returns `{ ghosts: [{ id, label, hint }] }` — four entries.
- **`/api/workshop-opening`** — `data`. Returns `{ framing, options }` — same prediction shape as the original predict beat, but framed as a viz-watching prompt.
- **`/api/workshop-chat`** — streamed text. Concept-aware system prompt; access to the user's reflection if present.

### Resilience patterns

- Every beat endpoint applies **exponential backoff** on transient failures (network errors, 5xx, rate-limit). 3 retries default.
- On persistent failure: client falls back to the concept registry's `descriptors.fallback.*` for that beat.
- For the trigger step specifically: **client-side string-match backstop** on the canonical trigger text — if `/api/chat` is unreachable, client sets arc state locally and uses fallback affordance prose. Demo doesn't hard-fail on flaky connectivity.

## Build sequencing (vertical-slice-first)

Rule: get the full arc reachable end-to-end with rough content by step 3. Polish after.

1. **Foundation** — Add `id` to `Message`. Add the concept registry stub (`src/lib/concepts.ts`) with the Promise.all hang entry and fallback content. Introduce `PrototypeProvider` with `PrototypeState` (arc, concept, map, sidePanel). Lay out the side-panel slot inside the chat page. Migrate `/api/chat` off edge runtime. Set up NDJSON envelope on the client. Pre-populate the trigger message in `/new`'s composer. Wire `localStorage` persistence for PrototypeState + reset on `/new`.
2. **Classifier + minimal affordance** — Wire the server-side classifier in `/api/chat` using tool-use. On arc-firing, emit meta + stream affordance prose. Client receives meta, sets `PrototypeState.arc.beat = 'choosing'`. Render the two-button affordance below the affordance message. Wire `/api/wrapper-response` for the wrapper path. Wire client-side string-match backstop.
3. **End-to-end stub of the arc** — Predict → reveal → reflect → card → side panel opens → map appears (rough) → click central node → workshop appears with stub viz + opening predict-reveal stub. Everything reachable, everything rough. Walk the full arc together.
4. **Iterate beat prompts** in order: prediction-options → reveal → reflection-framing → card-meta → ghost-nodes → workshop-opening → workshop-chat. Each beat gets dedicated prompt iteration. Update fallback descriptors in the registry to match prompt-target content.
5. **Workshop viz polish** — Tracks, presets, per-track pickers, Play animation via Motion. Iterate the workshop-opening predict-reveal until the truth lands viscerally.
6. **Map polish** — Warm halo via SVG radial gradient. Ghost-node placement. Dim outer-ring atmosphere. Hint-on-click behavior.
7. **Chrome details** — Workshop chrome: back-to-map, title, spaced-rep chip with stubbed destination, overflow menu (Your notes + Remove).
8. **Accessibility pass** — Keyboard nav for prediction options (arrow + Enter), focus management between surfaces, ARIA roles, ghost-vs-central distinction beyond color alone, accessible alternative for the workshop viz's dynamic state.
9. **Ship prep** — Vercel preview deploy. Smoke-test the eval path. Record ≤8 min walkthrough. Write the short design rationale doc (the brief is most of it already).

Why vertical-slice-first: gives us the experience of the full arc by step 3, lets us redirect early on connective tissue, and avoids the trap of polishing one beat to perfection while the rest isn't real.

## Open questions, deferred to build

PRD §9 (genuinely unresolved — decide as we go):

- Reflection card's section header label ("Reflect" / "Your take" / "What stuck" / other)
- Reflection submit button label ("Add to notes" / "Capture" / "Save" / other)
- Framing line preceding the inline card ("Got it. Kept this for you:" is provisional)
- Map surface working title ("Your map" is provisional)
- Workshop spaced-repetition chip wording + stubbed-destination behavior
- Ghost-node hint behavior (tooltip vs popover vs inline)
- Global-nav naming if any copy needs it

Build-time decisions:

- Exact prediction option strings and reveal copy (iterate during step 4)
- Map node positions / scatter pattern for the atmospheric ring
- Aggregate Promise.all timeline visual treatment for the three end-states (resolved-at-time, rejected-at-time, pulsing-for-hang)
- Workshop viz dimensions inside the 480px-wide side panel
- Whether `/api/workshop-opening` is its own endpoint or shares with `/api/prediction-options`

## Future-direction hints (gestured at, not built)

Explicitly out of scope for the prototype, but the codebase should gesture at them so the substrate's direction is legible to a reviewer:

- **Workshop caching by concept.** Once generated, reuse for same-concept future encounters. Hint: registry has a structural slot for cached workshop artifacts.
- **Quality-signal feedback loop.** Capture user signals (explicit + implicit) on generated content; re-generate below threshold; keep cached above. Hint: no-op `signal(beatId, kind, value)` call sites at points where signals would be captured.
- **Multi-concept calibration.** Classifier already takes a registry; for this prototype the registry has one entry. Adding a concept = adding a registry entry + writing its fallback descriptors.
- **Cross-conversation continuity** (from the brief). The map persists; concepts surfaced in one chat become available when relevant in others. PrototypeState persistence is per-prototype-instance for now; lifting to per-user is the next step.

## Inputs

- Take-home assignment: `docs/take-home-assignment.md`
- Brief: `docs/exercise-brief.md`
- PRD: `docs/exercise-prd.md`
- Domain glossary: `docs/CONTEXT.md`
- Conversation transcript (mine for context as needed): `docs/conversation-4-transcript.md`
- Starter scaffold: chat shell with streaming Anthropic API wired up, Tailwind v4 tokens, Base UI primitives, localStorage chat persistence.

## Glossary

See `docs/CONTEXT.md` for canonical terms. Quick reminder of the load-bearing ones:

- **The arc** — full user journey (trigger → affordance → exchange → card → map → workshop).
- **The structured exchange** — narrower: predict + reveal + reflect specifically.
- **The wrapper path / The learning path** — the two paths from the affordance.
- **PrototypeState** — umbrella state object (arc, concept, map, side panel).
