# Circuit Handoff

Source: pending_record
Record: continuity-bf70a1a8-31a9-4436-adb4-1fd327ae7125
Kind: standalone

## Goal
Polish the map and especially the workshop surfaces of the in-context learning affordance prototype. Workshop currently captures the mechanics but feels bland — does not yet land the ambition of the original vision (manipulable Promise.all timeline as a real exploration space). Start the next session with the workshop, then come back to map polish.

## Next Action
Open WorkshopView (src/components/prototype/WorkshopView.tsx) with the user in a fresh session. Discuss what the original vision was for the workshop — per PRD §4 / KICKOFF Step 5: per-track outcome pickers (resolve/reject/hang at configurable times), preset scenario buttons ("all resolve" / "one rejects" / "one hangs" / "two reject staggered"), Motion-driven aggregate Promise.all animation that visibly settles or pulses based on the configuration, and the opening predict-reveal where the reveal plays out IN the viz rather than as a text bubble below. Sketch directions together, then implement. Consider widening the side panel to ~720px for workshop view to enable the PRD-spec two-column layout (left viz, right chat). After workshop polish: return to map polish — halo treatment, ghost-node placement, hint animation.

## State
- Working dir: /Users/petepetrash/Code/anthropic/education-labs-takehome-main. Next.js 16, React 19, Tailwind v4, @anthropic-ai/sdk wired, pnpm package manager.
- Build + lint clean (3 pre-existing <img> warnings out of scope).
- Dev server typically on :3001. ANTHROPIC_API_KEY in .env.local.
- KICKOFF Build Step 4 fully shipped — all 7 beats now have live endpoints with NDJSON envelope + Anthropic tool-use + exp backoff via withBackoff (Sonnet 4.6 for prose, Haiku 4.5 for classifier):
  - /api/chat (server-side classifier + affordance prose)
  - /api/prediction-options (data: framing + 3 calibrated options with misconceptionTag truth/allSettled/default-timeout)
  - /api/reveal (streamed: honor-first → name near-miss explicitly → close loop on wrapper task; system prompt enforces ordering)
  - /api/reflection-framing (data: framing line drawing from reveal, ends "or something else that stuck")
  - /api/card-meta (data: framing line + canonical conceptTitle verbatim from registry)
  - /api/ghost-nodes (data: 4 adjacent-concept entries with invitational hints)
  - /api/workshop-opening (data: framing line that orients + names viz configuration)
  - /api/workshop-chat (streamed: concept-aware, has user reflection in context, fresh thread)
  - /api/wrapper-response with afterLearning: true for the post-card "Now — about your wrapper…" continuation
- Predict surface upgraded to PRD §3.2: "Your prediction · 1 of 2" header + End button, numbered option rows with circular badges, free-text textarea ("Answer in your own words…") with Enter-to-submit.
- "End" button on predict/reflect transitions to new "exchange-ended" beat that suppresses downstream beats but preserves the affordance choice pill on the prior message (PrototypeStore.endExchange action).
- Faded "Your prediction · submitted" surface renders in the predict message after submission (PRD §3.3).
- Reflection surface has "Your take" header + End button; placeholder "In your own words…"; Skip + Add to notes (PRD §9 decisions committed: Your take + Add to notes).
- Inline card matches PRD §3.4: lit-asterisk icon (spark-idle.svg) on left, serif conceptTitle, "concept from this conversation" secondary line, ArrowUpRight Open affordance, max-w-[460px], notecard not interface.
- Map: warm radial halo behind central solid node, 4 dashed ghost nodes (live labels + hints from API, registry fallback when API degrades), 12 atmospheric outer-ring dots. Ghost click toggles inline hint banner below the SVG.
- Workshop: chrome bar with back-to-map + serif concept title, live opening framing (registry fallback), same prediction primitive as chat exchange (options reused from arc.predictionOptions), three-track timeline viz STUB (fetch A/B resolved at 200ms, fetch C hanging, Promise.all aggregate "never settles"), inline workshop reveal text after prediction submit, real workshop chat panel at bottom with own composer + streaming (WorkshopChat component, fresh thread).
- Component debug page at /debug renders every prototype component in every meaningful state side-by-side. Uses mock PrototypeStores via exported PrototypeContext + buildMockStore. Scroll fix: uses scroll-area h-full overflow-y-auto since shell pins each route at h-dvh.
- PrototypeStore state grew to carry: predictionOptions, reveal, reflectionFraming, reflection, cardMeta, ghostNodes, workshopOpening. All flow live API → state, with registry fallback as graceful degrade.

## Debt
- Workshop viz is a static stub: fetch A/B/C are hardcoded as two-resolving-one-hanging. No per-track outcome pickers (resolve/reject/hang at configurable times), no preset scenario buttons, no Motion-driven aggregate animation. KICKOFF Step 5 territory. THIS IS THE PRIMARY BLAND-NESS the user wants to address.
- Workshop opening reveal plays out as a text bubble ("Watch the bottom track — the aggregate keeps waiting") rather than IN THE VIZ as animation (per PRD §4: "the reveal plays out in the visualization — the configuration animates or updates to show what actually happens"). This is the core missed-ambition gap.
- Workshop chrome incomplete: missing spaced-rep chip with stubbed schedule confirmation (PRD §4, KICKOFF Step 7) and overflow menu with "Your notes" (editable reflection) + "Remove from map" (destructive with confirmation).
- Workshop layout is single-column inside 480px panel. PRD §4 specifies two-column (left viz / right chat). Consider widening side panel to ~720px when view=workshop, OR keep single-column as a deliberate 480px compromise. SidePanel.tsx currently fixed at w-[480px].
- Map polish remaining (KICKOFF Step 6): halo treatment could be warmer/more lantern-like; ghost-node positions are hand-placed in 4 corners — could feel more atmospheric/intentional; atmospheric outer dots use hand-placed coordinates; ghost-hint animation/transition not yet styled.
- Accessibility pass (KICKOFF Step 8) outstanding: arrow-key nav on prediction options, focus management between surfaces, ARIA roles (radiogroup for predict options, dialog/complementary on side panel verified, button on map nodes), accessible alternative for viz dynamic state.
- Pre-existing chat-hydration race: reloading a /chat/[id] URL bounces to /new because the route effect checks !chat before chat-store finishes hydrating from localStorage. Not a blocker but flagged.
- PRD §9 still unresolved: spaced-rep chip wording (deferred — chip not built), global-nav naming (deferred until copy needs it).
- Lint warnings: 3 pre-existing <img> warnings (Greeting, SparkIndicator, ReflectionCard). Out of scope per handoff brief.
- KICKOFF Step 9 (ship prep) outstanding: Vercel preview deploy, ≤8 min screen-recorded walkthrough, short design rationale doc.
