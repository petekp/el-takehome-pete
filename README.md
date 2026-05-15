# Education Labs take-home

Pete Petrash · Option B: **learning through collaboration with Claude**

This repo contains a working prototype of an agency-preserving learning pattern inside a Claude-style chat. In this demo, when the incoming message matches a molecular-geometry confusion where a quick answer could skip something worth understanding, Claude offers a fork:

- **just answer it**: Claude gives the direct answer.
- **let's look at it together**: Claude opens an inline interactive artifact.

The shipped artifact is a short XeF2 molecular-geometry walkthrough grounded in a real student's question, VSEPR chart, and Lewis structure. The goal is not to make Claude a tutor. The goal is to help the learner repair a half-right mental model through prediction, manipulation, and transfer.

Live prototype: https://el-labs-takehome-pete.vercel.app

## What To Try

1. Open `/new`.
2. Press send on the preloaded chemistry question and attachments.
3. Choose **let's look at it together**.
4. In the artifact:
   - answer the two prediction questions,
   - rotate the molecule,
   - drag a lone pair toward an axial position,
   - compare Lewis vs. Molecular geometry,
   - use the 5-domain row selector after the ClF3 reveal.
5. Click **Done** to return to chat. Claude's follow-up receives a compact summary of what happened inside the artifact, so it can continue from the user's actual path rather than a generic close.

The direct-answer path also works. That matters: learning is invited, not forced.

## Why This Fits The Assignment

The assignment asks for a prototype that helps users actively learn and develop skills while working with AI. This prototype focuses on **cognitive engagement**: instead of letting Claude simply answer a chemistry question, the artifact asks the learner to make a prediction, shows where the prediction does or does not match the 3D reality, and then asks them to transfer the rule to a nearby molecule.

The core learning target is representation literacy:

- **Lewis structure** tells the count of bonds and lone pairs.
- **VSEPR** explains the spatial arrangement of electron domains.
- **Molecular geometry** names where the atoms end up.

The student's original intuition was that the lone pairs were "blocking" bonds. The artifact treats that as a useful near-miss, not a failure: the lone pairs are taking up space, but the important question is where in 3D they sit.

## What The Prototype Demonstrates

- **Human agency**: the user can choose the direct answer, enter the artifact, step backward, leave, or return to chat.
- **Prediction as diagnosis**: the questions are not a quiz. They locate the user's mental model so the reveal can address the actual gap.
- **Manipulable explanation**: the user can rotate the molecule, inspect representation modes, and drag a lone pair into a strained position.
- **Transfer**: after XeF2, the artifact asks about the 5-domain / 2-lone-pair case and reveals ClF3 as T-shaped.
- **Representation trust**: the chemistry rendering was tightened around details that matter, including the Lewis layout, the 180 degree F-Xe-F annotation, and the row-selector framing.
- **Post-artifact continuity**: closing the artifact forwards a small interaction summary to Claude, including predictions, panels explored, rotation engagement, and time in the artifact.

## How Claude Is Used

- `claude-haiku-4-5` classifies whether the incoming message matches the molecular-geometry concept.
- `claude-sonnet-4-6` writes the in-chat affordance and direct-answer / post-artifact follow-up.
- The 3D artifact itself is deterministic where trust matters: molecule geometry, prediction branches, row states, and visual treatments are controlled by the app.
- When the artifact is present in chat history, the app sends Claude a host-context annotation instead of a raw `<artifact/>` tag, so Claude can refer to the real rendered surface without hallucinating or apologizing.

This is the intended split: Claude handles language, timing, and conversational continuity; the app owns the high-trust interactive substrate.

## Local Development

```bash
pnpm install
cp .env.example .env.local    # add ANTHROPIC_API_KEY
pnpm dev                      # http://localhost:3000
```

Useful checks:

```bash
pnpm verify    # tsc --noEmit + eslint
pnpm build     # production build
```

Without an `ANTHROPIC_API_KEY`, the scaffold falls back to canned chat output. The artifact can still be inspected, but the live Claude affordance and follow-up are the intended experience.

## Routes

| Path | Purpose |
| --- | --- |
| `/new` | Seeded evaluator entrypoint. Press send to start the arc. |
| `/chat/[chatId]` | Live chat thread where the artifact renders. |
| `/artifact-debug` | Authoring harness for jumping to artifact stages. |
| `/test-molecule` | Authoring harness for the Three.js molecule scene. |
| `/evolution` | Standalone narration page showing the prototype's commit-by-commit evolution. |

## Design Rationale, Condensed

**Option chosen:** Option B. I chose it because it names the tension I feel most sharply in AI work: how do we amplify output without helping people "lose the plot"? The prototype targets moments when Claude could simply answer, but a small act of prediction or manipulation would help the user leave with a stronger model.

**Process:** My process was product design first, design engineering second. I narrowed the problem from broad "AI learning" to one in-context affordance: Claude notices when the user is about to skip over a useful mental model, then offers a lightweight detour without taking over the conversation. I explored the major moments in low fidelity, pressure-tested the shape against Claude's existing chat and artifact patterns, wrote a design brief and requirements handoff, built the smallest complete arc, and then iterated through real use: target-user feedback, second-model critique, browser QA, and design-engineering passes where trust, pacing, or personalization broke. The Promise.all-to-chemistry pivot was not the process; it was one outcome of the process.

**Agency:** The affordance is an offer, not an intervention. The direct-answer path is real; the user can enter the artifact, step backward, manipulate the model, leave, or return to chat. The artifact avoids scores, streaks, badges, mastery claims, and forced completion because those shift authority back to the product. Wrong answers are treated as near-misses: useful evidence of how the learner is thinking, not failures to be graded.

**Learning principles:** The core loop is predict before reveal: ask for a best guess, preserve what the user said, then show the gap. Reveals are misconception-specific, not generic; they honor the user's prior thinking before relocating it. The 3D molecule is manipulable because the lesson should live in the action, not only in the narration: rotate it, switch representations, drag a lone pair into an unfavorable position, and watch the model resist. The main conceptual frame is representation literacy: Lewis structure gives the count, VSEPR gives the spatial arrangement, and molecular geometry names where the atoms end up. The final ClF3 beat tests transfer to a nearby case rather than asking the user to memorize XeF2 in isolation.

**Measurement:** I would look for opt-in rate, self-reported understanding shift, transfer to nearby cases, return usage without nagging, and whether follow-up questions get deeper rather than merely faster. I would also treat artifact behavior as a quality signal: which predictions produce useful misconceptions, which free-text answers reveal unhandled mental models, which artifacts users return to, and which closings produce an "oh, I get it now" moment.

**Scale:** I would scale the pattern, not this single hand-built artifact. The millions-of-users version is **crafted primitives, personalized path**: a small set of trusted interactive building blocks such as 3D molecule views, runnable code examples, math graphs, or writing scratch spaces. I would start with narrow topics where Claude sees frequent, high-value confusion, make those experiences excellent, and widen from there. Claude would choose the right moment, read the user's language and materials, compose the prediction/reveal path, and adjust depth from interaction signals. At scale, each artifact becomes a structured experiment in explanation: user choices, free-text answers, return behavior, and closing summaries reveal where intuition diverges from the right model. Personalization should come from the user's explicit materials, actions, and user-owned artifacts, not opaque aptitude tracking.

## Submission Materials

- Live prototype: https://el-labs-takehome-pete.vercel.app
- Walkthrough video: attached to the [`submission-v1` release](https://github.com/petekp/el-takehome-pete/releases/tag/submission-v1) ([direct download](https://github.com/petekp/el-takehome-pete/releases/download/submission-v1/pete-exercise-walkthrough.mp4))
- Claude transcripts: [`transcripts-bundle/`](transcripts-bundle/)
- Assignment brief: [`docs/take-home-assignment.md`](docs/take-home-assignment.md)
- Design history and implementation notes. Some of these preserve the earlier Promise.all iteration; this README is the current summary of the shipped XeF2 prototype:
  - [`docs/exercise-brief.md`](docs/exercise-brief.md)
  - [`docs/prd-in-context-learning-prototype.md`](docs/prd-in-context-learning-prototype.md)
  - [`docs/KICKOFF.md`](docs/KICKOFF.md)
  - [`AGENT_CHANGELOG.md`](AGENT_CHANGELOG.md)

## Stack

Next.js 16 · React 19 · Tailwind v4 · Base UI · Motion · Three.js · Anthropic SDK
