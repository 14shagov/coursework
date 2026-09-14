// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { appendAssistantText, createPendingMessages, isNearMessagesBottom } from './ChatPage'

describe('pending chat messages', () => {
  it('assigns distinct IDs before React schedules state updates', () => {
    const { user, assistant } = createPendingMessages('Question')

    expect(user.id).not.toBe(assistant.id)
    expect(user.role).toBe('USER')
    expect(assistant.role).toBe('ASSISTANT')
  })

  it('appends streamed content only to assistant message', () => {
    const { user, assistant } = createPendingMessages('Question')
    const messages = appendAssistantText([user, assistant], assistant.id, 'content', 'Answer')

    expect(messages[0].content).toBe('Question')
    expect(messages[1].content).toBe('Answer')
  })

  it('keeps auto-scroll only while reader remains near bottom', () => {
    expect(isNearMessagesBottom({ scrollHeight: 1000, scrollTop: 668, clientHeight: 300 })).toBe(true)
    expect(isNearMessagesBottom({ scrollHeight: 1000, scrollTop: 500, clientHeight: 300 })).toBe(false)
  })
})
