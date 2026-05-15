/**
 * Snapshots of the prototype across its seven git commits — used by /evolution
 * to scrub through the design's history during walkthrough recordings.
 *
 * Screenshots were captured by checking out each commit in a git worktree and
 * snapping the relevant debug/test page with headless Chrome. The captions
 * narrate what changed between commits (not just what the diff says — what the
 * design was wrestling with).
 */

export type EvolutionStep = {
  sha: string
  date: string
  title: string
  era: string
  story: string
  image: string
  imageAlt: string
}

export const EVOLUTION_STEPS: readonly EvolutionStep[] = [
  {
    sha: '24824e9',
    date: '2026-05-13',
    title: 'init — concept map + Promise.all workshop',
    era: 'Concept-map era',
    story:
      'First prototype: a chat side-panel that opens a 2D concept map around whatever you just asked about. Central node = the explored concept; dashed ghost nodes = adjacencies you could pivot to. Tapping the center entered a "workshop" with a configurable Promise.all timeline you could scrub. Reflection input captured what you noticed after each predict-reveal loop.',
    image: '/evolution/01-init-map.png',
    imageAlt: 'Concept map: Promise.all at center with four dashed adjacency nodes around a warm halo',
  },
  {
    sha: 'c080bbc',
    date: '2026-05-14',
    title: 'refinements — concept map iteration',
    era: 'Concept-map era',
    story:
      'Same concept-map shape, but the ghost nodes became pills with labels inside (Promise.allSettled, Promise.race, try/catch, AbortController…) connected by thin lines to the central pill. Live ghost-node API integration meant adjacencies could vary per conversation instead of being hard-coded. The workshop view kept its timeline; the map got friendlier.',
    image: '/evolution/02-refinements-map.png',
    imageAlt: 'Refined concept map with pill nodes and connecting lines',
  },
  {
    sha: '64d30d1',
    date: '2026-05-14',
    title: 'chemistry v1 — the pivot to 3D',
    era: 'Chemistry pivot',
    story:
      "Threw out the concept map. The new bet: a 3D molecule scene teaches VSEPR geometry better than any 2D Lewis diagram could. Built a Three.js scene with bonds, lone pairs, orbital lobes, and angle labels — toggleable via chips. Test page lets you flip between methane / ammonia / ammonium / water to see how lone pairs deform geometry. The artifact stopped being meta ('here's adjacent concepts') and started being object-of-study ('here's the thing — rotate it').",
    image: '/evolution/03-chemistry-test-molecule.png',
    imageAlt: '3D rendering of ammonia molecule with three N-H bonds and one lone pair lobe',
  },
  {
    sha: '9f445ca',
    date: '2026-05-14',
    title: 'more refinements — XeF₂ + the artifact harness',
    era: 'Artifact harness',
    story:
      "Settled on XeF₂ as the focal molecule (5 electron domains, 3 lone pairs — the genuinely counterintuitive case where 2D drawings lie). Added Naomi's hand-drawn chart + Lewis structure as trigger attachments so the artifact responds to a real user's confusion. Built /artifact-debug for jumping into any stage without running the full chat arc — predict-1, reveal-1, predict-2, reveal-2, closing.",
    image: '/evolution/04-refinements-artifact-debug.png',
    imageAlt: 'Artifact harness showing XeF₂ molecule, control pane, and explanatory chat bubble',
  },
  {
    sha: '432b3a0',
    date: '2026-05-14',
    title: 'deeper visualization exploration',
    era: 'Multi-representation',
    story:
      "Single 3D view wasn't enough. Added representation panels: Lewis-diagram, Wedge-and-dash, Geometry chart — each as its own panel inside the artifact, scriptable to swap as the bubble narration progresses. A lone-pair slider lets the user discover that 3 lone pairs is the answer (which makes XeF₂ linear, not T-shaped). The artifact became a small interactive textbook chapter.",
    image: '/evolution/05-deepviz-artifact-debug.png',
    imageAlt: 'Artifact with multiple representation panels and lone-pair slider',
  },
  {
    sha: 'e6d7b5e',
    date: '2026-05-14',
    title: 'refinements — ToggleGroup primitive',
    era: 'UI cleanup',
    story:
      "Visual polish pass. Hand-rolled toggle chips replaced by a unified ToggleGroup UI primitive — same shape everywhere, easier to compose. MoleculeScene re-architected for clearer state management; rotation deltas now feed back into the store so the predict-reveal arc can gate progression on whether the user actually rotated the molecule.",
    image: '/evolution/06-refinements-artifact-debug.png',
    imageAlt: 'Artifact with unified ToggleGroup chips replacing earlier custom toggles',
  },
  {
    sha: 'd57f504',
    date: '2026-05-14',
    title: 'refinements — ControlPane abstraction',
    era: 'Current',
    story:
      "Latest state. The artifact's chip controls were pulled into a dedicated ControlPane component — separates the molecule canvas from the affordances that drive it. RepresentationPanels and Artifact tightened up for the deployable build. This is what ships today.",
    image: '/evolution/07-current-artifact-debug.png',
    imageAlt: 'Current artifact with ControlPane abstraction',
  },
] as const
