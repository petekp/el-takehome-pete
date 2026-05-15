/**
 * Snapshot of what the user actually did inside the artifact — built at
 * close time and forwarded to /api/wrapper-response so the post-artifact
 * follow-up feels like a continuation of a shared moment instead of a
 * generic "did you find that helpful?" pivot.
 *
 * The wire schema is intentionally small and free of UI plumbing: it's
 * what a friend who watched her work through the artifact would remember.
 * The route converts it to prose hints in the system prompt; it never
 * goes into the user-visible messages array.
 */
import {
  PREDICTION_1,
  PREDICTION_2,
  stepPosition,
  TOTAL_STEPS,
  type Prediction1Key,
  type Prediction2Key,
} from "./artifact-script";
import type {
  ArtifactPrediction1,
  ArtifactPrediction2,
  ArtifactStage,
  ArtifactState,
  ChipState,
  RepresentationPanelId,
} from "./prototype-store";

/** Rough threshold for "she actually grabbed and turned the molecule" vs.
 *  incidental drift. ~17° feels about right; under that and it's likely
 *  the orbit-controls jitter rather than real engagement. */
const ROTATION_ENGAGED_RAD = 0.3;

export type PredictionSummary = {
  /** The full option label she clicked, or null if she answered with free text. */
  selectedOptionLabel: string | null;
  /** Whether the clicked option was the correct one. null for free text. */
  selectedOptionIsCorrect: boolean | null;
  /** Verbatim free-text answer, when provided. */
  freeText: string | null;
  /** Classifier bucket (script's misconception key). */
  bucket: Prediction1Key | Prediction2Key;
};

export type ArtifactInteractionSummary = {
  /** Which stage of the arc the student is on right now. After close,
   *  this is 'closing'. Internal slug — do NOT surface to the user. */
  currentStage: ArtifactStage;
  /** 1-indexed step position the student sees in the artifact's stepper
   *  ("X / Y"). Match the UI's count, not the internal stage count. */
  currentStepPosition: number;
  /** Matching total used in the stepper. */
  totalSteps: number;
  /** Snapshot of which toggle chips are currently on. Lets Claude answer
   *  "what's on screen" / "I turned on the equatorial plane, what does
   *  that show me?" type questions. */
  currentChipState: ChipState;
  completedFullArc: boolean;
  timeInArtifactSec: number;
  prediction1: PredictionSummary | null;
  prediction2: PredictionSummary | null;
  panelsExplored: RepresentationPanelId[];
  manuallyRotated: boolean;
};

function summarizePrediction1(
  p: ArtifactPrediction1 | null,
): PredictionSummary | null {
  if (!p) return null;
  const option = p.optionId
    ? PREDICTION_1.options.find((o) => o.id === p.optionId)
    : undefined;
  return {
    selectedOptionLabel: option?.label ?? null,
    selectedOptionIsCorrect: option ? option.isCorrect : null,
    freeText: p.freeText ?? null,
    bucket: p.key,
  };
}

function summarizePrediction2(
  p: ArtifactPrediction2 | null,
): PredictionSummary | null {
  if (!p) return null;
  const option = p.optionId
    ? PREDICTION_2.options.find((o) => o.id === p.optionId)
    : undefined;
  return {
    selectedOptionLabel: option?.label ?? null,
    selectedOptionIsCorrect: option ? option.isCorrect : null,
    freeText: p.freeText ?? null,
    bucket: p.key,
  };
}

export function buildInteractionSummary(
  artifact: ArtifactState | null,
  now: number = Date.now(),
): ArtifactInteractionSummary | null {
  if (!artifact) return null;
  const elapsedMs = artifact.openedAt > 0 ? now - artifact.openedAt : 0;
  return {
    currentStage: artifact.stage,
    currentStepPosition: stepPosition(artifact.stage, artifact.bubbleIndex),
    totalSteps: TOTAL_STEPS,
    currentChipState: { ...artifact.chipState },
    completedFullArc: artifact.stage === "closing",
    timeInArtifactSec: Math.max(0, Math.round(elapsedMs / 1000)),
    prediction1: summarizePrediction1(artifact.prediction1),
    prediction2: summarizePrediction2(artifact.prediction2),
    panelsExplored: [...artifact.panelsExplored],
    manuallyRotated: artifact.rotationRad >= ROTATION_ENGAGED_RAD,
  };
}
