'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { PREDICTION_1, PREDICTION_2, type Prediction1Key, type Prediction2Key } from './artifact-script'
import { buildInteractionSummary } from './artifact-interaction'
import { encodeMessageForApi, encodeMessagesForApi } from './chat-message-api'
import { useChatStore } from './chat-store'
import type { ConceptId } from './concepts'
import {
  addRotationToArc,
  advanceArtifactArc,
  clickPanelInArc,
  createEmptyArc,
  createEmptyArtifact,
  createInitialPrototypeState,
  getActiveArc,
  isConceptId,
  normalizePrototypeState,
  prepareArtifactClose,
  recordPrediction1InArc,
  recordPrediction2InArc,
  resetArtifactInArc,
  retreatArtifactArc,
  setChipInArc,
  toggleChipInArc,
  updateArcById,
  type ArcState,
  type ChipKey,
  type PrototypeState,
  type RepresentationPanelId,
} from './prototype-state'

export {
  activeCue,
  bubblesForStage,
  LITERACY_PANELS,
  ROTATION_GATE_RAD,
} from './prototype-state'
export type {
  ArcBeat,
  ArcPath,
  ArtifactPrediction1,
  ArtifactPrediction2,
  ArtifactStage,
  ArtifactState,
  ChipKey,
  ChipState,
  PrototypeState,
  RepresentationPanelId,
} from './prototype-state'
export { PREDICTION_1, PREDICTION_2 }

export type FireArcInput = {
  conceptId: ConceptId
  chatId: string
  triggerMessageId: string
  affordanceMessageId?: string
}

export type PrototypeStore = {
  state: PrototypeState & { arc: ArcState }
  resetArc: () => void
  setCurrentChatId: (chatId: string | null) => void
  fireArc: (input: FireArcInput) => void
  chooseWrapper: () => void
  chooseLearn: () => void
  advanceArtifact: () => void
  retreatArtifact: () => void
  resetArtifact: () => void
  recordPrediction1: (input: { optionId?: Prediction1Key; freeText?: string }) => void
  recordPrediction2: (input: { optionId?: Prediction2Key; freeText?: string }) => void
  closeArtifact: () => void
  toggleChip: (key: ChipKey) => void
  setChip: (key: ChipKey, value: boolean) => void
  clickPanel: (id: RepresentationPanelId) => void
  addRotation: (deltaRad: number) => void
}

export const PrototypeContext = createContext<PrototypeStore | null>(null)

const STORAGE_KEY = 'education-labs:prototype-state:v6-per-chat'
const STALE_STORAGE_KEYS = [
  'education-labs:prototype-state',
  'education-labs:prototype-state:v2-chemistry',
  'education-labs:prototype-state:v3-xef2',
  'education-labs:prototype-state:v4-xef2-polish',
  'education-labs:prototype-state:v5-xef2-trust',
]

function loadFromStorage(): PrototypeState | null {
  if (typeof window === 'undefined') return null
  for (const key of STALE_STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return normalizePrototypeState(JSON.parse(raw))
  } catch {
    return null
  }
}

function updateCurrentArc(
  s: PrototypeState,
  updater: (arc: ArcState) => ArcState,
): PrototypeState {
  if (!s.currentChatId) return s
  return updateArcById(s, s.currentChatId, updater)
}

export function PrototypeProvider({ children }: { children: ReactNode }) {
  const { lastCompletion, chats, streamCompletion, appendAssistantMessage } = useChatStore()
  const [state, setState] = useState<PrototypeState>(() => createInitialPrototypeState())
  const [hydrated, setHydrated] = useState(false)

  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const chatsRef = useRef(chats)
  useEffect(() => {
    chatsRef.current = chats
  }, [chats])

  useEffect(() => {
    const stored = loadFromStorage()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setState(stored)
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* quota or private-mode failures are non-fatal */
    }
  }, [state, hydrated])

  const resetArc = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(STORAGE_KEY)
      } catch {
        /* private mode etc. */
      }
    }
    setState(createInitialPrototypeState())
  }, [])

  const setCurrentChatId = useCallback((chatId: string | null) => {
    setState((s) => (s.currentChatId === chatId ? s : { ...s, currentChatId: chatId }))
  }, [])

  const fireArc = useCallback((input: FireArcInput) => {
    setState((s) => ({
      ...s,
      currentChatId: input.chatId,
      arcs: {
        ...s.arcs,
        [input.chatId]: createEmptyArc({
          beat: 'choosing',
          conceptId: input.conceptId,
          chatId: input.chatId,
          triggerMessageId: input.triggerMessageId,
          affordanceMessageId: input.affordanceMessageId ?? null,
        }),
      },
    }))
  }, [])

  useEffect(() => {
    if (!lastCompletion) return
    const { meta, chatId, triggerMessageId } = lastCompletion
    if (!meta.isArc || !isConceptId(meta.conceptId)) return
    const conceptId = meta.conceptId
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((s) => {
      const existing = s.arcs[chatId]
      if (existing && existing.beat !== 'idle') return s
      return {
        ...s,
        currentChatId: chatId,
        arcs: {
          ...s.arcs,
          [chatId]: createEmptyArc({
            beat: 'choosing',
            conceptId,
            chatId,
            triggerMessageId,
            affordanceMessageId: null,
          }),
        },
      }
    })
  }, [lastCompletion])

  const chooseWrapper = useCallback(() => {
    const arc = getActiveArc(stateRef.current)
    if (!arc.chatId || !arc.conceptId) return
    const chatId = arc.chatId

    setState((s) =>
      updateArcById(s, chatId, (a) => ({
        ...a,
        path: 'wrapper',
        beat: 'wrapper-response',
      })),
    )

    const chat = chatsRef.current.find((c) => c.id === chatId)
    if (!chat) return
    streamCompletion(chatId, {
      endpoint: '/api/wrapper-response',
      body: { conceptId: arc.conceptId, messages: encodeMessagesForApi(chat.messages) },
    }).catch(() => {
      /* already logged in chat-store */
    })
  }, [streamCompletion])

  const chooseLearn = useCallback(() => {
    const arc = getActiveArc(stateRef.current)
    if (!arc.chatId || !arc.conceptId) return
    const chatId = arc.chatId

    const chat = chatsRef.current.find((c) => c.id === chatId)
    const triggerMsg = chat?.messages.find((m) => m.id === arc.triggerMessageId)
    const fallbackTriggerMsg = chat?.messages.find((m) => m.role === 'user')
    const userAttachments = (triggerMsg ?? fallbackTriggerMsg)?.attachments ?? []
    const artifactMessageId = appendAssistantMessage(chatId, '<artifact/>')

    setState((s) =>
      updateArcById(s, chatId, (a) => ({
        ...a,
        path: 'learning',
        beat: 'artifact-active',
        artifact: createEmptyArtifact({ userAttachments, openedAt: Date.now() }),
        artifactMessageId,
      })),
    )
  }, [appendAssistantMessage])

  const advanceArtifact = useCallback(() => {
    setState((s) => updateCurrentArc(s, advanceArtifactArc))
  }, [])

  const retreatArtifact = useCallback(() => {
    setState((s) => updateCurrentArc(s, retreatArtifactArc))
  }, [])

  const resetArtifact = useCallback(() => {
    setState((s) => updateCurrentArc(s, (arc) => resetArtifactInArc(arc)))
  }, [])

  const recordPrediction1 = useCallback(
    (input: { optionId?: Prediction1Key; freeText?: string }) => {
      setState((s) => updateCurrentArc(s, (arc) => recordPrediction1InArc(arc, input)))
    },
    [],
  )

  const recordPrediction2 = useCallback(
    (input: { optionId?: Prediction2Key; freeText?: string }) => {
      setState((s) => updateCurrentArc(s, (arc) => recordPrediction2InArc(arc, input)))
    },
    [],
  )

  const closeArtifact = useCallback(() => {
    const activeArc = getActiveArc(stateRef.current)
    if (!activeArc.chatId || !activeArc.conceptId) return
    const prepared = prepareArtifactClose(stateRef.current, activeArc.chatId)
    if (!prepared) return

    const { arc } = prepared
    const chatId = arc.chatId!
    const conceptId = arc.conceptId!
    const artifactInteraction = buildInteractionSummary(arc.artifact)

    setState(prepared.state)

    const chat = chatsRef.current.find((c) => c.id === chatId)
    const triggerUserMessage = arc.triggerMessageId
      ? chat?.messages.find((m) => m.id === arc.triggerMessageId && m.role === 'user')
      : undefined
    const firstUserMessage = chat?.messages.find((m) => m.role === 'user')
    const groundingMessage = triggerUserMessage ?? firstUserMessage
    const apiMessages = groundingMessage ? [encodeMessageForApi(groundingMessage)] : []

    streamCompletion(chatId, {
      endpoint: '/api/wrapper-response',
      body: {
        conceptId,
        messages: apiMessages,
        afterLearning: true,
        artifactInteraction,
      },
    }).catch(() => {
      /* already logged in chat-store */
    })
  }, [streamCompletion])

  const toggleChip = useCallback((key: ChipKey) => {
    setState((s) => updateCurrentArc(s, (arc) => toggleChipInArc(arc, key)))
  }, [])

  const setChip = useCallback((key: ChipKey, value: boolean) => {
    setState((s) => updateCurrentArc(s, (arc) => setChipInArc(arc, key, value)))
  }, [])

  const clickPanel = useCallback((id: RepresentationPanelId) => {
    setState((s) => updateCurrentArc(s, (arc) => clickPanelInArc(arc, id)))
  }, [])

  const addRotation = useCallback((deltaRad: number) => {
    setState((s) => updateCurrentArc(s, (arc) => addRotationToArc(arc, deltaRad)))
  }, [])

  const exposedState = useMemo(
    () => ({ ...state, arc: getActiveArc(state) }),
    [state],
  )

  const value = useMemo<PrototypeStore>(
    () => ({
      state: exposedState,
      resetArc,
      setCurrentChatId,
      fireArc,
      chooseWrapper,
      chooseLearn,
      advanceArtifact,
      retreatArtifact,
      resetArtifact,
      recordPrediction1,
      recordPrediction2,
      closeArtifact,
      toggleChip,
      setChip,
      clickPanel,
      addRotation,
    }),
    [
      exposedState,
      resetArc,
      setCurrentChatId,
      fireArc,
      chooseWrapper,
      chooseLearn,
      advanceArtifact,
      retreatArtifact,
      resetArtifact,
      recordPrediction1,
      recordPrediction2,
      closeArtifact,
      toggleChip,
      setChip,
      clickPanel,
      addRotation,
    ],
  )

  return <PrototypeContext.Provider value={value}>{children}</PrototypeContext.Provider>
}

export function usePrototypeStore() {
  const ctx = useContext(PrototypeContext)
  if (!ctx) throw new Error('usePrototypeStore must be used within PrototypeProvider')
  return ctx
}
