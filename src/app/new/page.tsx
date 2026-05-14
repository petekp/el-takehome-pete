'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Greeting, InputBar } from '@/components/chat'
import { useChatStore } from '@/lib/chat-store'
import { usePrototypeStore } from '@/lib/prototype-store'
import { TRIGGER_ATTACHMENTS, TRIGGER_MESSAGE } from '@/lib/concepts'
import type { ImageAttachment } from '@/lib/types'

export default function NewChat() {
  const { config, models, model, setModel, createChat } = useChatStore()
  const { resetArc } = usePrototypeStore()
  const router = useRouter()
  const [initialAttachments, setInitialAttachments] = useState<ImageAttachment[]>([])

  // Each fresh /new mount clears any prior arc state so the demo starts
  // from a known idle position regardless of where the user navigated from.
  useEffect(() => {
    resetArc()
  }, [resetArc])

  // Pre-fetch Naomi's two attachments (VSEPR chart + XeF2 Lewis) and seed
  // them into the composer. This is the demo's grounded-in-real-materials
  // setup; the evaluator should see the chips immediately on /new.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const loaded = await Promise.all(
        TRIGGER_ATTACHMENTS.map(async (att, idx) => {
          const res = await fetch(att.url)
          const blob = await res.blob()
          const data = await blobToBase64(blob)
          return {
            id: `seed-${idx}`,
            name: att.name,
            mediaType: att.mediaType,
            data,
          } as ImageAttachment
        }),
      )
      if (!cancelled) setInitialAttachments(loaded)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleSend = (text: string, attachments: ImageAttachment[]) => {
    const id = createChat(text, attachments)
    router.push(`/chat/${id}`)
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-8">
      <Greeting name={config.userName} />
      <div className="w-full max-w-[var(--input-max-width)]">
        <InputBar
          placeholder="How can I help you today?"
          initialValue={TRIGGER_MESSAGE}
          initialAttachments={initialAttachments}
          models={models}
          model={model}
          onModelChange={setModel}
          onSend={handleSend}
        />
      </div>
    </main>
  )
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
