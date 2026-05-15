import type { Message } from './types'

export type ApiMessageContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | {
          type: 'image'
          source: { type: 'base64'; media_type: string; data: string }
        }
    >

export type ApiMessage = {
  role: 'user' | 'assistant'
  content: ApiMessageContent
}

export function encodeMessageForApi(message: Message): ApiMessage {
  if (
    message.role !== 'user' ||
    !message.attachments ||
    message.attachments.length === 0
  ) {
    return { role: message.role, content: message.text }
  }

  const blocks: Exclude<ApiMessageContent, string> = message.attachments.map((att) => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: att.mediaType,
      data: att.data,
    },
  }))

  if (message.text.length > 0) {
    blocks.push({ type: 'text', text: message.text })
  }

  return { role: message.role, content: blocks }
}

export function encodeMessagesForApi(messages: Message[]): ApiMessage[] {
  return messages.map(encodeMessageForApi)
}
