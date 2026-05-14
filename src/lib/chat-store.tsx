'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Chat, Config, Message } from './types'
import { DEFAULT_CONFIG, SEED_CHATS } from './seed'
import {
  DEFAULT_MODEL,
  MODELS,
  streamFromEndpoint,
  type ChatMeta,
  type Model,
  type StreamChatResult,
} from './api'
import { clientMatchTrigger, getConcept } from './concepts'

export type StreamRequest = {
  endpoint: string
  body: unknown
}

export type StreamCompletionOptions = {
  onMeta?: (meta: ChatMeta) => void
  /** Optional: caller-controlled message id for the committed assistant message. */
  assistantMessageId?: string
  /**
   * Optional: id of the user message that triggered this stream. Used to anchor
   * arc state in PrototypeProvider when the classifier returns an arc meta.
   */
  triggerMessageId?: string
}

/**
 * Public read-model of the most recently observed completion meta. Each meta
 * arrival mints a new id so React effects re-fire even when the meta payload
 * is identical to the previous one. PrototypeProvider observes this to detect
 * arc-firing classifications.
 */
export type LastCompletion = {
  id: string
  chatId: string
  triggerMessageId: string | null
  meta: ChatMeta
}

type ChatStore = {
  config: Config
  models: Model[]
  model: Model
  setModel: (model: Model) => void
  chats: Chat[]
  thinking: boolean
  streamBuffer: string
  streamingChatId: string | null
  /** Most recent completion meta. PrototypeProvider observes this. */
  lastCompletion: LastCompletion | null
  createChat: (text: string) => string
  sendReply: (chatId: string, text: string) => void
  /**
   * Append a static (non-streamed) assistant message to an existing chat.
   * Returns the new message id. Used by PrototypeProvider for stubbed beats
   * that don't yet have their own streaming endpoint.
   */
  appendAssistantMessage: (chatId: string, text: string) => string
  /**
   * Drive a streaming completion against an arbitrary NDJSON endpoint. Used
   * by PrototypeProvider for arc-beat endpoints (wrapper-response, etc).
   * Reuses the thinking/streamBuffer/commit pipeline.
   */
  streamCompletion: (
    chatId: string,
    request: StreamRequest,
    options?: StreamCompletionOptions,
  ) => Promise<StreamChatResult>
  deleteChat: (chatId: string) => void
  stopStream: () => void
}

const ChatContext = createContext<ChatStore | null>(null)

const STORAGE_KEY = 'education-labs:chats'

function makeTitle(text: string) {
  const first = text.trim().split('\n')[0]
  return first.length > 40 ? first.slice(0, 40) + '…' : first
}

function nextId(prefix: 'c' | 'm') {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [config] = useState<Config>(DEFAULT_CONFIG)
  const [model, setModel] = useState<Model>(DEFAULT_MODEL)
  const [chats, setChats] = useState<Chat[]>(SEED_CHATS)
  const [hydrated, setHydrated] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [streamBuffer, setStreamBuffer] = useState('')
  const [streamingChatId, setStreamingChatId] = useState<string | null>(null)
  const [lastCompletion, setLastCompletion] = useState<LastCompletion | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const bufferRef = useRef('')

  useEffect(() => {
    // Deferred localStorage hydration avoids SSR/client mismatch: initial
    // render uses SEED_CHATS both sides; restore happens post-mount.
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored !== null) {
      try {
        const parsed: Chat[] = JSON.parse(stored)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (parsed.length > 0) setChats(parsed)
      } catch {
        /* corrupt payload — fall back to seeds */
      }
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(chats))
  }, [chats, hydrated])

  const commitAssistant = useCallback((chatId: string, text: string, id?: string) => {
    const messageId = id ?? nextId('m')
    setChats((cs) =>
      cs.map((c) =>
        c.id === chatId
          ? { ...c, messages: [...c.messages, { id: messageId, role: 'assistant', text }] }
          : c,
      ),
    )
    return messageId
  }, [])

  const appendAssistantMessage = useCallback(
    (chatId: string, text: string) => commitAssistant(chatId, text),
    [commitAssistant],
  )

  const reset = useCallback(() => {
    setThinking(false)
    setStreamBuffer('')
    setStreamingChatId(null)
    abortRef.current = null
    bufferRef.current = ''
  }, [])

  const stopStream = useCallback(() => {
    const chatId = streamingChatId
    const partial = bufferRef.current
    abortRef.current?.abort()
    if (chatId && partial) commitAssistant(chatId, partial)
    reset()
  }, [streamingChatId, commitAssistant, reset])

  const streamCompletion = useCallback(
    async (
      chatId: string,
      request: StreamRequest,
      options?: StreamCompletionOptions,
    ): Promise<StreamChatResult> => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      bufferRef.current = ''

      setThinking(true)
      setStreamingChatId(chatId)
      setStreamBuffer('')

      try {
        const result = await streamFromEndpoint(request.endpoint, request.body, {
          onDelta: (delta) => {
            bufferRef.current += delta
            setStreamBuffer(bufferRef.current)
          },
          onMeta: (meta) => {
            setLastCompletion({
              id: nextId('m'),
              chatId,
              triggerMessageId: options?.triggerMessageId ?? null,
              meta,
            })
            options?.onMeta?.(meta)
          },
          signal: controller.signal,
        })
        commitAssistant(chatId, result.text, options?.assistantMessageId)
        return result
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') console.error(err)
        throw err
      } finally {
        if (abortRef.current === controller) reset()
      }
    },
    [commitAssistant, reset],
  )

  const runChatCompletion = useCallback(
    (chatId: string, history: Message[]) => {
      // Fire-and-forget: callers don't await; errors are logged in streamCompletion.
      // The trigger message is the most recently appended user message.
      const lastUser = history[history.length - 1]
      const triggerMessageId = lastUser?.id
      streamCompletion(
        chatId,
        {
          endpoint: '/api/chat',
          body: {
            model: model.id,
            messages: history.map((m) => ({ role: m.role, content: m.text })),
          },
        },
        { triggerMessageId },
      ).catch((err) => {
        // /api/chat unreachable. Client-side string-match backstop: if the
        // user's message matches a registered concept, fire the arc with the
        // registry's fallback affordance content so the demo doesn't hard-fail
        // on flaky connectivity. AbortErrors are user-initiated cancellations
        // and bypass the backstop.
        if ((err as Error)?.name === 'AbortError') return
        const matched = clientMatchTrigger(lastUser?.text ?? '')
        if (!matched) return
        const concept = getConcept(matched)
        const fallbackText = `${concept.descriptors.fallback.affordance.intro}\n\n<affordance/>`
        commitAssistant(chatId, fallbackText)
        // Synthesize a meta event so PrototypeProvider's observer fires.
        setLastCompletion({
          id: nextId('m'),
          chatId,
          triggerMessageId: triggerMessageId ?? null,
          meta: { isArc: true, conceptId: matched },
        })
      })
    },
    [model, streamCompletion, commitAssistant],
  )

  const createChat = useCallback(
    (text: string) => {
      const id = nextId('c')
      const userMsg: Message = { id: nextId('m'), role: 'user', text }
      const chat: Chat = { id, title: makeTitle(text), messages: [userMsg] }
      setChats((cs) => [chat, ...cs])
      runChatCompletion(id, [userMsg])
      return id
    },
    [runChatCompletion],
  )

  const deleteChat = useCallback(
    (chatId: string) => {
      if (streamingChatId === chatId) abortRef.current?.abort()
      setChats((cs) => {
        const next = cs.filter((c) => c.id !== chatId)
        return next.length > 0 ? next : SEED_CHATS
      })
    },
    [streamingChatId],
  )

  const sendReply = useCallback(
    (chatId: string, text: string) => {
      const userMsg: Message = { id: nextId('m'), role: 'user', text }
      let nextHistory: Message[] = []

      setChats((cs) =>
        cs.map((c) => {
          if (c.id !== chatId) return c
          nextHistory = [...c.messages, userMsg]
          return { ...c, messages: nextHistory }
        }),
      )

      runChatCompletion(chatId, nextHistory)
    },
    [runChatCompletion],
  )

  return (
    <ChatContext.Provider
      value={{
        config,
        models: MODELS,
        model,
        setModel,
        chats,
        thinking,
        streamBuffer,
        streamingChatId,
        lastCompletion,
        createChat,
        sendReply,
        appendAssistantMessage,
        streamCompletion,
        deleteChat,
        stopStream,
      }}
    >
      {children}
    </ChatContext.Provider>
  )
}

export function useChatStore() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChatStore must be used within ChatProvider')
  return ctx
}
