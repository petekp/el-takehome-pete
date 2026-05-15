'use client'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'
import { ModelPicker } from './ModelPicker'
import { ArrowUp, ImageIcon, Plus, Square, X } from 'lucide-react'
import type { Model } from '@/lib/api'
import type { ImageAttachment } from '@/lib/types'
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type ComponentProps,
  type DragEvent,
  type KeyboardEvent,
} from 'react'

type InputBarProps = Omit<ComponentProps<'div'>, 'onChange'> & {
  placeholder?: string
  /**
   * Seed the composer on first render. Used by /new to pre-populate the
   * canonical trigger message. Subsequent prop changes are ignored — the
   * composer remains user-controlled after mount.
   */
  initialValue?: string
  /**
   * Pre-populated attachments. Used by /new to load Naomi's two screenshots
   * before the user types anything. Reading these by reference (deep) is
   * intentional — we only seed on first render.
   */
  initialAttachments?: ImageAttachment[]
  models: Model[]
  model: Model
  onModelChange: (model: Model) => void
  isStreaming?: boolean
  onSend?: (text: string, attachments: ImageAttachment[]) => void
  onStop?: () => void
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export function InputBar({
  className,
  placeholder = 'How can I help you today?',
  initialValue,
  initialAttachments,
  models,
  model,
  onModelChange,
  isStreaming = false,
  onSend,
  onStop,
  ...props
}: InputBarProps) {
  const [value, setValue] = useState(initialValue ?? '')
  const [attachments, setAttachments] = useState<ImageAttachment[]>(initialAttachments ?? [])
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Seed attachments when the prop arrives asynchronously (e.g. /new fetches
  // and decodes them after mount). We only seed once — after that the
  // composer is user-controlled.
  const seededRef = useRef(false)
  useEffect(() => {
    if (seededRef.current) return
    if (!initialAttachments || initialAttachments.length === 0) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAttachments(initialAttachments)
    seededRef.current = true
  }, [initialAttachments])

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !isStreaming

  const handleSend = () => {
    if (!canSend) return
    onSend?.(value, attachments)
    setValue('')
    setAttachments([])
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => ACCEPTED_TYPES.includes(f.type))
    if (arr.length === 0) return
    const next = await Promise.all(arr.map(fileToAttachment))
    setAttachments((prev) => [...prev, ...next])
  }

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) void handleFiles(e.target.files)
    e.target.value = ''
  }

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items
    if (!items) return
    const files: File[] = []
    for (const item of items) {
      if (item.kind === 'file') {
        const f = item.getAsFile()
        if (f && ACCEPTED_TYPES.includes(f.type)) files.push(f)
      }
    }
    if (files.length > 0) {
      e.preventDefault()
      void handleFiles(files)
    }
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setDragOver(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files) void handleFiles(e.dataTransfer.files)
  }

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  const openFilePicker = () => fileInputRef.current?.click()

  return (
    <div
      className={cn(
        'bg-surface shadow-input relative flex w-full flex-col rounded-xl',
        dragOver && 'ring-accent/40 ring-2',
        className,
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
      {...props}
    >
      {dragOver && (
        <div className="bg-accent/8 border-accent/40 pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed">
          <span className="text-accent-strong text-sm">Drop image to attach</span>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        multiple
        onChange={handleFileInput}
        className="hidden"
      />

      <div className="m-3.5 flex flex-col gap-3">
        {attachments.length > 0 && <AttachmentRow attachments={attachments} onRemove={removeAttachment} />}

        <div className="max-h-96 min-h-12 overflow-y-auto pl-1.5 pt-1.5">
          <textarea
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            rows={1}
            className="font-text text-text-primary placeholder:text-text-tertiary block w-full resize-none border-none bg-transparent p-0 font-sans text-base leading-[1.4] outline-none [field-sizing:content]"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex grow items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={openFilePicker}
              aria-label="Add image"
              className="ml-0.5"
            >
              <Plus className="size-5" />
            </Button>
          </div>

          <ModelPicker models={models} value={model} onChange={onModelChange} />

          {isStreaming ? (
            <Button size="icon" variant="primary" onClick={onStop} aria-label="Stop generating">
              <Square className="size-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon"
              variant="primary"
              onClick={handleSend}
              disabled={!canSend}
              aria-label="Send message"
            >
              <ArrowUp className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function AttachmentRow({
  attachments,
  onRemove,
}: {
  attachments: ImageAttachment[]
  onRemove: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2 pl-1.5">
      {attachments.map((a) => (
        <div
          key={a.id}
          className="border-border-subtle bg-page group relative flex items-center gap-2 rounded-md border py-1 pl-1 pr-2"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- user-selected data URL preview, not a static optimized asset. */}
          <img
            src={`data:${a.mediaType};base64,${a.data}`}
            alt={a.name}
            className="size-10 rounded-sm object-cover"
          />
          <div className="flex min-w-0 max-w-[180px] flex-col">
            <span className="text-text-primary truncate text-xs">{a.name}</span>
            <span className="text-text-tertiary flex items-center gap-1 text-[10px]">
              <ImageIcon className="size-2.5" />
              {a.mediaType.replace('image/', '').toUpperCase()}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onRemove(a.id)}
            aria-label={`Remove ${a.name}`}
            className="text-text-tertiary hover:bg-state-hover hover:text-text-secondary ml-1 inline-flex size-5 items-center justify-center rounded-sm transition-colors"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
    </div>
  )
}

async function fileToAttachment(file: File): Promise<ImageAttachment> {
  const data = await fileToBase64(file)
  return {
    id: `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: file.name,
    mediaType: file.type as ImageAttachment['mediaType'],
    data,
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      // FileReader returns "data:<mime>;base64,<payload>". Strip the prefix.
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
