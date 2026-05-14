/**
 * Artifact script — the load-bearing piece of the prototype.
 *
 * The artifact is a single inline interactive surface inside the chat. It
 * opens, hosts a 3D molecule viewport flanked by 2D representation panels,
 * runs the user through TWO prediction beats (with branching reveals), then
 * closes by pointing past itself toward external resources.
 *
 * The pedagogical move is REPRESENTATION LITERACY: Lewis structures, wedge-
 * and-dash diagrams, geometry charts, and 3D models are different lenses on
 * the same spatial reality, each useful for different questions. The course
 * teaches them as escalating abstractions; they are actually parallel
 * representations. Teaching the user to read them as lenses (rather than as
 * rules to memorize) unlocks the spatial intuition organic chemistry
 * presupposes.
 *
 * Triangulation is the epistemic move on each prediction: each wrong answer
 * maps to a distinct, structurally coherent misread of how a representation
 * relates to a 3D molecule. The reveal honors the user's prior thinking
 * before relocating it.
 *
 * Voice everywhere is a jovial knowledgeable friend who remembers what it
 * was like to take chemistry. Not a tutor. No scoring, no "great job," no
 * completion states, no badges, no celebratory animations. Calibrated
 * honesty: when a representation has limitations, name them.
 */

export type Molecule = 'methane' | 'ammonia' | 'ammonium' | 'water'

/**
 * Focus states encode WHAT THE VIZ SHOULD BE EMPHASIZING at each bubble.
 * They are not just animations — each foregrounds the part of the molecule
 * (or panel) the bubble is talking about, and dims the rest.
 *
 *   default               — viewport idle, no emphasis.
 *   lewis-spotlight       — Lewis panel highlighted, other panels dim.
 *                           3D scene neutral.
 *   all-panels            — all four representation panels equally lit.
 *   panels-explore        — explore-the-panels invite (Beat 3 gate).
 *   lewis-omits           — Beat 4: subtly highlight that Lewis omits angles
 *                           (e.g. dim the geometry-card bond-angle line then
 *                           pop it).
 *   ammonia-lewis         — Beat 5/6: ammonia in 3D, Lewis panel emphasized.
 *   lone-pair-spatial     — Beat 7/8: lone pair foregrounded in 3D scene,
 *                           geometry-card highlighted.
 *   ammonium-tetrahedral  — Beat 8: NH4+ visible (lone pair gone), three
 *                           N–H bonds spring outward to 109.5°.
 *   water-bond-angle      — Beat 9/10: water in 3D, bond-angle annotation
 *                           highlighted.
 *   closing               — Beat 11: all panels + 3D view equally lit,
 *                           multi-lens framing.
 */
export type FocusState =
  | 'default'
  | 'lewis-spotlight'
  | 'all-panels'
  | 'panels-explore'
  | 'lewis-omits'
  | 'ammonia-lewis'
  | 'lone-pair-spatial'
  | 'ammonium-tetrahedral'
  | 'water-bond-angle'
  | 'closing'

/**
 * Misconception tags for prediction 1 (Lewis-tells-shape question on
 * ammonia). The two wrong options are NOT equivalent — they encode
 * structurally distinct misreads of what a Lewis structure carries:
 *
 *   shape-flat       — "Yes, Lewis shows it's flat with the lone pair on top"
 *                      Misreads the 2D drawing as a top-down map of the
 *                      molecule's actual geometry.
 *   shape-pyramidal  — "Yes, Lewis shows it's pyramidal"
 *                      Lands on the right answer for the wrong reason —
 *                      thinks Lewis encodes geometry when it just doesn't.
 *   truth            — "No, Lewis structures don't carry shape information"
 *                      Correct.
 *   unclassified     — free-text we couldn't route.
 */
export type MisconceptionKey = 'shape-flat' | 'shape-pyramidal' | 'truth' | 'unclassified'

export type PredictionOption = {
  id: string
  label: string
  isCorrect: boolean
  misconceptionTag: MisconceptionKey
}

export type Bubble = {
  text: string
  /** Active molecule for this bubble. If unspecified, keep the current one. */
  molecule?: Molecule
  /** Focus state to drive into when this bubble becomes active. */
  focus?: FocusState
  /**
   * Beat-3-style gates: the bubble does not progress until the user has
   * interacted with the artifact in a specific way. Currently only used by
   * the panels-explore beat (waits for ≥2 representation panel clicks).
   */
  gate?: 'panels-explored'
}

export type ArtifactPath = {
  /** Sequence after the user submits their first prediction. */
  reveal1: Bubble[]
  followUp: {
    framing: string
    options: PredictionOption[]
  }
  /** Sequence after they submit the follow-up, keyed by follow-up optionId. */
  reveal2: Record<string, Bubble[]>
}

/** External resources rendered at the end of the artifact. */
export type Resource = { title: string; url: string; source: string }

// ----------------------------------------------------------------------
// The opening sequence — beats 1 through 5, before prediction 1.
// Five bubbles. Beat 3 ("try clicking each panel") gates on the user
// interacting with at least two representation panels.
// ----------------------------------------------------------------------

export const OPENING_BUBBLES: Bubble[] = [
  {
    text: "Your textbook is showing you the same molecule in like four different ways and not really telling you they're different ways. Let me lay them out side by side so you can see what each one's doing.",
    molecule: 'methane',
    focus: 'lewis-spotlight',
  },
  {
    text: "These are all representing the same thing. The 3D model up top is the truth — the molecule actually in space. The diagrams down below are abstractions, each one focused on a different aspect.",
    molecule: 'methane',
    focus: 'all-panels',
  },
  {
    text: "Try clicking each panel. See what each one captures — and what it leaves out.",
    molecule: 'methane',
    focus: 'panels-explore',
    gate: 'panels-explored',
  },
  {
    text: "Notice how the Lewis structure doesn't tell you about angles? That's by design. It's just a bookkeeping tool for electrons. When your professor draws a Lewis structure on the board, they're not telling you what the molecule looks like in space — that's a different question for a different diagram.",
    molecule: 'methane',
    focus: 'lewis-omits',
  },
  {
    text: "Let's switch to a molecule where this gets interesting.",
    molecule: 'ammonia',
    focus: 'ammonia-lewis',
  },
]

// ----------------------------------------------------------------------
// Prediction 1 — Lewis-tells-shape question on ammonia.
// Three options + free-text. The correct answer ("no, Lewis doesn't carry
// shape") is option 3. The two wrong options are distinct misreads.
// ----------------------------------------------------------------------

export const PREDICTION_1: { framing: string; options: PredictionOption[] } = {
  framing:
    "Quick check. The Lewis structure for ammonia shows three N–H bonds and one lone pair on nitrogen. If you only had the Lewis structure to go on — could you tell me what shape this molecule is in 3D?",
  options: [
    {
      id: 'flat',
      label: "Yes — it's flat, with the lone pair sitting on top of the nitrogen.",
      isCorrect: false,
      misconceptionTag: 'shape-flat',
    },
    {
      id: 'pyramidal',
      label: "Yes — it's pyramidal, three hydrogens fanning out below the lone pair.",
      isCorrect: false,
      misconceptionTag: 'shape-pyramidal',
    },
    {
      id: 'truth',
      label: "No — Lewis structures don't really carry shape information.",
      isCorrect: true,
      misconceptionTag: 'truth',
    },
  ],
}

// ----------------------------------------------------------------------
// Shared post-reveal-1 beats that ALL paths converge into: the "lone pair
// takes space" reveal (Beat 8), the ammonium toggle moment, and the
// transition to water (Beat 9 prose). Authored once, referenced from each
// path's reveal1 array so each branch can prepend its honor-then-correct
// bubbles in front.
// ----------------------------------------------------------------------

const SHARED_LONE_PAIR_BEATS: Bubble[] = [
  {
    text: "Here's the thing your textbook is bad at showing. That lone pair isn't just notation — it's a region of electron density that physically occupies space, just like a bond does. Watch.",
    molecule: 'ammonia',
    focus: 'lone-pair-spatial',
  },
  {
    text: "If we strip the lone pair off — say, by protonating nitrogen — we get ammonium, NH4⁺. No lone pair, four bonded pairs, fully tetrahedral. The lone pair is exactly what makes ammonia pyramidal.",
    molecule: 'ammonium',
    focus: 'ammonium-tetrahedral',
  },
  {
    text: "You can toggle the lone pair on and off with the chip up top to watch the geometry breathe. The angle springs from 107° toward 109.5° as soon as the lone pair leaves.",
    molecule: 'ammonia',
    focus: 'lone-pair-spatial',
  },
]

// ----------------------------------------------------------------------
// Per-misconception branches for prediction 1.
// reveal1 honors the user's mental model BEFORE relocating it, then merges
// into the shared lone-pair-takes-space content.
// ----------------------------------------------------------------------

const FLAT_PATH: ArtifactPath = {
  reveal1: [
    {
      text: "It's tempting to read shape into the Lewis structure — but those positions around the nitrogen are just drawn that way for clarity on the page. The lone pair sitting 'on top' is a 2D convention, not a 3D claim.",
      molecule: 'ammonia',
      focus: 'ammonia-lewis',
    },
    {
      text: "Lewis deliberately doesn't tell you about angles or directions in space. It's an electron-bookkeeping tool, not a geometry diagram. Watch what ammonia actually looks like.",
      molecule: 'ammonia',
      focus: 'lone-pair-spatial',
    },
    ...SHARED_LONE_PAIR_BEATS,
  ],
  followUp: {
    framing: "Water has two lone pairs on oxygen. What do you think happens to the H–O–H bond angle compared to ammonia's 107°?",
    options: [
      {
        id: 'same',
        label: 'About the same — both have lone pairs, so ~107°.',
        isCorrect: false,
        misconceptionTag: 'shape-flat',
      },
      {
        id: 'smaller',
        label: 'Smaller — closer to 104°.',
        isCorrect: true,
        misconceptionTag: 'truth',
      },
      {
        id: 'larger',
        label: 'Larger — the lone pairs push the bonds wider, maybe ~120°.',
        isCorrect: false,
        misconceptionTag: 'shape-flat',
      },
    ],
  },
  reveal2: {
    same: [
      {
        text: "Close, but lone pairs aren't all the same — two lone pairs push harder than one. Adding another lone pair compresses the bond angle further.",
        molecule: 'water',
        focus: 'water-bond-angle',
      },
      {
        text: "Water comes in at ~104.5°. Each lone pair occupies more space than a bonded pair, so two of them crowd the H–O–H bonds tighter than ammonia's H–N–H bonds.",
        molecule: 'water',
        focus: 'water-bond-angle',
      },
    ],
    smaller: [
      {
        text: "Yep — ~104.5°. Two lone pairs push even harder than one. The bond angle compresses.",
        molecule: 'water',
        focus: 'water-bond-angle',
      },
      {
        text: "That's the move: each electron pair takes up space, and lone pairs take more than bonded ones. More lone pairs = tighter bonded-pair angles.",
        molecule: 'water',
        focus: 'water-bond-angle',
      },
    ],
    larger: [
      {
        text: "Other way around — lone pairs squeeze bonded pairs tighter, not wider apart. They take up MORE space than a bonded pair, so they push the bonds closer together.",
        molecule: 'water',
        focus: 'water-bond-angle',
      },
      {
        text: "Water lands at ~104.5°. Two lone pairs compress the H–O–H angle below ammonia's 107°.",
        molecule: 'water',
        focus: 'water-bond-angle',
      },
    ],
  },
}

const PYRAMIDAL_PATH: ArtifactPath = {
  reveal1: [
    {
      text: "Pyramidal IS the right shape — but you got there for the wrong reason. Lewis doesn't actually encode geometry. You can read 'three bonds and one lone pair' off it, but the 'pyramidal' part isn't in the picture — you're filling that in from somewhere else.",
      molecule: 'ammonia',
      focus: 'ammonia-lewis',
    },
    {
      text: "Worth catching, because it'll bite you on molecules where the shape is less familiar. Lewis is bookkeeping; geometry comes from the 3D picture and the VSEPR chart.",
      molecule: 'ammonia',
      focus: 'lone-pair-spatial',
    },
    ...SHARED_LONE_PAIR_BEATS,
  ],
  followUp: {
    framing: "Water has two lone pairs on oxygen. What do you think happens to the H–O–H bond angle compared to ammonia's 107°?",
    options: [
      {
        id: 'same',
        label: 'About the same — both have lone pairs, so ~107°.',
        isCorrect: false,
        misconceptionTag: 'shape-pyramidal',
      },
      {
        id: 'smaller',
        label: 'Smaller — closer to 104°.',
        isCorrect: true,
        misconceptionTag: 'truth',
      },
      {
        id: 'larger',
        label: 'Larger — the lone pairs push the bonds wider, maybe ~120°.',
        isCorrect: false,
        misconceptionTag: 'shape-pyramidal',
      },
    ],
  },
  reveal2: {
    same: [
      {
        text: "Close, but lone pairs aren't all the same — two lone pairs push harder than one. Adding another lone pair compresses the bond angle further.",
        molecule: 'water',
        focus: 'water-bond-angle',
      },
      {
        text: "Water comes in at ~104.5°. Each lone pair occupies more space than a bonded pair, so two of them crowd the H–O–H bonds tighter than ammonia's H–N–H bonds.",
        molecule: 'water',
        focus: 'water-bond-angle',
      },
    ],
    smaller: [
      {
        text: "Yep — ~104.5°. Two lone pairs push even harder than one. The bond angle compresses.",
        molecule: 'water',
        focus: 'water-bond-angle',
      },
      {
        text: "That's the move: each electron pair takes up space, and lone pairs take more than bonded ones. More lone pairs = tighter bonded-pair angles.",
        molecule: 'water',
        focus: 'water-bond-angle',
      },
    ],
    larger: [
      {
        text: "Other way around — lone pairs squeeze bonded pairs tighter, not wider apart. They take up MORE space than a bonded pair, so they push the bonds closer together.",
        molecule: 'water',
        focus: 'water-bond-angle',
      },
      {
        text: "Water lands at ~104.5°. Two lone pairs compress the H–O–H angle below ammonia's 107°.",
        molecule: 'water',
        focus: 'water-bond-angle',
      },
    ],
  },
}

const TRUTH_PATH: ArtifactPath = {
  reveal1: [
    {
      text: "Right — Lewis is just electron bookkeeping. Three bonds and a lone pair is all it tells you. The shape comes from the 3D picture and the VSEPR chart, not from the dots.",
      molecule: 'ammonia',
      focus: 'ammonia-lewis',
    },
    ...SHARED_LONE_PAIR_BEATS,
  ],
  followUp: {
    framing: "Water has two lone pairs on oxygen. What do you think happens to the H–O–H bond angle compared to ammonia's 107°?",
    options: [
      {
        id: 'same',
        label: 'About the same — both have lone pairs, so ~107°.',
        isCorrect: false,
        misconceptionTag: 'truth',
      },
      {
        id: 'smaller',
        label: 'Smaller — closer to 104°.',
        isCorrect: true,
        misconceptionTag: 'truth',
      },
      {
        id: 'larger',
        label: 'Larger — the lone pairs push the bonds wider, maybe ~120°.',
        isCorrect: false,
        misconceptionTag: 'truth',
      },
    ],
  },
  reveal2: {
    same: [
      {
        text: "Close, but lone pairs aren't all the same — two lone pairs push harder than one. Adding another lone pair compresses the bond angle further.",
        molecule: 'water',
        focus: 'water-bond-angle',
      },
      {
        text: "Water comes in at ~104.5°. Each lone pair occupies more space than a bonded pair, so two of them crowd the H–O–H bonds tighter than ammonia's H–N–H bonds.",
        molecule: 'water',
        focus: 'water-bond-angle',
      },
    ],
    smaller: [
      {
        text: "Yep — ~104.5°. Two lone pairs push even harder than one. The bond angle compresses.",
        molecule: 'water',
        focus: 'water-bond-angle',
      },
      {
        text: "That's the move: each electron pair takes up space, and lone pairs take more than bonded ones. More lone pairs = tighter bonded-pair angles.",
        molecule: 'water',
        focus: 'water-bond-angle',
      },
    ],
    larger: [
      {
        text: "Other way around — lone pairs squeeze bonded pairs tighter, not wider apart. They take up MORE space than a bonded pair, so they push the bonds closer together.",
        molecule: 'water',
        focus: 'water-bond-angle',
      },
      {
        text: "Water lands at ~104.5°. Two lone pairs compress the H–O–H angle below ammonia's 107°.",
        molecule: 'water',
        focus: 'water-bond-angle',
      },
    ],
  },
}

// Fallback path for free-text answers we can't classify. Skip the
// honor-then-correct dance and go straight to "here's what's going on,
// check that against your hypothesis."
const UNCLASSIFIED_PATH: ArtifactPath = {
  reveal1: [
    {
      text: "Interesting. Let me show you what's actually going on, and you can check it against what you were thinking.",
      molecule: 'ammonia',
      focus: 'ammonia-lewis',
    },
    {
      text: "Lewis structures are electron bookkeeping — three N–H bonds, one lone pair. They don't carry geometry. The shape lives somewhere else.",
      molecule: 'ammonia',
      focus: 'lone-pair-spatial',
    },
    ...SHARED_LONE_PAIR_BEATS,
  ],
  followUp: TRUTH_PATH.followUp,
  reveal2: TRUTH_PATH.reveal2,
}

export const PATHS: Record<MisconceptionKey, ArtifactPath> = {
  'shape-flat': FLAT_PATH,
  'shape-pyramidal': PYRAMIDAL_PATH,
  truth: TRUTH_PATH,
  unclassified: UNCLASSIFIED_PATH,
}

// ----------------------------------------------------------------------
// Closing — one bubble carrying the representation-literacy insight that
// the whole artifact has been building toward. The artifact ends pointing
// past itself (toward external 3D viewers and toward organic chemistry).
// ----------------------------------------------------------------------

export const CLOSING_BUBBLE: Bubble = {
  text: "Here's the move. The Lewis structure is for tracking electrons. The geometry chart is for predicting shape. The 3D view is what they're both trying to describe. Once you can see the molecule in 3D, the chart starts making sense as a description instead of a rule to memorize — and when organic chemistry rolls around, you'll be tracking these shapes through reactions, way easier if you can already see them.",
  focus: 'closing',
}

export const RESOURCES: Resource[] = [
  {
    title: 'MolView — interactive 3D viewer',
    url: 'https://molview.org/',
    source: 'molview.org',
  },
  {
    title: 'VSEPR theory',
    url: 'https://en.wikipedia.org/wiki/VSEPR_theory',
    source: 'Wikipedia',
  },
]

// ----------------------------------------------------------------------
// Free-text classifier — simple keyword heuristic. Maps the user's free
// response to the closest of the three structural misreads, or
// 'unclassified' for the generic "interesting, let me show you" path.
// ----------------------------------------------------------------------

export function classifyFreeText(text: string): MisconceptionKey {
  const t = text.toLowerCase()

  // Truth indicators: explicit acknowledgment that Lewis doesn't encode
  // shape / geometry / angles.
  const truthSignals = [
    "doesn't carry",
    "doesn't tell",
    "doesn't show",
    "doesn't encode",
    'no shape',
    'no geometry',
    'no angle',
    'bookkeeping',
    'electron count',
    'just electrons',
    'just dots',
    'just bonds',
    'not in lewis',
    'lewis is for',
    'lewis only',
  ]
  if (truthSignals.some((s) => t.includes(s))) return 'truth'

  // Flat indicators: language about lying flat, top-down, lone pair on top,
  // planar, 2D-as-truth.
  const flatSignals = [
    'flat',
    'planar',
    'top down',
    'top-down',
    'on top',
    'above the',
    'sits on top',
    'looks flat',
    'in a plane',
  ]
  if (flatSignals.some((s) => t.includes(s))) return 'shape-flat'

  // Pyramidal indicators: arriving at the right answer via Lewis (right
  // answer wrong reason).
  const pyramidalSignals = [
    'pyramidal',
    'pyramid',
    'tetrahedral',
    'three down',
    'three below',
    'three at the bottom',
    'fanning out',
    'pointing down',
  ]
  if (pyramidalSignals.some((s) => t.includes(s))) return 'shape-pyramidal'

  return 'unclassified'
}
