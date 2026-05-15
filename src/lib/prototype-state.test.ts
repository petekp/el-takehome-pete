import { describe, expect, it } from 'vitest'
import {
  addRotationToArc,
  advanceArtifactArc,
  clickPanelInArc,
  createEmptyArc,
  createEmptyArtifact,
  normalizePrototypeState,
  prepareArtifactClose,
  recordPrediction1InArc,
  recordPrediction2InArc,
  resetArtifactInArc,
  retreatArtifactArc,
  setChipInArc,
  toggleChipInArc,
  updateArcById,
  type PrototypeState,
} from './prototype-state'

describe('prototype arc targeting', () => {
  it('updates the requested chat arc even when another chat is current', () => {
    const chatA = createEmptyArc({
      beat: 'artifact-active',
      chatId: 'chat-a',
      conceptId: 'molecular-geometry',
    })
    const chatB = createEmptyArc({
      beat: 'choosing',
      chatId: 'chat-b',
      conceptId: 'molecular-geometry',
    })
    const state: PrototypeState = {
      currentChatId: 'chat-b',
      arcs: {
        'chat-a': chatA,
        'chat-b': chatB,
      },
    }

    const next = updateArcById(state, 'chat-a', (arc) => ({
      ...arc,
      beat: 'wrapper-followup',
    }))

    expect(next.currentChatId).toBe('chat-b')
    expect(next.arcs['chat-a'].beat).toBe('wrapper-followup')
    expect(next.arcs['chat-b']).toBe(chatB)
  })
})

describe('artifact close preparation', () => {
  it('snapshots the requested arc and moves only that arc to wrapper-followup', () => {
    const chatA = createEmptyArc({
      beat: 'artifact-resolved',
      chatId: 'chat-a',
      conceptId: 'molecular-geometry',
      artifact: createEmptyArtifact({ stage: 'closing', rotationRad: 0.4 }),
    })
    const chatB = createEmptyArc({
      beat: 'choosing',
      chatId: 'chat-b',
      conceptId: 'molecular-geometry',
    })
    const state: PrototypeState = {
      currentChatId: 'chat-b',
      arcs: {
        'chat-a': chatA,
        'chat-b': chatB,
      },
    }

    const prepared = prepareArtifactClose(state, 'chat-a')

    expect(prepared?.arc).toBe(chatA)
    expect(prepared?.state.currentChatId).toBe('chat-b')
    expect(prepared?.state.arcs['chat-a'].beat).toBe('wrapper-followup')
    expect(prepared?.state.arcs['chat-b']).toBe(chatB)
  })
})

describe('prototype state normalization', () => {
  it('drops arcs for unknown concepts and clears an invalid current chat', () => {
    const normalized = normalizePrototypeState({
      currentChatId: 'missing-chat',
      arcs: {
        known: createEmptyArc({
          chatId: 'known',
          conceptId: 'molecular-geometry',
        }),
        stale: {
          ...createEmptyArc({ chatId: 'stale' }),
          conceptId: 'retired-concept',
        },
      },
    })

    expect(normalized.currentChatId).toBeNull()
    expect(Object.keys(normalized.arcs)).toEqual(['known'])
  })

  it('fills missing artifact defaults and clamps unsafe numeric fields', () => {
    const normalized = normalizePrototypeState({
      currentChatId: 'chat-a',
      arcs: {
        'chat-a': {
          beat: 'artifact-active',
          path: 'learning',
          conceptId: 'molecular-geometry',
          chatId: 'chat-a',
          triggerMessageId: 'trigger',
          affordanceMessageId: null,
          artifactMessageId: 'artifact',
          artifact: {
            stage: 'opening',
            bubbleIndex: -8,
            rotationRad: -2,
          },
        },
      },
    })

    const artifact = normalized.arcs['chat-a'].artifact
    expect(normalized.currentChatId).toBe('chat-a')
    expect(artifact?.bubbleIndex).toBe(0)
    expect(artifact?.rotationRad).toBe(0)
    expect(artifact?.focus).toBe('materials')
    expect(artifact?.chipState).toEqual({
      bonds: true,
      lonePairs: true,
      equatorialPlane: false,
      angles: false,
    })
    expect(artifact?.panelsExplored).toEqual([])
  })
})

describe('artifact transitions', () => {
  it('advances within opening and keeps visual focus/chips in sync', () => {
    const arc = createEmptyArc({
      beat: 'artifact-active',
      artifact: createEmptyArtifact({
        activePanel: 'lewis',
        chipState: {
          bonds: true,
          lonePairs: true,
          equatorialPlane: false,
          angles: true,
        },
      }),
    })

    const next = advanceArtifactArc(arc)

    expect(next.artifact?.stage).toBe('opening')
    expect(next.artifact?.bubbleIndex).toBe(1)
    expect(next.artifact?.focus).toBe('equatorial-reveal')
    expect(next.artifact?.activeMolecule).toBe('xef2')
    expect(next.artifact?.chipState).toMatchObject({
      lonePairs: true,
      equatorialPlane: true,
      angles: false,
    })
    expect(next.artifact?.activePanel).toBeNull()
  })

  it('enters predict-1 at the end of opening without answer-revealing overlays', () => {
    const arc = createEmptyArc({
      beat: 'artifact-active',
      artifact: createEmptyArtifact({
        bubbleIndex: 1,
        focus: 'equatorial-reveal',
        chipState: {
          bonds: true,
          lonePairs: true,
          equatorialPlane: true,
          angles: true,
        },
      }),
    })

    const next = advanceArtifactArc(arc)

    expect(next.artifact?.stage).toBe('predict-1')
    expect(next.artifact?.bubbleIndex).toBe(0)
    expect(next.artifact?.focus).toBe('predict-spatial')
    expect(next.artifact?.activeMolecule).toBe('xef2')
    expect(next.artifact?.chipState).toMatchObject({
      lonePairs: true,
      equatorialPlane: false,
      angles: false,
    })
  })

  it('records free-text prediction 1 classification and enters reveal-1', () => {
    const arc = createEmptyArc({
      beat: 'artifact-active',
      artifact: createEmptyArtifact({ stage: 'predict-1', focus: 'predict-spatial' }),
    })

    const next = recordPrediction1InArc(arc, { freeText: 'because they are blocking the bonds' })

    expect(next.artifact?.prediction1).toMatchObject({
      freeText: 'because they are blocking the bonds',
      key: 'blocking',
    })
    expect(next.artifact?.stage).toBe('reveal-1')
    expect(next.artifact?.bubbleIndex).toBe(0)
    expect(next.artifact?.focus).toBe('equatorial-reveal')
    expect(next.artifact?.chipState.equatorialPlane).toBe(true)
  })

  it('retreats across stages while preserving recorded predictions', () => {
    const arc = recordPrediction1InArc(
      createEmptyArc({
        beat: 'artifact-active',
        artifact: createEmptyArtifact({ stage: 'predict-1' }),
      }),
      { optionId: 'equatorial' },
    )

    const next = retreatArtifactArc({
      ...arc,
      artifact: {
        ...arc.artifact!,
        stage: 'predict-2',
        bubbleIndex: 0,
        prediction2: { optionId: 'linear', key: 'linear' },
      },
    })

    expect(next.artifact?.stage).toBe('reveal-1')
    expect(next.artifact?.bubbleIndex).toBe(1)
    expect(next.artifact?.prediction1?.key).toBe('equatorial')
    expect(next.artifact?.prediction2?.key).toBe('linear')
  })

  it('completes reveal-2 into closing and resolves the arc', () => {
    const arc = recordPrediction2InArc(
      createEmptyArc({
        beat: 'artifact-active',
        artifact: createEmptyArtifact({
          stage: 'predict-2',
          focus: 'predict-tshape',
        }),
      }),
      { optionId: 'tshape' },
    )

    const next = advanceArtifactArc(arc)

    expect(next.beat).toBe('artifact-resolved')
    expect(next.artifact?.stage).toBe('closing')
    expect(next.artifact?.bubbleIndex).toBe(0)
    expect(next.artifact?.focus).toBe('closing')
    expect(next.artifact?.activePanel).toBeNull()
  })

  it('records panel exploration without entering treatment mode for materials', () => {
    const withLewis = clickPanelInArc(
      createEmptyArc({
        artifact: createEmptyArtifact(),
      }),
      'lewis',
    )

    expect(withLewis.artifact?.activePanel).toBe('lewis')
    expect(withLewis.artifact?.panelsExplored).toEqual(['lewis'])

    const withMaterials = clickPanelInArc(withLewis, 'materials')

    expect(withMaterials.artifact?.activePanel).toBe('lewis')
    expect(withMaterials.artifact?.panelsExplored).toEqual(['lewis', 'materials'])
  })

  it('updates chips and caps valid positive rotation deltas', () => {
    const arc = createEmptyArc({ artifact: createEmptyArtifact() })

    const toggled = toggleChipInArc(arc, 'angles')
    expect(toggled.artifact?.chipState.angles).toBe(true)

    const set = setChipInArc(toggled, 'angles', false)
    expect(set.artifact?.chipState.angles).toBe(false)

    expect(addRotationToArc(set, -1)).toBe(set)
    expect(addRotationToArc(set, Number.NaN)).toBe(set)

    const rotated = addRotationToArc(set, Math.PI)
    expect(rotated.artifact?.rotationRad).toBeCloseTo(Math.PI / 2)
  })

  it('resets the artifact to the opening state while preserving attachments', () => {
    const attachment = {
      id: 'att-1',
      name: 'chart.png',
      mediaType: 'image/png' as const,
      data: 'abc123',
    }
    const arc = createEmptyArc({
      beat: 'artifact-resolved',
      path: 'learning',
      artifact: createEmptyArtifact({
        stage: 'closing',
        bubbleIndex: 3,
        userAttachments: [attachment],
        openedAt: 10,
      }),
    })

    const next = resetArtifactInArc(arc, 99)

    expect(next.beat).toBe('artifact-active')
    expect(next.path).toBe('learning')
    expect(next.artifact).toMatchObject({
      stage: 'opening',
      bubbleIndex: 0,
      openedAt: 99,
      userAttachments: [attachment],
    })
  })
})
