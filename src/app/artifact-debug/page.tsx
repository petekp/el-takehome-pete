'use client'

import { useEffect, useMemo, useState } from 'react'
import { Artifact } from '@/components/prototype/Artifact'
import {
  LITERACY_PANELS,
  PrototypeContext,
  ROTATION_GATE_RAD,
  type ArtifactPrediction1,
  type ArtifactPrediction2,
  type ArtifactStage,
  type ArtifactState,
  type ChipKey,
  type ChipState,
  type PrototypeStore,
  type RepresentationPanelId,
} from '@/lib/prototype-store'
import { TRIGGER_ATTACHMENTS } from '@/lib/concepts'
import type { Molecule, Prediction1Key, Prediction2Key } from '@/lib/artifact-script'
import type { ImageAttachment } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * Debug-only harness for the Artifact component.
 *
 * Drops the artifact into any stage / panel / prediction combination without
 * having to run the full chat arc to get there. Provides a stripped-down
 * PrototypeContext implementation that backs every store mutation with local
 * useState so the artifact's own interactions (panel clicks, rotation, chip
 * toggles, advance/retreat) keep working — but the debug sidebar can also
 * jump state directly.
 *
 * Live at /artifact-debug. Not linked from anywhere; reach it manually.
 */

const STAGES: ArtifactStage[] = ['opening', 'predict-1', 'reveal-1', 'predict-2', 'reveal-2', 'closing']
const PANELS: (RepresentationPanelId | 'none')[] = ['none', 'materials', 'lewis', 'geometry']
const MOLECULES: Molecule[] = ['xef2', 'xef2-axial-strain', 'clf3']
const PREDICTION_1_KEYS: Prediction1Key[] = ['notational', 'equatorial', 'atoms-push', 'unclassified']
const PREDICTION_2_KEYS: Prediction2Key[] = ['linear', 'tshape', 'pyramidal', 'unclassified']
const CHIPS: ChipKey[] = ['bonds', 'lonePairs', 'equatorialPlane', 'angles']

const DEFAULT_CHIP_STATE: ChipState = {
  bonds: true,
  lonePairs: true,
  equatorialPlane: false,
  angles: false,
}

const INITIAL_ARTIFACT: ArtifactState = {
  stage: 'opening',
  bubbleIndex: 0,
  focus: 'materials',
  activeMolecule: 'xef2',
  chipState: DEFAULT_CHIP_STATE,
  rotationRad: 0,
  panelsExplored: [],
  activePanel: null,
  prediction1: null,
  prediction2: null,
  userAttachments: [],
  openedAt: 0,
}

export default function ArtifactDebugPage() {
  const [artifact, setArtifact] = useState<ArtifactState>(INITIAL_ARTIFACT)

  // Seed Naomi's attachments so the materials header stack has something to
  // render. Fetched the same way /new pre-loads them.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const loaded = await Promise.all(
        TRIGGER_ATTACHMENTS.map(async (att, idx) => {
          const res = await fetch(att.url)
          const blob = await res.blob()
          const data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => {
              const result = typeof reader.result === 'string' ? reader.result : ''
              const comma = result.indexOf(',')
              resolve(comma >= 0 ? result.slice(comma + 1) : result)
            }
            reader.onerror = () => reject(reader.error)
            reader.readAsDataURL(blob)
          })
          return {
            id: `debug-${idx}`,
            name: att.name,
            mediaType: att.mediaType,
            data,
          } as ImageAttachment
        }),
      )
      if (!cancelled) setArtifact((a) => ({ ...a, userAttachments: loaded }))
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const store: PrototypeStore = useMemo(
    () => {
      const debugArc = {
        beat: 'artifact-active' as const,
        path: 'learning' as const,
        conceptId: 'molecular-geometry' as const,
        chatId: 'debug',
        triggerMessageId: 'debug-trigger',
        affordanceMessageId: 'debug-affordance',
        artifactMessageId: 'debug-artifact',
        artifact,
      }
      return {
      state: {
        arcs: { debug: debugArc },
        currentChatId: 'debug',
        arc: debugArc,
      },
      resetArc: () => setArtifact(INITIAL_ARTIFACT),
      setCurrentChatId: () => {},
      fireArc: () => {},
      chooseWrapper: () => {},
      chooseLearn: () => {},
      advanceArtifact: () => {
        setArtifact((a) => {
          const idx = STAGES.indexOf(a.stage)
          if (idx < 0) return a
          // Naive advance: walk bubbleIndex forward, then jump to next stage at end.
          // Doesn't fully replicate gate logic, but the debug sidebar can jump anywhere directly.
          return { ...a, bubbleIndex: a.bubbleIndex + 1 }
        })
      },
      retreatArtifact: () => {
        setArtifact((a) => ({ ...a, bubbleIndex: Math.max(0, a.bubbleIndex - 1) }))
      },
      recordPrediction1: ({ optionId, freeText }) => {
        const key: Prediction1Key = optionId ?? 'unclassified'
        setArtifact((a) => ({
          ...a,
          prediction1: { optionId, freeText, key },
          stage: 'reveal-1',
          bubbleIndex: 0,
        }))
      },
      recordPrediction2: ({ optionId, freeText }) => {
        const key: Prediction2Key = optionId ?? 'unclassified'
        setArtifact((a) => ({
          ...a,
          prediction2: { optionId, freeText, key },
          stage: 'reveal-2',
          bubbleIndex: 0,
        }))
      },
      closeArtifact: () => setArtifact(INITIAL_ARTIFACT),
      toggleChip: (key) => {
        setArtifact((a) => ({ ...a, chipState: { ...a.chipState, [key]: !a.chipState[key] } }))
      },
      setChip: (key, value) => {
        setArtifact((a) => ({ ...a, chipState: { ...a.chipState, [key]: value } }))
      },
      clickPanel: (id) => {
        setArtifact((a) => ({
          ...a,
          activePanel: a.activePanel === id ? null : id,
          panelsExplored: a.panelsExplored.includes(id) ? a.panelsExplored : [...a.panelsExplored, id],
        }))
      },
      addRotation: (delta) => {
        setArtifact((a) => ({ ...a, rotationRad: Math.min(ROTATION_GATE_RAD + 0.1, a.rotationRad + delta) }))
      },
      }
    },
    [artifact],
  )

  return (
    <PrototypeContext.Provider value={store}>
      <main className="bg-page min-h-screen">
        <div className="mx-auto flex max-w-[1400px] gap-6 p-6">
          <DebugSidebar artifact={artifact} setArtifact={setArtifact} />
          <div className="min-w-0 flex-1">
            <h1 className="text-text-primary font-serif text-lg">Artifact debug</h1>
            <p className="text-text-tertiary mb-4 text-xs">
              Drive the artifact into any state without running the full arc. State is local — refresh resets.
            </p>
            <Artifact />
          </div>
        </div>
      </main>
    </PrototypeContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Sidebar — direct state controls
// ---------------------------------------------------------------------------

type DebugSidebarProps = {
  artifact: ArtifactState
  setArtifact: (updater: (a: ArtifactState) => ArtifactState) => void
}

function DebugSidebar({ artifact, setArtifact }: DebugSidebarProps) {
  const setStage = (stage: ArtifactStage) =>
    setArtifact((a) => ({ ...a, stage, bubbleIndex: 0 }))

  const setActivePanel = (panel: RepresentationPanelId | 'none') =>
    setArtifact((a) => ({
      ...a,
      activePanel: panel === 'none' ? null : panel,
      panelsExplored:
        panel === 'none' || a.panelsExplored.includes(panel)
          ? a.panelsExplored
          : [...a.panelsExplored, panel],
    }))

  const setMolecule = (m: Molecule) => setArtifact((a) => ({ ...a, activeMolecule: m }))

  const setPrediction1 = (key: Prediction1Key | 'unset') => {
    setArtifact((a) => ({
      ...a,
      prediction1:
        key === 'unset' ? null : ({ optionId: key, key } as ArtifactPrediction1),
    }))
  }

  const setPrediction2 = (key: Prediction2Key | 'unset') => {
    setArtifact((a) => ({
      ...a,
      prediction2:
        key === 'unset' ? null : ({ optionId: key, key } as ArtifactPrediction2),
    }))
  }

  const togglePanelsExplored = (id: RepresentationPanelId) => {
    setArtifact((a) => ({
      ...a,
      panelsExplored: a.panelsExplored.includes(id)
        ? a.panelsExplored.filter((p) => p !== id)
        : [...a.panelsExplored, id],
    }))
  }

  return (
    <aside className="bg-surface border-border-subtle sticky top-6 flex h-fit w-72 shrink-0 flex-col gap-4 rounded-lg border p-4 shadow-sm">
      <ControlGroup label="Stage">
        <SegmentRow
          options={STAGES.map((s) => ({ value: s, label: s }))}
          value={artifact.stage}
          onChange={setStage}
        />
        <NumberRow
          label="Bubble index"
          value={artifact.bubbleIndex}
          onChange={(v) => setArtifact((a) => ({ ...a, bubbleIndex: Math.max(0, v) }))}
        />
      </ControlGroup>

      <ControlGroup label="Active panel">
        <SegmentRow
          options={PANELS.map((p) => ({ value: p, label: p }))}
          value={artifact.activePanel ?? 'none'}
          onChange={setActivePanel}
        />
      </ControlGroup>

      <ControlGroup label="Molecule">
        <SegmentRow
          options={MOLECULES.map((m) => ({ value: m, label: m }))}
          value={artifact.activeMolecule}
          onChange={setMolecule}
        />
      </ControlGroup>

      <ControlGroup label="Chips">
        <div className="flex flex-wrap gap-1.5">
          {CHIPS.map((c) => (
            <Toggle
              key={c}
              label={c}
              on={artifact.chipState[c]}
              onClick={() =>
                setArtifact((a) => ({ ...a, chipState: { ...a.chipState, [c]: !a.chipState[c] } }))
              }
            />
          ))}
        </div>
      </ControlGroup>

      <ControlGroup label="Prediction 1">
        <SegmentRow
          options={[{ value: 'unset' as const, label: 'unset' }, ...PREDICTION_1_KEYS.map((k) => ({ value: k, label: k }))]}
          value={artifact.prediction1?.key ?? 'unset'}
          onChange={setPrediction1}
        />
      </ControlGroup>

      <ControlGroup label="Prediction 2">
        <SegmentRow
          options={[{ value: 'unset' as const, label: 'unset' }, ...PREDICTION_2_KEYS.map((k) => ({ value: k, label: k }))]}
          value={artifact.prediction2?.key ?? 'unset'}
          onChange={setPrediction2}
        />
      </ControlGroup>

      <ControlGroup label="Gates">
        <div className="flex flex-wrap gap-1.5">
          {LITERACY_PANELS.map((id) => (
            <Toggle
              key={id}
              label={`explored:${id}`}
              on={artifact.panelsExplored.includes(id)}
              onClick={() => togglePanelsExplored(id)}
            />
          ))}
        </div>
        <NumberRow
          label="Rotation (rad)"
          value={Number(artifact.rotationRad.toFixed(2))}
          onChange={(v) => setArtifact((a) => ({ ...a, rotationRad: Math.max(0, v) }))}
          step={0.1}
        />
        <button
          type="button"
          onClick={() =>
            setArtifact((a) => ({
              ...a,
              rotationRad: a.rotationRad >= ROTATION_GATE_RAD ? 0 : ROTATION_GATE_RAD,
            }))
          }
          className="text-text-tertiary hover:text-text-secondary mt-1 self-start text-[11px] underline-offset-2 hover:underline"
        >
          {artifact.rotationRad >= ROTATION_GATE_RAD ? 'Clear rotation' : 'Satisfy rotation gate'}
        </button>
      </ControlGroup>

      <button
        type="button"
        onClick={() => setArtifact(() => INITIAL_ARTIFACT)}
        className="border-border-subtle bg-page text-text-secondary hover:bg-state-hover rounded-md border px-2.5 py-1.5 text-[12px]"
      >
        Reset to initial
      </button>
    </aside>
  )
}

// ---------------------------------------------------------------------------
// Small UI atoms
// ---------------------------------------------------------------------------

function ControlGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-text-tertiary text-[10px] font-medium uppercase tracking-wide">{label}</div>
      {children}
    </div>
  )
}

function SegmentRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-sm border px-1.5 py-0.5 text-[11px] transition-colors',
            value === o.value
              ? 'border-accent/50 bg-accent/10 text-accent-strong'
              : 'border-border-subtle text-text-secondary hover:bg-state-hover',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function NumberRow({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
}) {
  return (
    <label className="text-text-secondary flex items-center justify-between gap-2 text-[11px]">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="border-border-subtle bg-surface w-20 rounded-sm border px-1.5 py-0.5 text-right text-[11px] outline-none"
      />
    </label>
  )
}

function Toggle({
  label,
  on,
  onClick,
}: {
  label: string
  on: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-sm border px-1.5 py-0.5 text-[11px] transition-colors',
        on
          ? 'border-accent/50 bg-accent/10 text-accent-strong'
          : 'border-border-subtle text-text-tertiary hover:bg-state-hover',
      )}
    >
      {label}
    </button>
  )
}
