'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Greeting, InputBar } from '@/components/chat'
import { useChatStore } from '@/lib/chat-store'
import { usePrototypeStore } from '@/lib/prototype-store'
import { TRIGGER_MESSAGE } from '@/lib/concepts'

export default function NewChat() {
  const { config, models, model, setModel, createChat } = useChatStore()
  const { resetArc } = usePrototypeStore()
  const router = useRouter()

  // Each fresh /new mount clears any prior arc state so the demo starts
  // from a known idle position regardless of where the user navigated from.
  useEffect(() => {
    resetArc()
  }, [resetArc])

  const handleSend = (text: string) => {
    const id = createChat(text)
    router.push(`/chat/${id}`)
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-8">
      <Greeting name={config.userName} />
      <div className="w-full max-w-[var(--input-max-width)]">
        <InputBar
          placeholder="How can I help you today?"
          initialValue={TRIGGER_MESSAGE}
          models={models}
          model={model}
          onModelChange={setModel}
          onSend={handleSend}
        />
      </div>
    </main>
  )
}
