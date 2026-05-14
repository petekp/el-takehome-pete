import { cn } from '@/lib/utils'
import type { ComponentProps } from 'react'
import type { ImageAttachment } from '@/lib/types'

type UserMessageProps = ComponentProps<'div'> & {
  text?: string
  attachments?: ImageAttachment[]
}

export function UserMessage({ className, text, attachments, children, ...props }: UserMessageProps) {
  const hasAttachments = attachments && attachments.length > 0
  return (
    <div className={cn('mb-2 mt-8 flex flex-col items-end gap-2', className)} {...props}>
      {hasAttachments && (
        <div className="flex max-w-[85%] flex-wrap justify-end gap-2">
          {attachments!.map((a) => (
            <img
              key={a.id}
              src={`data:${a.mediaType};base64,${a.data}`}
              alt={a.name}
              className="border-border-subtle max-h-48 max-w-[200px] rounded-lg border object-cover"
            />
          ))}
        </div>
      )}
      <div className="bg-user-bubble font-text text-text-primary max-w-[85%] break-words rounded-lg px-4 py-2.5 font-sans text-base leading-snug">
        {children ?? <p className="m-0 whitespace-pre-wrap">{text}</p>}
      </div>
    </div>
  )
}
