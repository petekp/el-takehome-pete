'use client'

import { use, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  AssistantBody,
  ChatHeader,
  ClaudeMessage,
  InputBar,
  SparkIndicator,
  UserMessage,
} from '@/components/chat'
import { useChatStore } from '@/lib/chat-store'
import { usePrototypeStore } from '@/lib/prototype-store'

export default function ChatView({ params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = use(params)
  const router = useRouter()
  const {
    chats,
    models,
    model,
    setModel,
    thinking,
    streamBuffer,
    streamingChatId,
    sendReply,
    stopStream,
  } = useChatStore()
  const { state } = usePrototypeStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  const chat = chats.find((c) => c.id === chatId)
  const isStreaming = streamingChatId === chatId
  const showInFlight = isStreaming && (thinking || streamBuffer)
  const artifactMessageId = state.arc.artifactMessageId

  const messageCount = chat?.messages.length ?? 0
  const lastRole = chat?.messages[chat.messages.length - 1]?.role

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [chatId])

  useEffect(() => {
    if (lastRole === 'user') {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    }
  }, [messageCount, lastRole])

  useEffect(() => {
    if (!chat) router.replace('/new')
  }, [chat, router])

  if (!chat) return null

  return (
    <div className="flex h-full min-h-0 flex-1">
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <ChatHeader title={chat.title} />

        <div ref={scrollRef} className="scroll-area flex-1 overflow-auto pt-6">
          <div className="mx-auto max-w-[var(--content-max-width)] px-6 pb-6">
            {chat.messages.map((m) => {
              if (m.role === 'user') return <UserMessage key={m.id} text={m.text} />
              const isArtifact = m.id === artifactMessageId
              return (
                <ClaudeMessage
                  key={m.id}
                  id={`message-${m.id}`}
                  className={isArtifact ? '!px-0' : undefined}
                >
                  <AssistantBody text={m.text} />
                </ClaudeMessage>
              )
            })}

            {showInFlight && (
              <ClaudeMessage>
                <AssistantBody text={streamBuffer} isStreaming />
                {!streamBuffer && <SparkIndicator working={thinking} />}
              </ClaudeMessage>
            )}
          </div>
        </div>

        <div className="bg-page sticky bottom-0 flex justify-center px-6 pb-2 pt-4">
          <div className="w-full max-w-[var(--input-max-width-lg)]">
            <InputBar
              placeholder="Reply to Claude…"
              models={models}
              model={model}
              onModelChange={setModel}
              isStreaming={isStreaming}
              onSend={(text) => sendReply(chatId, text)}
              onStop={stopStream}
            />
          </div>
        </div>

        <div className="text-text-tertiary px-6 pb-3 text-center text-xs">
          Claude can make mistakes. Please double-check responses.
        </div>
      </div>
    </div>
  )
}
