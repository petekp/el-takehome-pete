/**
 * Concept registry — slim substrate for the artifact arc.
 *
 * After the chemistry pivot, the registry only holds:
 *   - triggerCriteria: prose for the server-side classifier.
 *   - title: canonical concept title.
 *   - affordance: the two-button copy ("just answer it" / "let's look at it
 *     first") and the warm framing line Claude speaks above them.
 *
 * Everything else — prediction options, misconception branches, bubble copy,
 * external resources — lives in `artifact-script.ts`, authored as the
 * load-bearing piece of the prototype.
 */

export type ConceptId = 'molecular-geometry'

export type ConceptDescriptor = {
  /** Canonical concept title used wherever the concept needs a label. */
  title: string
  fallback: {
    affordance: {
      intro: string
      cta: { wrapper: string; learn: string }
    }
  }
}

export type Concept = {
  id: ConceptId
  triggerCriteria: string
  descriptors: ConceptDescriptor
}

const MOLECULAR_GEOMETRY: Concept = {
  id: 'molecular-geometry',
  triggerCriteria: [
    'The user is stuck on the gap between 2D chemistry representations',
    '(Lewis dot structures, wedge-and-dash diagrams, geometry charts) and the',
    'underlying 3D shape of a molecule. Canonical confusion: why ammonia is',
    'trigonal pyramidal but methane is tetrahedral when both have four',
    "electron domains — the user can recite the chart but doesn't see the",
    'molecule in space. Signals: "I just don\'t see the molecule", "why is',
    'ammonia pyramidal", "lone pair", "trigonal pyramidal vs tetrahedral",',
    '"electron domains", "Lewis structure doesn\'t show", "I can read the',
    'chart but", "hybridization", "VSEPR". The conceptual gap is',
    'representation literacy: 2D notations gesture at 3D realities without',
    'flagging the translation. A bare verbal answer (lone pairs push bonds',
    'down) does NOT address the underlying spatial-blindness — that is part',
    'of the conceptual gap.',
  ].join(' '),
  descriptors: {
    title: 'Molecular geometry',
    fallback: {
      affordance: {
        intro:
          "I can just answer that — but I think the chart isn't doing it because your textbook hasn't really shown you the 3D shape yet. Worth a minute to look at it together first?",
        cta: {
          wrapper: 'just answer it',
          learn: "let's look at it together",
        },
      },
    },
  },
}

export const CONCEPTS: readonly Concept[] = [MOLECULAR_GEOMETRY] as const

/**
 * Canonical trigger message pre-populated in /new's composer. Plain language,
 * the user's articulated confusion in her own register.
 */
export const TRIGGER_MESSAGE =
  "I'm stuck on why ammonia is pyramidal but methane is tetrahedral when both have four electron domains. The chart says trigonal pyramidal vs tetrahedral but I don't actually see why."

export function getConcept(id: ConceptId): Concept {
  const c = CONCEPTS.find((x) => x.id === id)
  if (!c) throw new Error(`Unknown concept id: ${id}`)
  return c
}

/**
 * Cheap client-side trigger detector — connectivity backstop when /api/chat
 * is unreachable. Mirrors the server classifier's criteria heuristically.
 */
export function clientMatchTrigger(text: string): ConceptId | null {
  const lower = text.toLowerCase()
  // Geometry/shape language paired with a specific molecule or a lone-pair /
  // domain / hybridization signal.
  const hitsGeometry =
    lower.includes('pyramidal') ||
    lower.includes('tetrahedral') ||
    lower.includes('trigonal') ||
    lower.includes('bent') ||
    lower.includes('linear') ||
    lower.includes('bond angle')
  const hitsConceptualHook =
    lower.includes('lone pair') ||
    lower.includes('electron domain') ||
    lower.includes('lewis') ||
    lower.includes('vsepr') ||
    lower.includes('hybridization') ||
    lower.includes("don't see the molecule") ||
    lower.includes("don't see why") ||
    lower.includes("can't see why")
  if (hitsGeometry && hitsConceptualHook) return 'molecular-geometry'
  return null
}
