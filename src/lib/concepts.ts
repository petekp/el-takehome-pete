/**
 * Concept registry — slim substrate for the artifact arc.
 *
 * After the XeF2 pivot, the registry still holds:
 *   - triggerCriteria: prose for the server-side classifier.
 *   - title: canonical concept title.
 *   - affordance: the two-button copy and the warm framing line Claude
 *     speaks above them.
 *
 * Concept content (predictions, branches, bubbles, resources) still lives in
 * `artifact-script.ts`, which is now built around Naomi's question:
 *   "When the electron domain is 5, with lone pairs 3, why is the molecular
 *    geometry linear but the electron domain geometry is trigonal
 *    bipyramidal?"
 *
 * The pedagogical move is no longer just representation literacy — it is
 * spatial-reasoning-from-the-real-3D-arrangement. The student's intuition
 * ("lone pairs are blocking the bonds") is partially right; the artifact
 * completes the spatial half she can't see from a 2D Lewis structure.
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
    'The user is stuck on the gap between a 2D Lewis structure or VSEPR chart',
    'and the real 3D arrangement of electron domains around a central atom.',
    'Canonical confusion: a 5-domain molecule with 3 lone pairs (XeF2) reads',
    'as "linear" in the molecular-geometry column but "trigonal bipyramidal"',
    'in the electron-domain-geometry column, and the wedge-and-dash drawing',
    'looks arbitrary. The user can sometimes recite the chart but cannot see',
    'WHY the lone pairs occupy the equatorial plane and the F atoms end up',
    'axial. Signals: "XeF2", "xenon", "5 domains", "3 lone pairs", "lone',
    'pairs are blocking", "wedge and dash is confusing", "molecular geometry',
    'vs electron domain geometry", "trigonal bipyramidal", "Lewis structure',
    'doesn\'t show", "I can read the chart but". The conceptual gap is',
    'spatial: the 2D Lewis structure flattens 3D, so the user cannot see',
    'where the lone pairs actually sit. A bare verbal answer does NOT close',
    'that gap.',
  ].join(' '),
  descriptors: {
    title: 'Molecular geometry',
    fallback: {
      affordance: {
        intro:
          "Okay, I can see the row on your chart you're stuck on, and your Lewis structure. The chart's wedge-and-dash for 5 domains with 3 lone pairs is genuinely confusing because it's trying to compress 3D into 2D, and the Lewis drawing makes it look like the lone pairs are around Xe in a way that blocks the F's from forming bonds. That intuition is half-right and the half that's off is exactly the spatial part. Want to look at it together?",
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
 * Canonical trigger message pre-populated in /new's composer — Naomi's
 * verbatim question, with her real materials attached.
 */
export const TRIGGER_MESSAGE =
  "When the electron domain is 5, with lone pairs 3, why is the molecular geometry linear but the electron domain geometry is trigonal bipyramidal? The way it's drawn on the MG chart is confusing because of the wedge and dash but when I look at the Lewis structure it's obvious that the three lone pairs are blocking the ability for any bonds to form on Xe"

/**
 * The two screenshots Naomi sent along with her question. Served from
 * /public/attachments/; the composer fetches them on /new mount, encodes to
 * base64, and pre-loads them as attachments.
 */
export type TriggerAttachment = {
  /** Public URL (Next.js /public/...). */
  url: string
  /** Display name shown in the chip and the "Your materials" panel. */
  name: string
  /** Image MIME type. */
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
  /** Human-readable description (so the artifact and prompts can refer to it). */
  caption: string
}

export const TRIGGER_ATTACHMENTS: readonly TriggerAttachment[] = [
  {
    url: '/attachments/naomi_chart.jpg',
    name: 'VSEPR chart',
    mediaType: 'image/jpeg',
    caption:
      "Naomi's molecular-geometry chart with her handwritten notes (wedge is out of the page, triangle around the center atom).",
  },
  {
    url: '/attachments/naomi_lewis.jpg',
    name: 'XeF2 Lewis structure',
    mediaType: 'image/jpeg',
    caption:
      "Naomi's Lewis drawing of XeF2 — Xe in the middle with three lone pairs, two F atoms bonded vertically.",
  },
] as const

export function getConcept(id: ConceptId): Concept {
  const c = CONCEPTS.find((x) => x.id === id)
  if (!c) throw new Error(`Unknown concept id: ${id}`)
  return c
}

/**
 * Cheap client-side trigger detector — connectivity backstop when /api/chat
 * is unreachable. Mirrors the server classifier's criteria heuristically.
 * Calibrated for XeF2 / 5-domain / lone-pair-block signals.
 */
export function clientMatchTrigger(text: string): ConceptId | null {
  const lower = text.toLowerCase()
  const hitsXef2 =
    lower.includes('xef2') ||
    lower.includes('xef₂') ||
    lower.includes('xenon difluoride') ||
    lower.includes('xenon')
  const hitsFiveDomain =
    lower.includes('electron domain is 5') ||
    lower.includes('5 domains') ||
    lower.includes('five domains') ||
    lower.includes('trigonal bipyramidal')
  const hitsLonePairBlock =
    lower.includes('lone pairs are blocking') ||
    lower.includes('lone pair is blocking') ||
    lower.includes('lone pairs') ||
    lower.includes('lone pair')
  const hitsRepresentation =
    lower.includes('wedge') ||
    lower.includes('lewis') ||
    lower.includes('mg chart') ||
    lower.includes('molecular geometry')
  if (hitsXef2 && (hitsLonePairBlock || hitsRepresentation || hitsFiveDomain)) {
    return 'molecular-geometry'
  }
  if (hitsFiveDomain && hitsLonePairBlock) return 'molecular-geometry'
  return null
}
