# Education Labs take-home

Pete Petrash · Option B: **learning through collaboration with Claude**

This repo contains a working prototype for preserving learner agency inside a Claude-style chat. In this demo, Claude sees a molecular-geometry confusion where a quick answer would skip something worth understanding, then offers two paths:

- **just answer it**: Claude gives the direct answer.
- **let's look at it together**: Claude opens an inline interactive artifact.

The shipped artifact walks through XeF2 molecular geometry using a real student's question, VSEPR chart, and Lewis structure. It helps the learner repair a half-right mental model through prediction, manipulation, and transfer.

Submission materials:

- Live prototype: https://el-labs-takehome-pete.vercel.app
- Walkthrough video: attached to the [`submission-v1` release](https://github.com/petekp/el-takehome-pete/releases/tag/submission-v1) ([direct download](https://github.com/petekp/el-takehome-pete/releases/download/submission-v1/pete-exercise-walkthrough.mp4))
- Claude transcripts: [`transcripts-bundle/`](transcripts-bundle/)
- Assignment brief: [`docs/take-home-assignment.md`](docs/take-home-assignment.md)
- Design history and implementation notes. Some of these preserve the earlier Promise.all iteration; this README is the current summary of the shipped XeF2 prototype:
  - [`docs/exercise-brief.md`](docs/exercise-brief.md)
  - [`docs/prd-in-context-learning-prototype.md`](docs/prd-in-context-learning-prototype.md)
  - [`docs/KICKOFF.md`](docs/KICKOFF.md)
  - [`AGENT_CHANGELOG.md`](AGENT_CHANGELOG.md)

## Try The Prototype

1. Open `/new`.
2. Press send on the preloaded chemistry question and attachments.
3. Choose **let's look at it together**.
4. In the artifact:
   - answer the two prediction questions,
   - rotate the molecule,
   - drag a lone pair toward an axial position,
   - compare Lewis vs. Molecular geometry,
   - use the 5-domain row selector after the ClF3 reveal.
5. Click **Done** to return to chat. Claude receives a compact summary of what happened inside the artifact, so the follow-up can use the user's path through the interaction.

The direct-answer path works too. The user chooses the pace.

## Assignment Fit

The assignment asks for a prototype that helps users learn while working with AI. I built for **cognitive engagement**. A normal answer would name XeF2 as linear and move on. This prototype asks the learner to make a prediction, shows the gap between that prediction and the 3D molecule, and then asks them to transfer the rule to a nearby molecule.

The core learning target is representation literacy:

- **Lewis structure** tells the count of bonds and lone pairs.
- **VSEPR** explains the spatial arrangement of electron domains.
- **Molecular geometry** names where the atoms end up.

The student's original intuition was that the lone pairs were "blocking" bonds. Claude treats that as a useful near-miss: the lone pairs do take up space, but the important question is where they sit in 3D.

## Design Rationale

**Option chosen:** Option B. I chose it because it names the tension I feel most sharply in AI work: how do we amplify output without helping people "lose the plot"? I designed for moments when Claude could answer in one turn, but a small act of prediction or manipulation would help the user leave with a stronger model.

**Process:** I worked product design first, design engineering second. I narrowed the problem from broad "AI learning" to one in-context affordance: Claude notices when the user is about to skip over a useful mental model, then offers a lightweight detour while keeping the chat on track. I explored the major moments in low fidelity, pressure-tested the shape against Claude's existing chat and artifact patterns, wrote a design brief and requirements handoff, built the smallest complete arc, and iterated through real use: target-user feedback, second-model critique, browser QA, and design-engineering passes where trust, pacing, or personalization broke. The Promise.all-to-chemistry pivot came from that loop.

**Agency:** Claude offers a detour and keeps the direct answer available. The user can enter the artifact, step backward, manipulate the model, leave, or return to chat. I avoided scores, streaks, badges, mastery claims, and forced completion because those patterns shift authority back to the product. Wrong answers give Claude useful evidence of how the learner is thinking.

**Learning principles:** Claude asks for a best guess, preserves what the user said, then shows the gap. Each reveal responds to the misconception the prediction surfaced. The 3D molecule puts the lesson in the user's hands: rotate it, switch representations, drag a lone pair into an unfavorable position, and watch the model resist. The main conceptual frame is representation literacy: Lewis structure gives the count, VSEPR gives the spatial arrangement, and molecular geometry names where the atoms end up. The final ClF3 beat tests transfer to a nearby case.

**Measurement:** I would track opt-in rate, self-reported understanding shift, transfer to nearby cases, return usage without nagging, and whether follow-up questions get deeper. I would also treat artifact behavior as a quality signal: which predictions surface useful misconceptions, which free-text answers reveal unhandled mental models, which artifacts users return to, and which closings produce an "oh, I get it now" moment.

**Scale:** I would scale the pattern, starting with narrow topics where Claude sees frequent, high-value confusion. For each topic, the team would craft trusted primitives such as 3D molecule views, runnable code examples, math graphs, or writing scratch spaces. Claude would choose the right moment, read the user's language and materials, compose the prediction/reveal path, and adjust depth from interaction signals. Across millions of uses, those artifacts would give the team structured evidence: user choices, free-text answers, return behavior, and closing summaries show where intuition diverges from the right model. I would ground personalization in the user's explicit materials, actions, and user-owned artifacts.

## Prototype Behaviors

- **Human agency**: the user can choose the direct answer, enter the artifact, step backward, leave, or return to chat.
- **Prediction as diagnosis**: the questions locate the user's mental model so the reveal can address the gap.
- **Manipulable explanation**: the user can rotate the molecule, inspect representation modes, and drag a lone pair into a strained position.
- **Transfer**: after XeF2, Claude asks about the 5-domain / 2-lone-pair case and reveals ClF3 as T-shaped.
- **Representation trust**: I tightened the chemistry rendering around the Lewis layout, the 180 degree F-Xe-F annotation, and the row-selector framing.
- **Post-artifact continuity**: when the user closes the artifact, Claude receives a small interaction summary with predictions, panels explored, rotation engagement, and time in the artifact.

## Claude Usage

- `claude-haiku-4-5` classifies whether the incoming message matches the molecular-geometry concept.
- `claude-sonnet-4-6` writes the in-chat affordance and the direct-answer / post-artifact follow-up.
- The app controls the 3D artifact where trust matters: molecule geometry, prediction branches, row states, and visual treatments.
- When the artifact is present in chat history, the app sends Claude a host-context annotation instead of a raw `<artifact/>` tag, so Claude can refer to the real rendered surface without hallucinating or apologizing.

Claude handles language, timing, and conversational continuity. The app owns the high-trust interactive surface.

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
