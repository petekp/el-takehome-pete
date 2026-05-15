/**
 * The Artifact component renders inside the chat as a real, on-screen
 * interactive surface — but at the API layer it shows up as an assistant
 * message whose body is the bare `<artifact/>` tag. Sending that tag
 * to the model verbatim makes Claude apologize for "broken tags." Sending
 * a first-person narration ("I'm presenting an interactive…") makes Claude
 * worse: it reads the line as a prior turn of itself claiming a capability
 * it doesn't think it has, and apologizes for the imagined hallucination.
 *
 * So the swap is third-person, bracketed, environmental — a meta-note that
 * reads obviously as host-application context rather than Claude's own
 * speech. We pair it with a system-prompt calibration in /api/chat that
 * tells Claude (a) this rendered for real, (b) which step the student is
 * on (matching the visible "X / Y" stepper), and (c) what was answered
 * inside.
 *
 * The narration intentionally uses no internal slugs (no "predict-1" or
 * "reveal-2") and no gendered pronouns (we don't know who the user is).
 * Claude tends to parrot whatever labels and pronouns appear in the
 * prompt; everything below is calibrated to that.
 */

import type { ArtifactInteractionSummary } from './artifact-interaction'

/** Sentinel string committed as the artifact placeholder message body.
 *  Both the UI renderer and the chat-history sanitizer key on this. */
export const ARTIFACT_PLACEHOLDER = '<artifact/>'

/** Sentinel emitted at the end of the affordance message. UI strips it
 *  when rendering; the sanitizer strips it when encoding for the model. */
export const AFFORDANCE_PLACEHOLDER = '<affordance/>'

/** Bracketed third-person description swapped in for `<artifact/>` when
 *  encoding history for the model. Written as an environmental note so
 *  Claude reads it as host-app state, not as its own prior claim. */
export const ARTIFACT_NARRATION = `[ARTIFACT RENDERED INLINE — host-application annotation, not Claude's prior speech]

An interactive 3D walkthrough about VSEPR molecular geometry rendered inline at this point in the conversation. The user is looking at it on screen right now (or just stepped back into chat from it). It is a real, rendered surface in the host application — not a description or a plan.

What's in it:

The walkthrough is an 8-step arc, paced one short bubble at a time, with a "Back / N of 8 / Next" stepper at the bottom-right that the user clicks through. The 8 steps map to six conceptual beats:

  - Steps 1–2 (opening): names the user's "blocking" intuition and reframes it spatially, then brings up XeF2 in 3D — two F atoms axial (top/bottom), three lone pairs in the equatorial plane around Xe — and invites drag-rotate.
  - Step 3 (first prediction): asks why the lone pairs ended up equatorial instead of axial. Three multiple-choice options ("the drawing is arbitrary", "equatorial has more space — fewer 90° neighbors", "F atoms push the lone pairs out") plus a free-text field. The free-text answer is auto-classified into one of several misconception families and the next beat is tailored to that classification.
  - Steps 4–5 (the answer to the first prediction): one bridging bubble tailored to whichever answer was given, then a strain demo — the user can grab a lone pair and try to drag it toward an axial seat. The molecule resists. Axial seats have three neighbors at 90°, equatorial only two; lone pairs need elbow room, so they take the roomier seats.
  - Step 6 (second prediction): asks what shape 5 domains with 2 lone pairs makes. Three options (linear / T-shape / trigonal pyramidal). T-shape is correct.
  - Step 7 (the answer to the second prediction): switches the 3D scene to ClF3 (the 2-lone-pair case, T-shape) and surfaces a "5-domain row" selector below the viewport. The user can step through PF5 (0 LP, trigonal bipyramidal), SF4 (1 LP, seesaw), ClF3 (2 LP, T-shape), XeF2 (3 LP, linear). Same row of the VSEPR chart, different lone-pair counts.
  - Step 8 (closing): a synthesis card that ties the three layers together (Lewis → count of bonds/lone pairs; VSEPR → spatial arrangement of those domains; molecular geometry → where the atoms sit). Two CTAs at the bottom: a "Done" button (Claude orange, returns to chat) and a "Some more resources to check out" button.

The 3D viewport (Three.js) supports click-and-drag to rotate (OrbitControls) and pinch/scroll to zoom. Lone pairs render as translucent grey lobes perpendicular to the bond axis. Below the viewport are four toggle chips:
  - Bonds — on by default. Toggles the Xe–F bond cylinders.
  - Lone pairs — on by default (the whole point of the artifact). Toggles the LP lobes.
  - Equatorial plane — off by default. Reveals a translucent disc through the three equatorial seats so the "equatorial plane" language has a visible referent.
  - Bond angles — off by default. Surfaces the 180° F–Xe–F indicator (and 90° axial-equatorial cues when relevant).

The chip state advances automatically as the arc progresses (e.g. the equatorial plane disc turns on for the first-answer beats; the bond-angle indicator turns on for the molecular-geometry beat), but the user can override any chip manually.

Three representation panels are pinned on the right side of the artifact:
  - "Your materials" — thumbnails of the photos the user attached on the original chat message (a VSEPR chart and a hand-drawn Lewis structure for XeF2). Surfaced so the artifact stays grounded in the actual materials.
  - "Lewis structure" — a clean re-rendering of the Lewis dot structure with 3 lone pairs on each F (octet) and 3 lone pairs on Xe.
  - "Molecular geometry" — a panel-driven treatment of the 3D scene (isolates the geometry layer; dims the others).
Clicking a panel enters an isolation/treatment mode on the scene; clicking again exits.

External resources surfaced at the close (under "Some more resources to check out"): MolView (molview.org — rotate any molecule in 3D) and the Wikipedia VSEPR theory primer.

[END ARTIFACT ANNOTATION]`

/**
 * Builds the system prompt for /api/chat turns that follow an artifact
 * being opened. The static prologue calibrates Claude against denying the
 * artifact rendered; the live-state block (when present) tells Claude
 * what was answered inside, which step is current, and what is visible on
 * screen right now — so it can respond accurately to "what step am I on",
 * "did I get that right", etc.
 *
 * Both halves end with an explicit list of phrasing rules: don't leak
 * internal slugs, don't assume the user's gender, don't enumerate the
 * live state back as a list.
 */
export function postArtifactSystemPrompt(
  interaction: ArtifactInteractionSummary | null,
): string {
  const sections: string[] = [
    `Important context: earlier in this conversation, an interactive 3D walkthrough rendered inline in the chat (the host application has artifact-rendering capabilities — this is not a hypothetical or a Claude hallucination). The bracketed [ARTIFACT RENDERED INLINE] annotation in the assistant history describes what is in it. The user can see the artifact on screen right now, or just stepped back into chat after closing it.

When the user asks about it — "how do I rotate it", "what comes next", "what does the row chip do", "did I get that right" — answer directly. Do not say it didn't render, do not apologize, do not call it a description or a plan. It is a real, rendered surface the user is looking at. The annotation is your reference for its structure and controls; the live-state block below (when present) is your reference for what has actually happened inside.`,
  ]

  if (interaction) {
    const lines: string[] = []

    // Step position the user actually sees in the stepper.
    lines.push(
      `Stepper position: step ${interaction.currentStepPosition} of ${interaction.totalSteps}. ${stepNaturalDescription(interaction)}`,
    )
    if (interaction.completedFullArc) {
      lines.push(
        'The arc is complete — the user is on the closing synthesis card. From here the user can go back through earlier steps with the back-stepper, or click "Done" to return to chat.',
      )
    }

    // What was answered inside, in the order it was asked.
    if (interaction.prediction1) {
      lines.push(
        `First prediction (why are the lone pairs equatorial?) — ${describePredictionForChat(interaction.prediction1)}`,
      )
    }
    if (interaction.prediction2) {
      lines.push(
        `Second prediction (5 domains, 2 lone pairs → what shape?) — ${describePredictionForChat(interaction.prediction2)}`,
      )
    }

    // What's visible on screen right now.
    const visibleChips = chipsCurrentlyVisible(interaction.currentChipState)
    if (visibleChips.length > 0) {
      lines.push(`Currently visible in the 3D viewport: ${visibleChips.join(', ')}.`)
    }

    // Lower-signal engagement breadcrumbs.
    if (interaction.panelsExplored.length > 0) {
      const panelLabels = interaction.panelsExplored.map(panelLabel)
      lines.push(`Representation panels clicked into so far: ${panelLabels.join(', ')}.`)
    }
    if (interaction.manuallyRotated) {
      lines.push('The 3D molecule has been rotated manually (the user has been moving the view).')
    }

    sections.push(
      [
        "LIVE STATE — what the user has actually done inside the artifact (use to answer questions about the user's own progress; never read this back as a list):",
        ...lines.map((l) => `  - ${l}`),
      ].join('\n'),
    )
  }

  sections.push(
    [
      'PHRASING RULES — apply to anything you say about the artifact:',
      '  - Never use internal labels. The artifact has no "stages" or "predict-1" or "reveal-2" or "buckets". Refer to steps by their position in the visible stepper ("step 7 of 8") or by their content ("the second prediction question", "the answer to the first prediction").',
      "  - Never assume the user's gender. Do NOT use \"she/her\" or \"he/him\". Address the user as \"you\", or refer to them as \"the user\" / \"the student\" only when speaking about them in the third person. Same applies if reasoning out loud — use \"you\" or \"they\".",
      "  - Don't enumerate the live-state block. It is your memory of the session, not a script. Reference it naturally when relevant; never dump it back.",
      '  - Tone: warm, peer-level, plainspoken. Do not lecture. Do not grade ("great job", "you got it right"). Answer the actual question first, briefly.',
    ].join('\n'),
  )

  return sections.join('\n\n')
}

/**
 * Plain-English description of what's happening at the current step. No
 * internal slugs.
 */
function stepNaturalDescription(interaction: ArtifactInteractionSummary): string {
  switch (interaction.currentStage) {
    case 'opening':
      return 'This is one of the two opening beats — XeF2 in 3D for the first time, before any prediction questions.'
    case 'predict-1':
      return 'This is the first prediction question, asking why the lone pairs ended up in the equatorial plane. Three multiple-choice options plus a free-text field; no answer is correct until the user picks one.'
    case 'reveal-1':
      return 'This is one of the two answer-to-the-first-prediction beats: a bridging bubble tailored to what the user picked, followed by a strain demo where the user can drag a lone pair toward an axial seat and feel the molecule resist.'
    case 'predict-2':
      return 'This is the second prediction question — 5 domains with 2 lone pairs, what shape (linear / T-shape / trigonal pyramidal). T-shape is the correct answer.'
    case 'reveal-2':
      return 'This is the answer to the second prediction — the scene has switched to ClF3 (T-shape), and the 5-domain row selector is now available so the user can compare PF5 / SF4 / ClF3 / XeF2.'
    case 'closing':
      return 'This is the closing synthesis card (Lewis count → VSEPR arrangement → molecular geometry) plus the resources offer.'
    default:
      return ''
  }
}

/**
 * Phrase a prediction for Claude in natural English. No bucket key, no
 * gendered pronoun. Option label is included verbatim so Claude can echo
 * a specific phrase if it lands naturally; correctness is plain English.
 */
function describePredictionForChat(
  p: NonNullable<ArtifactInteractionSummary['prediction1']>,
): string {
  const correctness =
    p.selectedOptionIsCorrect === true
      ? 'this was the correct answer'
      : p.selectedOptionIsCorrect === false
        ? 'this option was incorrect'
        : 'free-text answer — no auto-grading'
  const what = p.selectedOptionLabel
    ? `the user picked: "${p.selectedOptionLabel}"`
    : p.freeText
      ? `the user wrote: "${p.freeText.slice(0, 200)}"`
      : 'an answer was submitted but no label was captured'
  return `${what} (${correctness}).`
}

function chipsCurrentlyVisible(chips: ArtifactInteractionSummary['currentChipState']): string[] {
  const visible: string[] = []
  if (chips.bonds) visible.push('bonds')
  if (chips.lonePairs) visible.push('lone pairs')
  if (chips.equatorialPlane) visible.push('the equatorial plane disc')
  if (chips.angles) visible.push('bond-angle indicators')
  return visible
}

function panelLabel(id: 'materials' | 'lewis' | 'geometry'): string {
  if (id === 'materials') return 'Your materials'
  if (id === 'lewis') return 'Lewis structure'
  return 'Molecular geometry'
}

/**
 * Replace an assistant message's text with the bracketed artifact
 * annotation when it is the bare placeholder, and strip trailing
 * affordance tags otherwise.
 */
export function sanitizeAssistantTextForModel(text: string): string {
  const trimmed = text.trim()
  if (trimmed === ARTIFACT_PLACEHOLDER) return ARTIFACT_NARRATION
  // The affordance tag is a UI marker that ends the message; the prose
  // before it is real content Claude wrote. Strip just the tag.
  if (text.includes(AFFORDANCE_PLACEHOLDER)) {
    return text.replace(AFFORDANCE_PLACEHOLDER, '').trimEnd()
  }
  return text
}
