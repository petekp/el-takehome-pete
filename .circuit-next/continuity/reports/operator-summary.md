# Circuit Handoff

Source: saved continuity record
Record: continuity-3b94f6c1-799f-4b0d-9703-e15deeb2bf44
Kind: standalone

## Goal
Seed post-artifact Claude dialogue with the user's interactions inside the artifact

## Next Action
Design a mechanism to capture artifact interaction state (predictions, panels explored, row scrubs, rotation, time-in-artifact) and forward it to the wrapper-followup completion so Claude can reference what the user actually did

## State
- Per-chat arc persistence is shipped. `PrototypeState` is now `{ arcs: Record<chatId, ArcState>, currentChatId }`; transitions go through a `withActiveArc()` helper; chat page calls `setCurrentChatId(chatId)` on mount; `/new` clears it. Storage key bumped to `education-labs:prototype-state:v6-per-chat`. Verified end-to-end: leaving a chat and returning preserves the artifact in place instead of collapsing to the "Molecular geometry explainer · closed" pill.
- PredictPanel hover: connected round-rect of options + separate textarea, accent-blue bg/text/number-badge + 1px inset accent ring on hover, no transitions, dividers stay visible, first/last buttons honor container radius.
- BubbleCard renders keyword spans (Xe/Xenon, F/Fluorine, lone pair(s)) tinted with legend bg colors + `-mx-1` negative margin to keep tracking honest.
- RightPane footer is now an absolute overlay with `from-page` gradient as bg; scroll content extends `pb-16` so CTAs can scroll under the stepper without being permanently obscured. Top fade overlay removed.
- 5-domain row chip became a select menu (LonePairSelect) and is now gated to `reveal-2` + `closing` only; it auto-opens at ClF3 on entering reveal-2.
- Reveal-head beats suppress the inline literacy panel so the geometry/Lewis card never wedges between attribution and bubble.
- Color treatment inverted: Three.js scene bg is white `0xffffff`, right pane uses `--color-surface-dim: #fbfaf7`, controls + reset button use `bg-surface/95`. Lewis structure now shows 3 LPs per F (octet) via `bondDirection`-aware `FluorineWithLonePairs`.
- Intro animation: only the Three.js `moleculeGroup` scales 0.92→1 and rotates from -0.55rad→0 inside RAF; the wrapper div just fades opacity.
- ControlChip popovers are single-open (shared `OpenChipCtx` keyed by `useId()`); popover exit animation removed so switching chips doesn't leave a half-faded twin.
- LP strain orange glow capped at `opacity = min(0.5, 0.15 * strain)` and `scale = 1 + min(strain, 2) * 0.12` so it never fully covers both pairs on overlap.
- Attachments header pulse cue + `cuePulse` prop chain fully removed.
- Closing-state CTAs: Done button is Claude orange `#cc785c` primary; Resources CTA renamed to "Some more resources to check out" with header's `BookOpen` icon; `gap-1` between the two; SummaryOverlay + dead code pruned.
- Legend `px-3 py-1.5` lines its first dot up with the View label and vertical-centers with the Reset View button.

## Debt
- `closeArtifact` currently streams `/api/wrapper-response` with ONLY the original trigger user message — no signal of what happened inside the artifact (predictions, panels explored, time, rotation amount, row scrubs). This is the exact seam to extend next session for the artifact→dialogue context bridge.
- `/api/wrapper-response` does not currently accept any artifact-interaction payload. Will need a schema for what to send (predictions, panel exploration, free-text answers, optional time/rotation telemetry) and a system-prompt strategy so Claude can reference it naturally without sounding like it's reading a log.
- `activeCue` "panel-materials" still broadcasts from the script but no longer has a visual receiver after the pulse removal — cue is now a no-op string. Either wire it back to something or remove it from the script.
- `/artifact-debug/page.tsx` mock store must mirror any new actions added to `PrototypeStore`. Currently includes a no-op `setCurrentChatId`. Easy to forget when adding actions.
- Pre-existing Next 16 Server Action lint warnings: `onRotationDelta` / `onExitTreatment` (MoleculeScene.tsx ~521/525), `onChange` on `LonePairSelect` (MoleculeScene.tsx ~1506), `onClose` on `MaterialsLightbox` (RepresentationPanels.tsx ~116). Functionally harmless.
- ClF3 axial-axial angle still rendered as idealized 180° in 3D (real value ~175°).
- Three.js camera lerp still runs alongside `OrbitControls.update`; dragging during a treatment transition can feel jittery.
- Fullscreen + Share header buttons are still no-op stubs.
- Storage migration: `STORAGE_KEY` is now `v6-per-chat`. Old `v5-xef2-trust` keys are auto-cleaned on hydrate; users hitting the prototype after this change will have all stored arc state reset once.
