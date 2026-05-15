# Education Labs take-home

Pete Petrash · Option B: **learning through collaboration with Claude**

This repo contains a working prototype for keeping users in charge of their own learning while working with Claude. In this demo, Claude sees a chemistry question where a quick answer would skip past something worth understanding, then offers two paths:

- **just answer it**: Claude gives the direct answer.
- **let's look at it together**: Claude opens an inline interactive artifact.

The shipped artifact walks through XeF2 molecular geometry using a real student's question, VSEPR chart, and Lewis structure. It catches a partly-right hunch, lets the user push on it with a 3D model they can touch, and asks them to apply the same idea to a different molecule.

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

1. Open [`/new`](https://el-labs-takehome-pete.vercel.app/new).
2. Press send on the preloaded chemistry question and attachments.
3. Choose **let's look at it together**.
4. In the artifact:
   - answer the two prediction questions,
   - rotate the molecule,
   - drag a lone pair toward an axial position,
   - compare Lewis vs. Molecular geometry,
   - use the 5-domain row selector after the ClF3 reveal.
5. Click **Done** to return to chat. Claude receives a compact summary of what happened inside the artifact, so the follow-up can use the user's path through the interaction.

The user can choose the direct-answer path. They choose the pace.

## Assignment Fit

The assignment asks for a prototype that helps users learn while working with AI. I built for the moments where the user actually has to think. A normal answer would name XeF2 as linear and move on. This prototype asks the user to make a prediction, shows the gap between that prediction and the 3D molecule, and asks them to apply the same rule to a different molecule.

The core learning target is representation literacy:

- **Lewis structure** tells the count of bonds and lone pairs.
- **VSEPR** explains the spatial arrangement of electron domains.
- **Molecular geometry** names where the atoms end up.

The student's original intuition was that the lone pairs were "blocking" bonds. Claude treats that as a useful near-miss: the lone pairs do take up space, but the important question is where they sit in 3D.

## Why Option B

I chose Option B because it names the tension I feel most sharply in my daily work with Claude: how do you amplify output without losing the plot? You can ship faster and still end up a stranger to your own work. I wanted to design into that gap. Claude could answer the question in one turn, but a small act of prediction or manipulation would let the user leave with a stronger model and stay the author of their own thinking.

## Process

I worked product design first, design engineering second. I narrowed the problem from broad "AI learning" down to one specific moment in the chat: Claude notices when the user is about to skip over something worth understanding, then offers a quick detour without derailing the conversation. I sketched the major moments in low fidelity, pressure-tested the shape against Claude's existing chat and artifact patterns, wrote a design brief, then built the smallest complete arc.

The biggest pivot was leaving Promise.all behind for chemistry. My wife is picking up general chemistry again after regretting not finishing it in college, and she described the exact problem I'd designed the artifact for: a static textbook diagram she could pattern-match through but couldn't picture in 3D. Listening to her shaped the prototype's voice, scope, and final form. Molecular geometry is also a harder test of craft, since a flat image on a page can't capture spatial structure at all. I treated the pivot as a higher-conviction bet on the thesis.

I iterated through real use: target-user feedback, second-model critique, browser QA, and design-engineering passes wherever trust, pacing, or personalization broke.

## Principles

### Agency

Claude offers a detour and keeps the direct answer one click away. The user can enter the artifact, step backward, manipulate the model, leave, or return to chat. I avoided gamification on principle. No scores, no streaks, no badges, no mastery claims, no forced completion. Those mechanics smuggle in incentive structures (engagement, retention, growth) that have nothing to do with whether the user got it. The register I wanted was "a friend at the whiteboard." When the user guesses wrong, Claude reads that as useful evidence of how they're thinking, not as failure. The user has to reach for the detour themselves. Pushing it would break the trust I'm trying to build.

### Learning

The artifact asks for a best guess, keeps what the user said on screen, then shows where they were right and where they were off. The user's first intuition is almost-right. The lone pairs *do* take up space, and the reveal points to what they missed instead of dismissing the attempt. That gap is where the actual learning happens.

Then the 3D molecule becomes something to play with: rotate it, switch between Lewis and 3D views, drag a lone pair into a bad spot and watch the model snap back. Each view answers a different question. Lewis tells you how many bonds and lone pairs there are, VSEPR tells you how they arrange in space, and the molecular geometry name describes where the atoms end up. The closing step asks the user to apply the same rule to a different molecule.

### Measurement

I'd resist any metric that claims the system has measured your mastery. That's a story the product wants to tell about you, and the product is guessing. The signals worth tracking: how often users opt into the artifact, whether they say they understand the topic better afterward, whether they can apply the rule to a similar question, whether they come back without being nagged, and whether their follow-up questions get deeper. Artifact behavior is itself a quality signal: which predictions catch real misunderstandings, which free-text answers expose ways of thinking the system hadn't anticipated, which closings produce an "oh, I get it now" moment.

The artifact itself is the only thing worth persisting as a record of learning, and it should be user-owned. Memory, not score.

### Scale

I'd scale by depth, not breadth. Pick a narrow topic where Claude already sees the same confusion come up a lot, and invest heavily in one trusted primitive: a 3D molecule view, a runnable code playground, a math graph, a writing scratch space. Claude picks the moment to bring it out, reads what the user is working on, and assembles the right predict-then-show path. Across millions of uses, those artifacts produce structured evidence (user choices, free-text answers, return behavior, closing summaries) about where intuition tends to drift from the right model. Personalization stays grounded in what the user actually does and makes. Not in guesses about what they know.

## How It Works

- **Choice all the way through**: the user can take the direct answer, enter the artifact, step backward, leave, or return to chat at any time.
- **Predictions reveal the gap**: a wrong guess tells Claude what the user is actually missing, so the explanation can speak to that.
- **Explorable explanation**: the user can rotate the molecule, switch between Lewis and 3D views, and drag a lone pair into a bad spot to see what happens.
- **Carrying the rule over**: once one molecule clicks, the artifact asks the user to apply the same idea to a different one.
- **Visual accuracy**: the prediction step only works if the user trusts what they see, so I built the chemistry rendering carefully (Lewis layout, the 180-degree F-Xe-F annotation, the row selector).
- **Returning to chat**: when the user closes the artifact, Claude gets a short summary of what they did inside (predictions, panels explored, rotations, time spent), so the next reply can speak to their actual path.

`claude-haiku-4-5` checks whether the incoming message is about molecular geometry. `claude-sonnet-4-6` writes the offer in the chat, the direct answer, and the follow-up after the artifact closes. The app controls everything where trust matters: molecule geometry, prediction branches, row states, visual treatments. For chat turns that involve the artifact, the app passes Claude a description of what's on screen so the reply stays grounded in what the user actually sees.

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
