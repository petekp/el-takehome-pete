export type Role = 'user' | 'assistant'

/**
 * Image attachment carried on a user message. Stored as base64 (no data:
 * prefix) so it can be sent directly to the Anthropic SDK and rehydrated
 * into a preview thumbnail without re-uploading.
 */
export type ImageAttachment = {
  id: string
  name: string
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
  /** Base64-encoded image payload, without the data: URL prefix. */
  data: string
}

export type Message = {
  id: string
  role: Role
  text: string
  /** Only present on user messages, only when the user actually attached
   *  something. Display in the chat bubble; forward to the model as
   *  image content blocks. */
  attachments?: ImageAttachment[]
}

export type Chat = {
  id: string
  title: string
  messages: Message[]
}

export type Config = {
  userName: string
  thinkingDelay: number
  streamSpeed: number
}
