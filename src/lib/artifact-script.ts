/**
 * Artifact script — the load-bearing piece of the prototype.
 *
 * The artifact teaches three layers explicitly:
 *   1. Lewis structure → counts of bonds and lone pairs.
 *   2. VSEPR        → spatial arrangement of electron domains.
 *   3. Molecular geometry → where the atoms sit.
 *
 * After v4 polish + v5 trust pass, the arc takes the user's "blocking"
 * mental model and bridges it to the spatial story: yes, the lone pairs
 * are in the way, but specifically in the equatorial plane of a trigonal
 * bipyramid, leaving the two axial positions for the F's — so the
 * molecular geometry reads LINEAR even though the electron-domain
 * geometry is TRIGONAL BIPYRAMIDAL.
 *
 * Compressed to 8 beats:
 *   1. Open: name the user's blocking intuition.
 *   2. 3D ground truth: XeF2 with lone pairs visible.
 *   3. Predict 1: why are the lone pairs equatorial?
 *   4. Reveal 1: bridge their answer → spatial rule.
 *   5. Strain demo: drag a lone pair axial; feel resistance.
 *   6. Predict 2: 5 domains, 2 lone pairs → what shape?
 *   7. Reveal 2: T-shape + introduce the 5-domain row control.
 *   8. Close: 3-layer synthesis + resources.
 *
 * Voice everywhere is a jovial knowledgeable friend who remembers what it
 * was like to take chemistry. Naomi's words ("blocking", "in the way") get
 * echoed back early. No emoji, no exclamation points unless genuinely
 * warranted.
 */

/**
 * Molecules the artifact can render in the 3D viewport.
 *
 *   xef2               — XeF2, trigonal bipyramidal EDG, 3 lone pairs
 *                        equatorial, 2 F axial, MG linear (180°).
 *   xef2-axial-strain  — Hypothetical "what if a lone pair were axial?"
 *                        configuration. Used in the strain beat as a
 *                        fallback if the user doesn't drag interactively.
 *   clf3               — ClF3, trigonal bipyramidal EDG, 2 lone pairs
 *                        equatorial, 1 F equatorial, 2 F axial, MG T-shape.
 */
export type Molecule = 'xef2' | 'xef2-axial-strain' | 'clf3'

/**
 * Focus states encode WHAT THE VIZ SHOULD BE EMPHASIZING at each bubble.
 *
 *   default                 — viewport idle, no emphasis.
 *   materials               — opening: pulse the "Your materials" header
 *                             stack so the artifact reads as grounded in
 *                             her photos.
 *   equatorial-reveal       — show lone pairs in the equatorial plane
 *                             prominently; equatorial plane disc on.
 *   predict-spatial         — predict-1: lone pairs visible, neutral.
 *   axial-strain            — strain demo; lone pairs visible, drag invited.
 *   axial-bond-angle        — molecular geometry beat: angle indicator on,
 *                             F-Xe-F line emphasized.
 *   predict-tshape          — predict-2: row control hidden so the
 *                             options don't reveal the answer.
 *   clf3-tshape             — show ClF3 + reveal the 5-domain row control.
 *   closing                 — close: synthesis card, all panels equal.
 */
export type FocusState =
  | 'default'
  | 'materials'
  | 'equatorial-reveal'
  | 'predict-spatial'
  | 'axial-strain'
  | 'axial-bond-angle'
  | 'predict-tshape'
  | 'clf3-tshape'
  | 'closing'

/**
 * Misconception tags for prediction 1 (why are the lone pairs equatorial?).
 *
 *   notational     — "The lone pairs were drawn that way; it's arbitrary."
 *                    Treats spatial arrangement as a 2D convention.
 *   equatorial     — "Equatorial seats have more space (fewer 90°
 *                    neighbors)." Correct.
 *   atoms-push     — "The F atoms are bigger and push the lone pairs to
 *                    the equator." Inverts the actual relationship.
 *   counting       — Free text framed as octets / electron rules /
 *                    stability / noble gas. They're answering the
 *                    counting question (Lewis), not the spatial question.
 *   blocking       — Free text echoes "blocking" or "in the way." The
 *                    user's own intuition surfacing again — bridge it
 *                    forward instead of correcting.
 *   idk            — "I don't know" / "no idea" / similar. Skip the
 *                    correction; just show.
 *   unclassified   — Free text we couldn't route.
 */
export type Prediction1Key =
  | 'notational'
  | 'equatorial'
  | 'atoms-push'
  | 'counting'
  | 'blocking'
  | 'idk'
  | 'unclassified'

/**
 * Misconception tags for prediction 2 (5 domains, 2 lone pairs → what
 * shape?).
 *
 *   linear         — "Linear, same as XeF2." Doesn't yet see that lone-pair
 *                    count changes the molecular geometry.
 *   tshape         — "T-shaped." Correct.
 *   pyramidal      — "Trigonal pyramidal." Wrong row of the chart — that's
 *                    a 4-domain shape, not a 5-domain shape.
 *   unclassified   — Free text we couldn't route.
 */
export type Prediction2Key = 'linear' | 'tshape' | 'pyramidal' | 'unclassified'

export type PredictionOption<K extends string> = {
  id: K
  label: string
  isCorrect: boolean
}

/**
 * A bubble can mark a left-side element as "cued" — visually inviting the
 * user to interact with it. The cue fades when the user engages.
 */
export type ElementCue =
  | 'panel-materials'
  | 'panel-lewis'
  | 'panel-geometry'
  | 'panels-row'
  | 'viewport'
  | 'lone-pairs-toggle'
  | 'bond-angles-toggle'
  | 'lp-row'

export type Bubble = {
  text: string
  /** Active molecule for this bubble. If unspecified, keep the current one. */
  molecule?: Molecule
  /** Focus state to drive into when this bubble becomes active. */
  focus?: FocusState
  /** Visual cue applied to a left-side element while this bubble is active. */
  cue?: ElementCue
}

export type ArtifactPath = {
  /** Sequence after the user submits their first prediction. */
  reveal1: Bubble[]
}

/** External resources rendered at the end of the artifact. */
export type Resource = { title: string; url: string; source: string }

// ---------------------------------------------------------------------------
// Stepper position — shared between the UI (Artifact.tsx) and the
// interaction summary so the user-facing "step X of Y" indicator and the
// summary Claude sees stay in sync. 8 positions: 2 (opening) + 1 (predict-1)
// + 2 (reveal-1) + 1 (predict-2) + 1 (reveal-2) + 1 (closing).
// ---------------------------------------------------------------------------

export const TOTAL_STEPS = 8

const STAGE_STEP_OFFSET = {
  opening: 0,
  'predict-1': 2,
  'reveal-1': 3,
  'predict-2': 5,
  'reveal-2': 6,
  closing: 7,
} as const

/**
 * 1-indexed step position the user sees in the stepper for the given
 * stage + bubble index. Predict stages count as a single step regardless
 * of bubbleIndex.
 */
export function stepPosition(
  stage: keyof typeof STAGE_STEP_OFFSET,
  bubbleIndex: number,
): number {
  const clamp = (n: number) => Math.max(1, Math.min(TOTAL_STEPS, n))
  if (stage === 'predict-1' || stage === 'predict-2') {
    return clamp(STAGE_STEP_OFFSET[stage] + 1)
  }
  return clamp(STAGE_STEP_OFFSET[stage] + bubbleIndex + 1)
}

// ---------------------------------------------------------------------------
// Opening beats — 2 bubbles before prediction 1.
// ---------------------------------------------------------------------------

export const OPENING_BUBBLES: Bubble[] = [
  {
    text:
      "You said the three lone pairs are blocking any bonds from forming around Xe — and that intuition is partly right. The lone pairs are taking up space, and they restrict where the F atoms can go. But the 2D drawings can't show you how they're taking up space, which is why the linear shape feels arbitrary. Let me show you what's happening in 3D.",
    molecule: 'xef2',
    focus: 'materials',
    cue: 'panel-materials',
  },
  {
    text:
      "Here's XeF2 in 3D. Two F atoms axial — top and bottom — and three lone pairs around Xe sitting perpendicular to them, in what's called the equatorial plane. Drag to rotate it.",
    molecule: 'xef2',
    focus: 'equatorial-reveal',
    cue: 'viewport',
  },
]

// ---------------------------------------------------------------------------
// Prediction 1 — why are the lone pairs in the equatorial plane?
// ---------------------------------------------------------------------------

export const PREDICTION_1: {
  framing: string
  options: PredictionOption<Prediction1Key>[]
} = {
  framing:
    "Quick question. Why do you think the lone pairs ended up in the equatorial plane instead of the axial positions where the F's are now?",
  options: [
    {
      id: 'notational',
      label: "The lone pairs were just drawn that way; it's arbitrary.",
      isCorrect: false,
    },
    {
      id: 'equatorial',
      label: "Equatorial positions have more space — fewer 90° neighbors.",
      isCorrect: true,
    },
    {
      id: 'atoms-push',
      label: "The F atoms are bigger and push the lone pairs to the equator.",
      isCorrect: false,
    },
  ],
}

// ---------------------------------------------------------------------------
// Reveal 1 — branched per misconception. Two bubbles per branch:
//   1. Bridge to spatial rule (varies per misconception).
//   2. Strain demo — invite drag, explain in one short paragraph (shared).
// ---------------------------------------------------------------------------

const STRAIN_BEAT_INVITE: Bubble = {
  text:
    "Try grabbing a lone pair and dragging it toward an axial position — where an F sits now. You'll feel the molecule resist. That resistance is the geometry: an axial seat has three neighbors at 90°, equatorial only has two. Lone pairs need elbow room, so they take the roomier seats and the F atoms get what's left over.",
  molecule: 'xef2',
  focus: 'axial-strain',
  cue: 'viewport',
}

const NOTATIONAL_REVEAL_1: Bubble[] = [
  {
    text:
      "The drawing doesn't tell you that, you're right — but the position isn't arbitrary. There's a real geometric reason hiding behind the 2D convention.",
    molecule: 'xef2',
    focus: 'equatorial-reveal',
  },
  STRAIN_BEAT_INVITE,
]

const EQUATORIAL_REVEAL_1: Bubble[] = [
  {
    text:
      "Right. An axial position has three other groups at 90° to it. Equatorial only has two. Lone pairs need elbow room, so they take the roomier seats.",
    molecule: 'xef2',
    focus: 'equatorial-reveal',
  },
  STRAIN_BEAT_INVITE,
]

const ATOMS_PUSH_REVEAL_1: Bubble[] = [
  {
    text:
      "It's actually the reverse: lone pairs take more space than bonded pairs, so they push the F's around — not the other way. Your blocking intuition was right about the direction, just inverted on which one's pushing.",
    molecule: 'xef2',
    focus: 'equatorial-reveal',
  },
  STRAIN_BEAT_INVITE,
]

const COUNTING_REVEAL_1: Bubble[] = [
  {
    text:
      "You're answering the counting question — how many lone pairs Xe has. That comes from the Lewis structure and electron counting. The question here is the space question — once those five electron domains exist, where do they sit?",
    molecule: 'xef2',
    focus: 'equatorial-reveal',
  },
  STRAIN_BEAT_INVITE,
]

const BLOCKING_REVEAL_1: Bubble[] = [
  {
    text:
      "Right — they are in the way. More precisely, they're occupying the roomier equatorial positions, which leaves the axial positions for the F atoms.",
    molecule: 'xef2',
    focus: 'equatorial-reveal',
  },
  STRAIN_BEAT_INVITE,
]

const IDK_REVEAL_1: Bubble[] = [
  {
    text:
      "Totally fine. Let me show you. Lone pairs take more space than bonded pairs, so they claim the roomier seats — and equatorial has more room than axial.",
    molecule: 'xef2',
    focus: 'equatorial-reveal',
  },
  STRAIN_BEAT_INVITE,
]

const UNCLASSIFIED_REVEAL_1: Bubble[] = [
  {
    text:
      "Let's check it against the spatial model. Lone pairs take more space than bonded pairs, so they claim the roomier seats — and equatorial has fewer 90° neighbors than axial.",
    molecule: 'xef2',
    focus: 'equatorial-reveal',
  },
  STRAIN_BEAT_INVITE,
]

export const REVEAL_1_PATHS: Record<Prediction1Key, ArtifactPath> = {
  notational: { reveal1: NOTATIONAL_REVEAL_1 },
  equatorial: { reveal1: EQUATORIAL_REVEAL_1 },
  'atoms-push': { reveal1: ATOMS_PUSH_REVEAL_1 },
  counting: { reveal1: COUNTING_REVEAL_1 },
  blocking: { reveal1: BLOCKING_REVEAL_1 },
  idk: { reveal1: IDK_REVEAL_1 },
  unclassified: { reveal1: UNCLASSIFIED_REVEAL_1 },
}

// ---------------------------------------------------------------------------
// Prediction 2 — extending the insight: 5 domains, 2 lone pairs → shape?
// ---------------------------------------------------------------------------

export const PREDICTION_2: {
  framing: string
  options: PredictionOption<Prediction2Key>[]
} = {
  framing:
    "One more. Same row of the chart — 5 domains, but with 2 lone pairs instead of 3. What shape do you predict?",
  options: [
    {
      id: 'linear',
      label: "Linear, same as XeF2.",
      isCorrect: false,
    },
    {
      id: 'tshape',
      label: "T-shaped — the F's form a T around the central atom.",
      isCorrect: true,
    },
    {
      id: 'pyramidal',
      label: "Trigonal pyramidal.",
      isCorrect: false,
    },
  ],
}

// ---------------------------------------------------------------------------
// Reveal 2 — single bubble per branch. Each shows ClF3 (T-shape) and
// introduces the 5-domain row control as a way to step through the row.
// ---------------------------------------------------------------------------

const ROW_SCRUBBER_TAIL =
  "Open the 5-domain row control below the viewport and step through the four examples: PF5 (0 LP, trigonal bipyramidal), SF4 (1 LP, seesaw), ClF3 (2 LP, T-shaped), XeF2 (3 LP, linear). Same row, different lone-pair counts."

const LINEAR_REVEAL_2: Bubble[] = [
  {
    text:
      `Close — but lone-pair count changes the shape. With 2 lone pairs instead of 3, one equatorial seat opens up for an F. That F, plus the two axial F's, traces a T. ${ROW_SCRUBBER_TAIL}`,
    molecule: 'clf3',
    focus: 'clf3-tshape',
    cue: 'lp-row',
  },
]

const TSHAPE_REVEAL_2: Bubble[] = [
  {
    text:
      `Yep — T-shape. Two lone pairs claim two of the equatorial seats, the third equatorial seat is an F, and the two axial F's stay put. You're looking at ClF3. ${ROW_SCRUBBER_TAIL}`,
    molecule: 'clf3',
    focus: 'clf3-tshape',
    cue: 'lp-row',
  },
]

const PYRAMIDAL_REVEAL_2: Bubble[] = [
  {
    text:
      `Trigonal pyramidal is a 4-domain shape — that's ammonia, the row above. Here we still have 5 domains, just fewer lone pairs. With 2 lone pairs, one equatorial seat is an F and the two axial F's stay put — that's a T. ${ROW_SCRUBBER_TAIL}`,
    molecule: 'clf3',
    focus: 'clf3-tshape',
    cue: 'lp-row',
  },
]

const UNCLASSIFIED_REVEAL_2: Bubble[] = [
  {
    text:
      `With 2 lone pairs, two equatorial seats are claimed by lone pairs, one equatorial seat is an F, and the two axial F's stay put. The result is a T-shape — that's ClF3. ${ROW_SCRUBBER_TAIL}`,
    molecule: 'clf3',
    focus: 'clf3-tshape',
    cue: 'lp-row',
  },
]

export const REVEAL_2_PATHS: Record<Prediction2Key, Bubble[]> = {
  linear: LINEAR_REVEAL_2,
  tshape: TSHAPE_REVEAL_2,
  pyramidal: PYRAMIDAL_REVEAL_2,
  unclassified: UNCLASSIFIED_REVEAL_2,
}

// ---------------------------------------------------------------------------
// Closing — single bubble that ties the three layers together.
// ---------------------------------------------------------------------------

export const CLOSING_BUBBLE: Bubble = {
  text:
    "Three layers, one molecule. Lewis tells you the count: 3 lone pairs, 2 bonds. VSEPR gives you the spatial arrangement: lone pairs claim equatorial because they need room. Molecular geometry names where the atoms end up: linear. The chart isn't lying to you — it's just compressing all three of those into one cell.",
  molecule: 'xef2',
  focus: 'closing',
}

export type SummaryCardLine = string

export const SUMMARY_CARD: {
  title: string
  lines: SummaryCardLine[]
} = {
  title: "XeF2 — what to remember",
  lines: [
    "Lewis: 3 lone pairs on Xe, 2 Xe–F bonds.",
    "VSEPR: lone pairs sit equatorial; only two 90° neighbors instead of three.",
    "Molecular geometry: linear, F–Xe–F = 180°.",
    "Same row, varying lone pairs: PF5 (0) → SF4 (1) → ClF3 (2) → XeF2 (3).",
  ],
}

export const RESOURCES: Resource[] = [
  {
    title: 'MolView — rotate any molecule yourself',
    url: 'https://molview.org/',
    source: 'molview.org',
  },
  {
    title: 'VSEPR theory primer',
    url: 'https://en.wikipedia.org/wiki/VSEPR_theory',
    source: 'Wikipedia',
  },
]

// ---------------------------------------------------------------------------
// Free-text classifiers — keyword heuristics. A productized version would
// route through a model; for the prototype, hardcoded patterns let us hit
// the personalized branches reliably.
// ---------------------------------------------------------------------------

export function classifyPrediction1FreeText(text: string): Prediction1Key {
  const t = text.toLowerCase().trim()
  if (t.length === 0) return 'unclassified'

  // I don't know — short, dismissive, or explicit "no idea" responses.
  const idkExact = new Set([
    'idk',
    'i dont know',
    "i don't know",
    'dunno',
    'no idea',
    'not sure',
    'unsure',
    'no clue',
    '?',
  ])
  if (idkExact.has(t)) return 'idk'
  if (
    t.startsWith("i don't know") ||
    t.startsWith('i dont know') ||
    t.startsWith('no idea') ||
    t.startsWith('not sure') ||
    t.startsWith('no clue')
  ) {
    return 'idk'
  }

  // Equatorial — roomier-seats reasoning. Correct.
  const equatorialSignals = [
    'more space',
    'more room',
    'roomier',
    'less crowded',
    'fewer neighbors',
    'fewer 90',
    '90 degree',
    '90°',
    'equatorial',
    'elbow room',
    'spread out',
    'spread apart',
  ]
  if (equatorialSignals.some((s) => t.includes(s))) return 'equatorial'

  // Blocking / in the way — echo of the user's own framing.
  const blockingSignals = ['block', 'in the way', 'in their way', 'in xe way']
  if (blockingSignals.some((s) => t.includes(s))) return 'blocking'

  // Counting / electron-rules — answering the Lewis question, not spatial.
  const countingSignals = [
    'octet',
    'noble gas',
    'electron count',
    'electrons',
    'electron rule',
    'allow',
    'filling',
    'filled',
    'stable',
    'stability',
    'full shell',
    'valence',
    'lone pair count',
    'have to be',
    'always have',
  ]
  if (countingSignals.some((s) => t.includes(s))) return 'counting'

  // Notational — "they were drawn that way."
  const notationalSignals = [
    'arbitrary',
    'just drawn',
    'just notation',
    'convention',
    'random',
    'no reason',
    'no specific reason',
    'doesnt matter',
    "doesn't matter",
  ]
  if (notationalSignals.some((s) => t.includes(s))) return 'notational'

  // Atoms push — inverted causality.
  const atomsPushSignals = [
    'f atoms push',
    'fluorine push',
    'atoms push',
    'f is bigger',
    'fluorine is bigger',
    'pushed by',
  ]
  if (atomsPushSignals.some((s) => t.includes(s))) return 'atoms-push'

  return 'unclassified'
}

export function classifyPrediction2FreeText(text: string): Prediction2Key {
  const t = text.toLowerCase().trim()

  if (
    t.includes('t-shape') ||
    t.includes('t shape') ||
    t.includes('tshape') ||
    t.includes('t-shaped')
  )
    return 'tshape'
  if (t.includes('linear') || t.includes('straight line') || t.includes('180'))
    return 'linear'
  if (t.includes('pyramidal') || t.includes('pyramid')) return 'pyramidal'

  return 'unclassified'
}
