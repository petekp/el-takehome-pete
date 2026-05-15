# Education Labs take-home — Pete Petrash

A working prototype for the Education Labs take-home assignment. I picked **Option B (learning through collaboration with Claude)** and built a single, deeply considered arc rather than a broad surface area. The brief is in [`docs/take-home-assignment.md`](docs/take-home-assignment.md).

The shipping prototype lives inline in a chat: when Claude detects a moment where a quick fix would let the user move on but skip something worth understanding, it offers a forked affordance — *just answer it* or *let's look at it together*. The learning path opens an inline **artifact**: a 3D molecular geometry scene with a structured predict → reveal → predict → reveal sequence, scaffolded around the user's actual confusion. The artifact closes back into the chat with a short bridge that ties what just happened to the original ask.

## The arc you'll experience

The demo seeds `/new` with a real student's message and her two source materials (a VSEPR chart with handwritten notes, plus her Lewis structure of XeF₂). Press send and:

1. Claude classifies the message against a small concept registry. Match → it emits a warm affordance with two buttons.
2. **"Just the answer, thanks"** routes to an honest answer path (the wrapper).
3. **"Let's look at it together"** opens the inline artifact:
   - A 3D Three.js scene of XeF₂ on the left, click-to-advance bubbles + a stepper on the right.
   - Two prediction beats with multiple-choice + free-text. Each wrong answer routes to a misconception-specific reveal that honors the prior thinking before locating the gap.
   - A strain demo (drag a lone pair axial → feel the resistance).
   - A switch to ClF₃ via a generative row control to extend the rule to a new case.
   - Closes with a 3-layer synthesis (Lewis → VSEPR → molecular geometry) and pointers out.
4. The artifact closes; Claude's next message bridges back to the original task with awareness of what the user did inside the artifact (which predictions, panels explored, rotation, time spent).

The full design rationale — principles, what we deliberately *don't* do, what we'd measure — is in [`docs/exercise-brief.md`](docs/exercise-brief.md). The implementation-facing spec is in [`docs/prd-in-context-learning-prototype.md`](docs/prd-in-context-learning-prototype.md). The deviation log between spec and shipping code is in [`AGENT_CHANGELOG.md`](AGENT_CHANGELOG.md).

> Note on iteration history. Both committed spec docs are pre-pivot — they describe a Promise.all programming-concept scenario, which is what I built through commit `c080bbc`. The chemistry pivot happened in `64d30d1` and the shipping arc is the XeF₂ one above. The story of how we got there is narratable at [`/evolution`](#routes) (see also [`AGENT_CHANGELOG.md`](AGENT_CHANGELOG.md)).

## Quick start

```bash
pnpm install                  # or `npm install`
cp .env.example .env.local    # add ANTHROPIC_API_KEY
pnpm dev                      # http://localhost:3000
```

Without an `ANTHROPIC_API_KEY` the app falls back to canned responses on the affordance and post-artifact bridge — enough to walk the arc, but the warmth in Claude's voice flattens.

```bash
pnpm verify    # tsc --noEmit + eslint
pnpm build     # production build (also typechecks)
```

## Routes

| Path | What it is |
|---|---|
| `/new` | The seeded demo entrypoint. Trigger message + attachments are pre-loaded; press send. |
| `/chat/[chatId]` | A live chat thread. Where the artifact actually renders. |
| `/projects` | Scaffold placeholder from the starter — kept for chrome fidelity. |
| `/artifact-debug` | **Author dev tool.** Jumps the artifact directly into any stage / panel / prediction without running the chat arc. Useful for inspecting state I might gloss over in the video. |
| `/test-molecule` | **Author dev tool.** Plain harness for the Three.js scene — molecule + chip toggles, nothing else. |
| `/evolution` | **Narration page.** Scrubber over the seven-commit evolution of the prototype, with captions on what each phase was wrestling with. ←/→ to navigate. Standalone (no app chrome). |

## Where to look in the code

**The artifact itself**
- `src/components/prototype/Artifact.tsx` — the inline artifact shell, stage machine, stepper.
- `src/components/prototype/MoleculeScene.tsx` — the Three.js scene (XeF₂, XeF₂ axial-strain, ClF₃).
- `src/components/prototype/RepresentationPanels.tsx` — the materials / Lewis / geometry side panels.
- `src/components/prototype/ControlPane.tsx` — chip toggles for bonds / lone pairs / equatorial plane / angles.

**The script and state**
- `src/lib/artifact-script.ts` — the load-bearing piece. Beats, bubble copy, misconception routing, prediction options, resources. Hand-authored because the misconceptions are the craft.
- `src/lib/prototype-store.tsx` — store + reducer for the arc (`opening | choosing | wrapper-response | artifact-active | artifact-resolved | wrapper-followup`).
- `src/lib/concepts.ts` — single concept registry entry + trigger criteria + the canonical trigger message and attachments.
- `src/lib/artifact-interaction.ts` — captures what the user did inside the artifact so the post-artifact chat message can reference it.

**The chat shell (starter code, extended)**
- `src/components/chat/AssistantBody.tsx` — recognizes the `<artifact/>` placeholder in Claude's stream and swaps in the live component.
- `src/components/chat/InputBar.tsx`, `Sidebar.tsx`, etc. — starter chat UI.

**API**
- `src/app/api/chat/route.ts` — Haiku classifier (concept match) + Sonnet for the affordance prose. Returns a multi-block envelope so the client can render text + artifact placeholders.
- `src/app/api/wrapper-response/route.ts` — post-artifact bridge response. Reads the artifact interaction summary so the bridge can reference what actually happened.

## Design rationale

The assignment asks the rationale to touch on six points. The longer-form version lives in the emailed video and doc; here's how each one cashes out in what's in this repo.

### 1. Which option I chose and why

**Option B (learning through collaboration with Claude).** Option A — helping users master Claude itself — felt like an extension of product onboarding. Option B engages the harder problem the assignment names: when AI handles complex tasks autonomously, the user can become a passive observer. The asymmetry between "got the answer" and "understand what just happened" is the gap I wanted to close. The prototype targets a specific failure mode I see constantly in my own use: pattern-matching to a fix without internalizing what the underlying mechanic actually does. The arc is built to be the alternative — *just answer it* stays available, but a one-tap alternative offers ninety seconds of structured engagement first.

### 2. Design process

The arc is a heavily designed object that went through real iteration; you can scrub through it at [`/evolution`](#routes). The condensed version:

1. **Spec first.** I co-authored a [brief](docs/exercise-brief.md) and a [PRD](docs/prd-in-context-learning-prototype.md) before building. The brief is the principles-and-cuts document — what we deliberately *don't* do is doing as much work as what we ship.
2. **Built v1 around `Promise.all` hang behavior** — a real misconception I've watched developers reach for the wrong fix on. Affordance + prediction + reveal + a side-panel concept map + a workshop with an interactive timeline.
3. **Killed the map and side panel.** The map was a *second* learning gesture pulling weight away from the one that mattered. Consolidated everything onto a single inline artifact. (Captured in [`AGENT_CHANGELOG.md`](AGENT_CHANGELOG.md) → "Pivot to inline explainer".)
4. **Pivoted the domain to chemistry.** Programming concepts are abstract — when the viz can't be wrong in a way the user can *see*, the predict-reveal loop has nothing to bite against. Molecular geometry is the opposite: 2D representations lie about 3D arrangement, and the moment you rotate the molecule you feel why the chart's "linear" label is correct. The chemistry version also let me ground the demo in a real student's confusion (Naomi's chart + Lewis structure are checked into `src/attachments/`).
5. **Polish passes** on the artifact's voice, the misconception-specific reveal copy, the click-to-advance rhythm, and the post-artifact bridge back to chat. Several rounds of QA via browser automation feeding back into the design.

### 3. How the design enhances rather than replaces human agency

Every choice in the artifact's chrome was made against this. The receipts:

- **The affordance is offered, not imposed.** Both buttons are real paths; "Just the answer" is honest, not a punishment.
- **An End/exit button is visible at every beat.** The deal is "try this, leave whenever." Reversibility is the permission.
- **The user predicts before Claude reveals.** Predictions are how the system locates the user's actual mental model so the reveal can land at the gap rather than dump a general explanation.
- **Wrong predictions are treated as near-misses.** Each misconception in `artifact-script.ts` has its own reveal copy that echoes the user's own framing back ("the lone pairs are blocking — yes, specifically in the equatorial plane…") before locating where it diverges. The user's prior thinking is the substrate; Claude is the bridge.
- **No streaks, scores, badges, XP, progress bars, or "Great job!"** Adult register throughout. The artifact is the progress; the work is the reward.
- **No claims of mastery or learning.** Concepts are encountered; the user makes their own judgment about understanding.
- **The composer is always live.** Typing into chat at any point exits the artifact. The user's space is never claimed by the system.

The first principle of the brief: *the artifact is the user's, not Claude's.* Everything compounds out of that.

### 4. Learning principles that shaped the work

I treated the literature as pressure-test for design intuitions, not as authority for individual moves. The judgments that map most directly to research:

- **Productive struggle / desirable difficulty.** Predict-before-reveal is the central beat. The brief is explicit: no "not sure" option — productive struggle requires attempting.
- **Misconception-based pedagogy.** Wrong options aren't strawmen. Each maps to a documented misconception (notational vs spatial; "atoms push the lone pairs" inverts the actual relationship; etc.). The taxonomy is in `Prediction1Key` / `Prediction2Key` in `src/lib/artifact-script.ts`.
- **Multiple representations bridging.** Lewis (counts) → VSEPR (spatial arrangement) → molecular geometry (where the atoms sit). The artifact closes by stacking all three so the user can see how they're saying the same thing differently — the synthesis is the load-bearing payoff.
- **Embodied/spatial cognition.** The whole reason for the chemistry pivot. Rotating the molecule is what makes "the lone pairs are in the equatorial plane" mean something. The Three.js scene exists because the 2D chart can't carry this.
- **Generation effect + worked examples.** Predict (generate) → see worked solution → predict again on a new case (ClF₃) → see the rule extend. Two predictions instead of one is interleaving in miniature.
- **Situated learning.** The post-artifact bridge ties the synthesis back to the user's original message so the new mental model attaches to the task they actually came in with.

### 5. How I'd measure success

The framing matters more than the dashboards, so I'm leading with framings; specific metrics fall out of them.

**What we're optimizing for**
- **Affordance engagement** — when the trigger fires, what fraction enters the learning path. But more importantly, whether engagement *correlates* with reported value, not just continued use. (Engaged-but-resentful is failure.)
- **Self-reported understanding shift** — short post-artifact prompt asking whether their mental model changed. Cheap to collect, hard to game.
- **Spillover into the user's own questions** — does the user, in the same session, ask follow-up questions that go *deeper* into the concept rather than around it? Length-of-followup proxies attention.
- **Recurrence without prompting** — does the user opt into the learning path the *next* time it's offered? Acceptance rate over repeated exposures is the realest signal we have for "this is worth it."
- **Ownership feeling** — qualitative: do users describe the explanation in their own words later, or quote Claude? The former is the goal.

**What we're explicitly NOT optimizing for**
- Time-in-app, sessions-per-week, streaks. Borrowed from consumer-engagement playbooks; orthogonal to learning.
- Affordance fire rate. The temptation to surface this more is the failure mode. Calibration matters more than capability.
- Completion rate of the artifact itself. A user who exits at predict-1 because they realized they didn't need the detour is a *success*, not a churn metric.

**Guardrails / negative metrics**
- Bounce / churn following an affordance fire. If users start avoiding the trigger, the system is overreaching.
- "Skip everything" toggle adoption. If meaningful numbers turn the feature off, we miscalibrated.
- Sentiment in feedback flagging the system as condescending. Adult register is non-negotiable.

### 6. How this could scale to millions of users

The current prototype is a single hand-authored arc on a single concept with a hand-built 3D scene. Scaling that "as is" is the wrong frame — the question is which scaffolding generalizes and which specifics need new mechanics underneath them.

**Trigger calibration**
- One concept today, classified by a Haiku call against hand-written `triggerCriteria` prose. At scale the registry becomes a vector index over concept descriptors with a calibration model on top: per-user fire-rate tuning (some users want this often, some never, some only when stuck) and per-message confidence threshold.
- Per-user state of "has seen this concept before / engaged / opted out" feeds calibration. Repeated exposure to the same concept either escalates depth or backs off entirely.
- A user-visible "less of this / more of this" control is part of the contract. Calibration is co-constructed, not inferred.

**Content generation**
- The misconception script for XeF₂ is hand-authored *deliberately* — the misconceptions are the craft and bad pedagogy at scale compounds. The scaling path is to keep that craft for high-traffic concepts and use LLM-authored variants behind human review for the long tail.
- Predict-reveal *structure* is the invariant. A concept template specifies: framing question, 3 misconception slots with expected near-miss type, reveal-1, transfer case, reveal-2, synthesis. LLM fills the slots from a domain corpus + concept descriptor. Reviewers approve before the concept goes live.
- Free-text answers get LLM-classified against the misconception taxonomy at inference time. Cached per (concept, misconception-class) so the reveal copy doesn't regenerate for every user.

**Interactive artifacts**
- The Three.js scene is the expensive part. The scaling thesis is **a library of composable primitives** (3D-object viewer, timeline, simulator, graph, scrubbable diagram) plus an LLM that composes them per concept against a small typed config — closer to Anthropic's Artifacts pattern but specialized for learning. The artifact itself is generative; the primitives aren't.
- Per-concept assets (3D models, simulation parameters) are authored once and cached, not generated per user. Generation happens at the *composition* layer: which primitives, in what order, with what affordances.

**Personalization without lock-in**
- A persistent map of concepts the user has encountered — surfaced when relevant in a future conversation, not pushed on a schedule. Memory is the substrate; the user owns it and can edit it.
- Spaced revisits are opt-in and triggered by the user's stated intent ("I keep forgetting this") rather than abstract retention curves. The system makes revisiting easy; it doesn't nag.

**Cost and latency**
- Affordance prose, prediction options, reveal text are sub-second Sonnet calls — these scale linearly and cheaply with users. The classifier is Haiku — sub-100ms in practice.
- Custom interactive viz per concept is the cost driver. Mitigation: aggressive caching keyed on (concept, misconception-class), shared scaffolds across users, lazy composition only on the concepts that actually fire.
- Fluid Compute makes the streaming endpoints essentially free at idle.

**Quality floor**
- Bad pedagogy compounds at scale in a way bad code doesn't. Required infrastructure: per-concept regression tests against held-out misconception examples, evaluation rubrics for reveals (does it honor the prediction? does it locate the gap? does it tie back to the user's task?), expert review for concepts above a traffic threshold, and a user-facing "this was wrong / this missed me" flag that routes to review.
- Anthropic-specific advantage: Constitutional AI–style evaluations on the *pedagogical* dimension (warmth, honoring prior thinking, no condescension, no false certainty) layered onto the normal capability evals.

**What this turns into product-wise**
- A substrate, not a feature. The map of encountered concepts becomes a thing the user owns across all conversations. Each concept can grow over time as the user revisits it. The affordance is one moment in a much longer relationship — the prototype shows the first observable moment of that.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · Tailwind v4 · Base UI · `lucide-react` · `motion` · `three` · `@anthropic-ai/sdk`. Model defaults: `claude-haiku-4-5` for the classifier, `claude-sonnet-4-6` for everything user-facing.

## Submission notes

- **Live deploy:** linked in the email along with this repo.
- **Walkthrough video + design rationale doc:** emailed alongside.
- **Claude transcripts:** delivered as a separate zip (the `transcripts-bundle/` tree, gitignored to keep the public repo focused). Includes my full Claude.ai conversation history and every Claude Code session that touched the assignment, plus a README mapping sessions to phases.
- **Authored design artifacts in this repo:** [`docs/exercise-brief.md`](docs/exercise-brief.md) (principles + intent), [`docs/prd-in-context-learning-prototype.md`](docs/prd-in-context-learning-prototype.md) (implementation spec), [`docs/KICKOFF.md`](docs/KICKOFF.md) (sequencing + decisions), [`AGENT_CHANGELOG.md`](AGENT_CHANGELOG.md) (spec → shipping deviations).
