import { describe, expect, it } from 'vitest'
import { encodeMessageForApi, encodeMessagesForApi } from './chat-message-api'
import type { Message } from './types'

const pngAttachment = {
  id: 'img-1',
  name: 'chart.png',
  mediaType: 'image/png' as const,
  data: 'abc123',
}

describe('chat API message serialization', () => {
  it('serializes assistant and text-only user messages as string content', () => {
    expect(
      encodeMessageForApi({ id: 'm1', role: 'assistant', text: 'hello' }),
    ).toEqual({ role: 'assistant', content: 'hello' })

    expect(encodeMessageForApi({ id: 'm2', role: 'user', text: 'hi' })).toEqual({
      role: 'user',
      content: 'hi',
    })
  })

  it('serializes user image attachments without empty text blocks', () => {
    const message: Message = {
      id: 'm1',
      role: 'user',
      text: '',
      attachments: [pngAttachment],
    }

    expect(encodeMessageForApi(message)).toEqual({
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: 'abc123',
          },
        },
      ],
    })
  })

  it('serializes mixed user image and text messages with images first', () => {
    const messages: Message[] = [
      {
        id: 'm1',
        role: 'user',
        text: 'What shape is this?',
        attachments: [pngAttachment],
      },
    ]

    expect(encodeMessagesForApi(messages)).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: 'abc123',
            },
          },
          { type: 'text', text: 'What shape is this?' },
        ],
      },
    ])
  })
})
