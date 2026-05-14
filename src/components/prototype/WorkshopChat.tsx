'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'
import { AssistantBody } from '@/components/chat'
import { usePrototypeStore } from '@/lib/prototype-store'
import { parseEnvelope } from '@/lib/protocol'

type ChatMsg = { id: string; role: 'user' | 'assistant'; text: string }

function nextId() {
  return `wm${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/**
 * In-workshop chat panel. A fresh thread, separate from the main chat —
 * concept-aware via /api/workshop-chat. Owns its own local message list and
 * streaming state (no need to entangle with the chat-store, which is scoped
 * to the main conversation). The user's earlier reflection is passed to the
 * endpoint so Claude can ground its answers.
 *
 * Beat 7: the surface that turns the workshop from a static viz into a real
 * exploration space. Keeps things deliberately small — a textarea + a few
 * stacked turns above. The composer sits at the bottom of the panel.
 */
export function WorkshopChat() {
  const { state } = usePrototypeStore()
  const conceptId = state.arc.conceptId
  const reflectionText = state.arc.reflection?.text ?? ''
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [streamBuffer, setStreamBuffer] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const bufferRef = useRef('')

  // Cancel any in-flight request when this component unmounts (e.g. user
  // navigates back to the map). Prevents wasted tokens + dangling fetches.
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const send = async () => {
    const text = input.trim()
    if (!text || thinking || !conceptId) return
    const userMsg: ChatMsg = { id: nextId(), role: 'user', text }
    const nextHistory = [...messages, userMsg]
    setMessages(nextHistory)
    setInput('')
    setThinking(true)
    setStreamBuffer('')
    bufferRef.current = ''

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/workshop-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conceptId,
          reflectionText,
          messages: nextHistory.map((m) => ({ role: m.role, content: m.text })),
        }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) throw new Error(`workshop-chat failed: ${res.status}`)
      await parseEnvelope(res.body, {
        onText: (delta) => {
          bufferRef.current += delta
          setStreamBuffer(bufferRef.current)
        },
      })
      const assistantMsg: ChatMsg = {
        id: nextId(),
        role: 'assistant',
        text: bufferRef.current,
      }
      setMessages((m) => [...m, assistantMsg])
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        // Surface the failure inline so the user knows something went wrong
        // without us having to wire a real toast.
        setMessages((m) => [
          ...m,
          {
            id: nextId(),
            role: 'assistant',
            text: '(workshop chat is offline — try again in a moment)',
          },
        ])
      }
    } finally {
      setThinking(false)
      setStreamBuffer('')
      bufferRef.current = ''
      abortRef.current = null
    }
  }

  return (
    <div className="border-border-soft mt-2 flex flex-col gap-3 rounded-md border p-3">
      {(messages.length > 0 || thinking) && (
        <div className="flex flex-col gap-3">
          {messages.map((m) => (
            <ChatBubble key={m.id} role={m.role} text={m.text} />
          ))}
          {thinking && (
            <ChatBubble role="assistant" text={streamBuffer} streaming />
          )}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          rows={1}
          disabled={thinking}
          placeholder="Ask Claude about the visualization…"
          className={cn(
            'font-text text-text-primary placeholder:text-text-tertiary',
            'min-h-[36px] flex-1 resize-none bg-transparent text-sm leading-snug outline-none',
          )}
        />
        <Button
          size="icon"
          variant="primary"
          onClick={send}
          disabled={thinking || input.trim().length === 0}
          aria-label="Send"
        >
          <ArrowUp className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function ChatBubble({
  role,
  text,
  streaming = false,
}: {
  role: 'user' | 'assistant'
  text: string
  streaming?: boolean
}) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <span
          className={cn(
            'bg-state-pill text-text-primary inline-block max-w-[85%] rounded-md px-3 py-2 text-sm leading-snug',
          )}
        >
          {text}
        </span>
      </div>
    )
  }
  return (
    <div className="text-text-primary text-sm leading-snug">
      <AssistantBody text={text} isStreaming={streaming} />
    </div>
  )
}
