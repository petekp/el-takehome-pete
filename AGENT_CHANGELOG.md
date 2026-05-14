# Agent Changelog — deviations from PRD / KICKOFF

> Tracks where the shipped prototype diverges from the original spec. The
> spec is the ground truth for evaluator-facing intent; this file is the
> ground truth for what the code actually does. Future sessions should
> append here whenever a design choice deviates from PRD or KICKOFF.
>
> Authority docs:
> - `docs/exercise-prd.md` — product spec (surfaces, transitions, beats)
> - `docs/KICKOFF.md` — build sequencing + decisions made at kickoff
> - `docs/exercise-brief.md` — original take-home brief

## Current state (2026-05-13)

The prototype ships the full affordance arc end-to-end: trigger → affordance
→ predict → reveal → reflect → inline card → map → workshop. All 7 beats
have live Anthropic endpoints with registry fallbacks. The workshop is a
real interactive Promise.all timeline; the map is a Claude-logomark spark
with 6 surrounding concept pills. PRD §4's two-column workshop is now
honored via a view-aware side panel width.

---

## Deviations

### Map panel header reframed in notebook voice

**Spec (PRD §3.5):** "A small label at the top naming the surface
('Your map' — provisional)" + close affordance. Original conversation
4 sketch session also said: *"the central node IS the title... the
header can be very minimal — maybe just a close button, or 'Your map'
as a quiet label. The concept name appears on the node itself,
prominently."* (transcript line 3825) and *"No artifact-level title in
any dominant way — the concept itself is the focus; 'your map' might
appear as a quiet metadata label."* (line 3881)

**Previous build:** `PanelHeader` rendered an all-caps `YOUR MAP`
eyebrow stacked over a `Promise.all` h2. The h2 duplicated the central
pill's label and set up a section / page-title hierarchy that read as
dashboard chrome. For a first-time viewer encountering the surface,
the eyebrow + concept-name combo was confusing — what was the title,
what was the section?

**Now (map view only):** Drop the h2. `Your map` rendered as a quiet
serif title with a body-voice subtitle: "Concepts you've explored
with Claude collect here." The visualization owns concept identity
(central pill = `Promise.all`); the header does light orienting work
in a notebook register rather than competing for the title role.
Workshop view header unchanged — its h2 carries different weight per
PRD §4 chrome spec, and we already have an internal back-bar.

**Why:** Recovers the original "minimal chrome, the map IS the
interface" intent that drifted in the build, and earns the chrome
that remains by giving first-time viewers a quiet sentence of
orientation rather than an opaque ownership-claim eyebrow.

**Touched:** `src/components/prototype/SidePanel.tsx`.

---

### Concept granularity rolled up

**Spec (KICKOFF §Decisions made, concept registry):** Single concept
`promise-all-hang` with title "How Promise.all handles a hanging promise".

**Now:** Concept id is `promise-all`, title is just "Promise.all". Trigger
criteria stays specific to the hang failure mode (that's how the arc fires
in this conversation) but the parent concept is the umbrella.

**Why:** A specific failure-mode-per-concept doesn't scale — the map fills
with leaves, and we'd need to generate a workshop per leaf. Rolling up to
the parent concept lets one workshop (with multiple presets) span the
sub-behaviors. Also gives short, legible map labels.

**Touched:** `src/lib/concepts.ts`, `src/lib/prototype-store.tsx` (loadFromStorage
now drops arcs pointing at unknown concept ids — defensive against stale
localStorage from the old id).

---

### Side panel widens for workshop view

**Spec (PRD §4):** "Left column: the interactive visualization (most of the
workshop's area). Right column: a chat panel with input at the bottom."

**Previous build:** `SidePanel` was 480px regardless of view; the workshop
stacked vertically in a single column. WorkshopView's own comment
acknowledged this as a compromise: "PRD §4 specifies left/right columns,
but inside a 480px container we stack vertically for usability."

**Now:** Panel width is view-aware — 480px for map, **800px for workshop** —
with a 250ms ease-out transition on both opening and view changes. Workshop
uses a true two-column grid (3fr viz / 2fr chat).

**Why:** PRD-faithful. The viz + predict + chat surfaces need real estate
the 480px container couldn't give.

**Touched:** `src/components/prototype/SidePanel.tsx`,
`src/components/prototype/WorkshopView.tsx`.

---

### Workshop viz: configurable interactive timeline

**Spec (PRD §4, KICKOFF Step 5):** Per-track outcome pickers
(resolve/reject/hang at configurable times), preset scenario buttons,
Motion-driven aggregate animation that visibly settles or pulses, the
opening predict-reveal plays out IN the viz.

**Previous build (Beat 6 stub):** Three hardcoded tracks
(`fetch A/B resolved at 200ms, fetch C hanging`), no pickers, no presets,
no animation. Reveal was a text bubble below the viz.

**Now:** Fully ships KICKOFF Step 5. Configurable per-track outcome
(resolve / reject / hang) + time slider; 4 preset chips (Two resolve · one
hangs / All resolve / One rejects / Two reject · staggered); raf-driven Play
animation (1.6s wall-clock with quadratic ease-out, virtual time overshoots
to 1.25× MAX_TIME so hangs visibly extend past the rail); aggregate row
updates live and per-frame during play. The opening predict-submit snaps
tracks to the truth preset and auto-plays — the reveal IS the viz, with
text reveal demoted to a small caption beside.

**Implementation note:** Uses raf instead of Motion/framer-motion. KICKOFF
mentioned Motion but raf turned out to be sufficient — markers are simple
position interpolations and CSS handles the chrome polish. No additional
animation dependency added.

**Touched:** `src/components/prototype/WorkshopView.tsx` (full rewrite).

---

### Workshop track controls: collapsed slider + marker

**Spec:** Not directly specified. PRD §4 says "Each promise has a configurable
outcome (resolves at time T, rejects at time T, or hangs forever)" and "the
aggregate updates live as the configuration changes."

**Initial implementation:** Two-row per track — rail with animation marker on
top, separate slider + outcome chips on bottom. Two distinct visual elements
showing related-but-different info per fetch.

**Now:** Single composite element per track — the slider thumb IS the
fetch's marker. Drag it to set settle time; during Play it travels to its
settle position. Native `<input type="range">` is visually transparent but
owns keyboard a11y and pointer drag; a custom-rendered marker on top owns
visuals (resolve = filled accent dot, reject = ✕, hang = pulsing).

**Why:** Two markers per row was visually noisy and made the slider feel
like a separate disconnected control. Collapsing them into one element
makes the affordance direct: the thing you see IS the thing you grab IS
the thing that animates.

**Touched:** `src/components/prototype/WorkshopView.tsx` (TrackRow + TrackMarker).

---

### Workshop viz: Promise.all wraps the fetches structurally

**Spec:** Not directly specified.

**Initial implementation:** Promise.all aggregate row was at the BOTTOM of
the timeline, below the fetch tracks (visual "results below the array"
reading).

**Now:** The viz mirrors the code structure:

```
Promise.all([   ← outer container (darker tint, contains aggregate at top)
  fetch A,      ← inner container (lighter, inset, rounded)
  fetch B,
  fetch C,
])
```

Outer container has a subtle gray tint with border. Inner container is
bg-page (warm cream), rounded, padded, visually inset. Aggregate row sits
at the TOP of the outer container — matches how you scan
`Promise.all([…])` in code.

**Why:** The viz should map to the code metaphor explicitly. Having the
aggregate at the top reflects reading order; the inner container being
visually wrapped by the outer makes the "Promise.all contains the
fetches" relationship legible without needing a label that says so.

**Touched:** `src/components/prototype/WorkshopView.tsx` (TimelineViz +
AggregateRow + grid alignment).

---

### Map: pills replacing circles, Claude-mark spark layout

**Spec (KICKOFF Step 6 — Map polish):** "Warm halo via SVG radial gradient.
Ghost-node placement. Dim outer-ring atmosphere. Hint-on-click behavior."
Four ghost nodes around a central solid node, all circles.

**Now:** No halo, no atmospheric dots, no circles. Layout is an
**8-ray asterisk evoking the Claude logomark**:
- Center: solid accent-strong pill with the concept title (clicks → workshop)
- **4 cardinal ghost pills** (N/E/S/W) at the long ray tips — primary
  adjacent concepts
- **2 diagonal ghost pills** (NE/SW) at shorter ray tips — supporting
  concepts
- **2 decorative rays** (NW/SE) with small tip dots, no labels — completes
  the asymmetric burst silhouette without crowding

Ghost pills are dashed-outline rounded rectangles with labels inside. Rays
are drawn as SVG lines with thickness/opacity tiered by importance
(cardinals 1.5px @ 0.45 opacity; diagonals 1px @ 0.3 opacity; decoratives
1px @ 0.22 opacity).

**Why:** The original halo-and-circles aesthetic read as ambient
constellation. The spark layout makes the map feel like a *structured*
concept graph anchored to Claude brand vocabulary — and the explicit rays
communicate "these concepts are neighbors of this one" more directly than
proximity alone.

**Touched:** `src/components/prototype/MapView.tsx` (full rewrite).

---

### Ghost-node count: 4 → 6

**Spec:** PRD §3.5 and KICKOFF set 4 ghost nodes. Registry +
`/api/ghost-nodes` enforced exactly 4 (minItems: 4, maxItems: 4).

**Now:** **6 ghost nodes** with explicit tier ordering — first 4 are
"cardinal" (closest, most directly adjacent) and last 2 are "diagonal"
(supporting context). Tool schema bumped to minItems/maxItems 6; system
prompt coaches the model on tier ordering. New concepts added to the
registry: `Promise.any` (third sibling) and `try/catch with promises`
(loops back to the user's original instinct from the chat).

**Why:** Needed to fill out the asterisk-shaped spark layout. The 2
additional concepts both have real pedagogical value — Promise.any
completes the static-method sibling triad (allSettled / race / any), and
try/catch ties back to the user's original ask in the conversation.

**Touched:** `src/lib/concepts.ts`, `src/app/api/ghost-nodes/route.ts`,
`src/lib/prototype-store.tsx` (slice → 6).

---

## Still outstanding from spec

These are KICKOFF items not yet shipped:

- **KICKOFF Step 7 — Workshop chrome details:** Spaced-rep chip with
  stubbed schedule confirmation; overflow menu with "Your notes"
  (editable reflection) + "Remove from map" (destructive with
  confirmation). Currently the workshop has a simple Back-to-map bar.
- **KICKOFF Step 8 — Accessibility pass:** Arrow-key navigation on
  prediction options; focus management between surfaces; ARIA roles
  beyond the current set; accessible alternative for the workshop viz's
  dynamic state.
- **KICKOFF Step 9 — Ship prep:** Vercel preview deploy, ≤8 min screen
  recording walkthrough, short design rationale doc.
- **PRD §9 deferred decisions:** Spaced-rep chip wording (deferred until
  chip is built); global-nav naming (deferred until copy needs it).

## Known minor issues

- Pre-existing chat-hydration race: reloading a `/chat/[id]` URL bounces to
  `/new` because the route effect checks `!chat` before the chat-store
  finishes hydrating from localStorage. Not user-visible in the demo
  walkthrough.
- 3 pre-existing `<img>` ESLint warnings (Greeting, SparkIndicator,
  ReflectionCard) — out of scope per original handoff brief.

---

## How to append to this file

When making a design choice that deviates from `docs/exercise-prd.md`,
`docs/KICKOFF.md`, or a prior shipped implementation, add a section under
**Deviations** with:
- The spec (or previous build's behavior)
- What changed
- Why (rationale, ideally tying back to a user constraint or design
  principle)
- Files touched

Date entries are intentionally not per-section — append in reverse
chronological order if helpful, otherwise group by surface (concept,
workshop, map, etc.).
