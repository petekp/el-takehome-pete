/**
 * Artifact script — the load-bearing piece of the prototype.
 *
 * After the XeF2 pivot, the artifact's job is to take Naomi's partial
 * understanding ("the lone pairs are blocking the bonds") and complete it
 * spatially: yes, the lone pairs are in the way, but specifically in the
 * equatorial plane of a trigonal bipyramid, leaving the two axial positions
 * for the F's — which is why the molecular geometry reads as LINEAR even
 * though the electron-domain geometry is TRIGONAL BIPYRAMIDAL.
 *
 * The arc walks her through:
 *   1. Open by naming her materials directly.
 *   2. Read the Lewis structure: 3 lone pairs on Xe, 2 F bonds.
 *   3. 3D reveal: lone pairs sit in the equatorial plane.
 *   4. Predict why (equatorial = more space) — branched reveal.
 *   5. Axial-strain demo for the "atoms-push-lone-pairs" misconception.
 *   6. Close on the 180° F-Xe-F angle, why linear.
 *   7. Predict the next case (2 lone pairs → T-shape, ClF3).
 *   8. Morph to ClF3.
 *   9. Closing summary that ties the whole row of the chart together.
 *   10. "Go deeper" external resources.
 *
 * Voice everywhere is a jovial knowledgeable friend who remembers what it
 * was like to take chemistry. Naomi's words ("blocking", "wedge and dash
 * is confusing") get echoed back early. No "chip" anywhere user-facing —
 * use positional language ("the Lone pairs toggle up top", "the button up
 * top"). No emoji, no exclamation points unless genuinely warranted.
 */

/**
 * Molecules the artifact can render in the 3D viewport.
 *
 *   xef2               — XeF2, trigonal bipyramidal EDG, 3 lone pairs
 *                        equatorial, 2 F axial, MG linear (180°).
 *   xef2-axial-strain  — Hypothetical "what if a lone pair were axial?"
 *                        configuration. Used in Beat 5 to demonstrate why
 *                        equatorial wins. One lone pair moved to +y axial,
 *                        the F that was there pushed equatorial.
 *   clf3               — ClF3, trigonal bipyramidal EDG, 2 lone pairs
 *                        equatorial, 1 F equatorial, 2 F axial, MG T-shape.
 *                        Used in Beat 8 as the morph target.
 */
export type Molecule = 'xef2' | 'xef2-axial-strain' | 'clf3'

/**
 * Focus states encode WHAT THE VIZ SHOULD BE EMPHASIZING at each bubble.
 *
 *   default                 — viewport idle, no emphasis.
 *   materials               — "Your materials" panel pulse; the user just
 *                             learned the artifact is grounded in her photos.
 *   lewis-isolation         — Beat 2: dim 3D + non-Lewis panels while the
 *                             user reads the Lewis structure.
 *   equatorial-reveal       — Beat 3: lone pairs in the equatorial plane
 *                             get a brief pulse; equatorial plane toggle on.
 *   predict-spatial         — Beat 4: waiting on her first prediction.
 *   axial-strain            — Beat 5 (option-3 path): swap to the strained
 *                             configuration so she can see how cramped axial
 *                             positions are.
 *   axial-bond-angle        — Beat 6: 180° angle toggle on, F-Xe-F line
 *                             highlighted.
 *   predict-tshape          — Beat 7: waiting on her T-shape prediction.
 *   clf3-tshape             — Beat 8: morph to ClF3, T-shape visible.
 *   closing                 — Beat 9: all panels equally lit, summary card
 *                             visible.
 */
export type FocusState =
  | 'default'
  | 'materials'
  | 'lewis-isolation'
  | 'equatorial-reveal'
  | 'predict-spatial'
  | 'axial-strain'
  | 'axial-bond-angle'
  | 'predict-tshape'
  | 'clf3-tshape'
  | 'closing'

/**
 * Misconception tags for prediction 1 (why are the lone pairs in the
 * equatorial plane?).
 *
 *   notational     — "The lone pairs were drawn that way; it's arbitrary."
 *                    Treats the spatial arrangement as a 2D convention.
 *   equatorial     — "Equatorial positions have more space (fewer 90°
 *                    neighbors)." The correct answer.
 *   atoms-push     — "The F atoms are bigger and push the lone pairs to the
 *                    equator." Inverts the actual relationship (lone pairs
 *                    push atoms because lone pairs need more space).
 *   unclassified   — Free text we couldn't route.
 */
export type Prediction1Key = 'notational' | 'equatorial' | 'atoms-push' | 'unclassified'

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
  | 'panel-wedge'
  | 'panel-geometry'
  | 'panels-row'
  | 'viewport'
  | 'lone-pairs-toggle'
  | 'bond-angles-toggle'

/**
 * A guided-interaction beat blocks advance until the user satisfies a gate.
 *   panels-explored — user must click each of Lewis/Wedge/Geometry once.
 *   rotation        — user must rotate the 3D scene by at least 90°.
 */
export type BubbleGate = 'panels-explored' | 'rotation'

export type Bubble = {
  text: string
  /** Active molecule for this bubble. If unspecified, keep the current one. */
  molecule?: Molecule
  /** Focus state to drive into when this bubble becomes active. */
  focus?: FocusState
  /** Visual cue applied to a left-side element while this bubble is active. */
  cue?: ElementCue
  /** Gate the user must satisfy before advancing. */
  gate?: BubbleGate
}

export type ArtifactPath = {
  /** Sequence after the user submits their first prediction. */
  reveal1: Bubble[]
}

/** External resources rendered at the end of the artifact. */
export type Resource = { title: string; url: string; source: string }

// ---------------------------------------------------------------------------
// Opening beats. Five bubbles before prediction 1 — two of them are guided
// interactions (panels exploration + rotation gate).
// ---------------------------------------------------------------------------

export const OPENING_BUBBLES: Bubble[] = [
  {
    text:
      "Okay. I'm looking at your chart and your Lewis structure on the right. The row you're on — 5 domains, 3 lone pairs — is one of the genuinely tricky cells, and it's tricky for a specific reason. The 2D drawings can't show you what the lone pairs are actually doing in 3D.",
    molecule: 'xef2',
    focus: 'materials',
    cue: 'panel-materials',
  },
  {
    text:
      "Here's what your Lewis structure shows you: Xe in the middle, two F's bonded, three lone pairs on Xe. The drawing puts those lone pairs around Xe at what looks like roughly even spacing in the plane of the page. That's a 2D convention, not a spatial fact — and the Lewis can't show you what the 3D arrangement actually is.",
    molecule: 'xef2',
    focus: 'lewis-isolation',
    cue: 'panel-lewis',
  },
  {
    text:
      "Click through each of the three panels below to see what each one captures.",
    molecule: 'xef2',
    focus: 'lewis-isolation',
    cue: 'panels-row',
    gate: 'panels-explored',
  },
  {
    text:
      "All three lone pairs sit in the equatorial plane, perpendicular to the F-Xe-F axis. That's why the F's end up axial, and why the molecule is linear.",
    molecule: 'xef2',
    focus: 'equatorial-reveal',
    cue: 'viewport',
  },
  {
    text:
      "Take a sec to rotate the molecule — you'll want to see how the lone pairs sit relative to the F atoms.",
    molecule: 'xef2',
    focus: 'equatorial-reveal',
    cue: 'viewport',
    gate: 'rotation',
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
    "Quick question. Why do you think the lone pairs ended up in the equatorial plane instead of, say, the axial positions where the F's are now?",
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
// Reveal 1 — branched per misconception.
// Each branch ends by toggling the 180° bond angle and explaining linear MG.
// ---------------------------------------------------------------------------

const SHARED_BOND_ANGLE_BEAT: Bubble = {
  text:
    "Once the lone pairs claim the equatorial plane, the F's only have the axial positions left. Two axial positions opposite each other means the F-Xe-F angle is 180°. That's why the molecular geometry is linear, even though the electron-domain geometry is trigonal bipyramidal. The chart's not lying to you — it's just compressing this whole spatial story into one cell.",
  molecule: 'xef2',
  focus: 'axial-bond-angle',
  cue: 'bond-angles-toggle',
}

const NOTATIONAL_REVEAL_1: Bubble[] = [
  {
    text:
      "The drawing doesn't tell you that, you're right — but the position isn't arbitrary. There's a real geometric reason. Watch what happens if we put a lone pair in an axial position instead.",
    molecule: 'xef2-axial-strain',
    focus: 'axial-strain',
  },
  {
    text:
      "An axial lone pair has three other groups at 90°. Axial positions are cramped. Equatorial positions only have two 90° neighbors. Lone pairs need elbow room, so they take the roomier seats.",
    molecule: 'xef2-axial-strain',
    focus: 'axial-strain',
  },
  { ...SHARED_BOND_ANGLE_BEAT, molecule: 'xef2' },
]

const EQUATORIAL_REVEAL_1: Bubble[] = [
  {
    text:
      "Right. An axial position has three other groups at 90° to it. Equatorial only has two. Lone pairs are bigger than bonded pairs — they need elbow room — so they take the roomier seats.",
    molecule: 'xef2-axial-strain',
    focus: 'axial-strain',
  },
  {
    text:
      "You can see it here — that's what XeF2 would look like if one lone pair were axial. The three neighbors at 90° crowd it. The real molecule avoids that by putting all three lone pairs equatorial.",
    molecule: 'xef2-axial-strain',
    focus: 'axial-strain',
  },
  { ...SHARED_BOND_ANGLE_BEAT, molecule: 'xef2' },
]

const ATOMS_PUSH_REVEAL_1: Bubble[] = [
  {
    text:
      "It's actually the reverse: lone pairs take more space than bonded pairs, so they push the F's around, not the other way. Your blocking intuition was right about the direction — the lone pairs claim the roomier positions.",
    molecule: 'xef2',
    focus: 'equatorial-reveal',
  },
  {
    text:
      "Equatorial seats have only two neighbors at 90°. Axial seats have three. So the lone pairs take equatorial; the F atoms are stuck with axial.",
    molecule: 'xef2-axial-strain',
    focus: 'axial-strain',
  },
  { ...SHARED_BOND_ANGLE_BEAT, molecule: 'xef2' },
]

const UNCLASSIFIED_REVEAL_1: Bubble[] = [
  {
    text:
      "Interesting. Here's what's going on — check it against what you were thinking. Lone pairs take more space than bonded pairs, so they claim the roomier seats in the molecule.",
    molecule: 'xef2-axial-strain',
    focus: 'axial-strain',
  },
  {
    text:
      "Equatorial positions have only two neighbors at 90°. Axial has three. Lone pairs go equatorial because there's more room.",
    molecule: 'xef2-axial-strain',
    focus: 'axial-strain',
  },
  { ...SHARED_BOND_ANGLE_BEAT, molecule: 'xef2' },
]

export const REVEAL_1_PATHS: Record<Prediction1Key, ArtifactPath> = {
  notational: { reveal1: NOTATIONAL_REVEAL_1 },
  equatorial: { reveal1: EQUATORIAL_REVEAL_1 },
  'atoms-push': { reveal1: ATOMS_PUSH_REVEAL_1 },
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
    "Want to test the idea? Here's a related case: 5 domains, but with 2 lone pairs instead of 3. What shape do you predict?",
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
// Reveal 2 — morph to ClF3, then closing.
// ---------------------------------------------------------------------------

const SHARED_TSHAPE_BEAT: Bubble = {
  text:
    "Same rule: lone pairs take equatorial. Two lone pairs leave room for one equatorial F and two axial F's, forming a T. If you'd had only one lone pair, you'd get a see-saw. The whole row of your chart is one consistent story.",
  molecule: 'clf3',
  focus: 'clf3-tshape',
}

const LINEAR_REVEAL_2: Bubble[] = [
  {
    text:
      "Close — but lone-pair count changes things. With 2 lone pairs instead of 3, you free up one of the equatorial seats. That third equatorial slot now has an F in it.",
    molecule: 'clf3',
    focus: 'clf3-tshape',
  },
  SHARED_TSHAPE_BEAT,
]

const TSHAPE_REVEAL_2: Bubble[] = [
  {
    text:
      "Yep — T-shape. Two lone pairs claim two of the three equatorial seats, the third equatorial seat is an F, and the two axial F's stay put. You're looking at ClF3.",
    molecule: 'clf3',
    focus: 'clf3-tshape',
  },
  SHARED_TSHAPE_BEAT,
]

const PYRAMIDAL_REVEAL_2: Bubble[] = [
  {
    text:
      "Trigonal pyramidal is a 4-domain shape — that's ammonia, the row above. Here we still have 5 domains, just fewer lone pairs. The arrangement stays trigonal bipyramidal underneath; only the visible shape changes.",
    molecule: 'clf3',
    focus: 'clf3-tshape',
  },
  SHARED_TSHAPE_BEAT,
]

const UNCLASSIFIED_REVEAL_2: Bubble[] = [
  {
    text:
      "Here's what happens with 2 lone pairs. Two equatorial seats are claimed by lone pairs; one equatorial seat is an F; the two axial seats are F's. Result: a T-shape.",
    molecule: 'clf3',
    focus: 'clf3-tshape',
  },
  SHARED_TSHAPE_BEAT,
]

export const REVEAL_2_PATHS: Record<Prediction2Key, Bubble[]> = {
  linear: LINEAR_REVEAL_2,
  tshape: TSHAPE_REVEAL_2,
  pyramidal: PYRAMIDAL_REVEAL_2,
  unclassified: UNCLASSIFIED_REVEAL_2,
}

// ---------------------------------------------------------------------------
// Closing — one bubble that ties the whole arc together. The summary card
// (rendered alongside the resources panel) carries the screenshot-friendly
// takeaway.
// ---------------------------------------------------------------------------

export const CLOSING_BUBBLE: Bubble = {
  text:
    "Here's the move. Your chart compresses every 5-domain shape into one row, but they're all the same underlying idea: lone pairs claim equatorial positions because there's more space, and the F's get whatever's left over. Linear, T-shape, see-saw — same logic, different number of lone pairs. The wedge-and-dash drawings can't show you that, which is why the row feels arbitrary. Once you see the 3D version, the chart starts making sense as a description instead of a rule to memorize.",
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
    "Linear molecular geometry, trigonal bipyramidal electron-domain geometry.",
    "3 lone pairs sit in the equatorial plane; 2 F atoms stay axial.",
    "Why equatorial: only two 90° neighbors instead of three — more space.",
    "Same logic across the row: 1 LP → see-saw, 2 LP → T-shape, 3 LP → linear.",
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
// Free-text classifiers — simple keyword heuristics.
// ---------------------------------------------------------------------------

export function classifyPrediction1FreeText(text: string): Prediction1Key {
  const t = text.toLowerCase()

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
  ]
  if (equatorialSignals.some((s) => t.includes(s))) return 'equatorial'

  const notationalSignals = [
    'arbitrary',
    'just drawn',
    'just notation',
    'convention',
    'random',
    'no reason',
    'no specific',
  ]
  if (notationalSignals.some((s) => t.includes(s))) return 'notational'

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
  const t = text.toLowerCase()

  if (t.includes('t-shape') || t.includes('t shape') || t.includes('tshape') || t.includes('t-shaped'))
    return 'tshape'
  if (t.includes('linear') || t.includes('straight line') || t.includes('180')) return 'linear'
  if (t.includes('pyramidal') || t.includes('pyramid')) return 'pyramidal'

  return 'unclassified'
}
