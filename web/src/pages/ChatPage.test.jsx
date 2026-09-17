// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { appendAssistantText, createPendingMessages, isLatestConversationLoad, isNearMessagesBottom, shouldScrollLoadedConversationToBottom } from './ChatPage'

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

  it('preserves whitespace chunks in streamed reasoning', () => {
    const { assistant } = createPendingMessages('Question')
    const afterWord = appendAssistantText([assistant], assistant.id, 'thinking', 'Первое')
    const afterSpace = appendAssistantText(afterWord, assistant.id, 'thinking', ' ')
    const complete = appendAssistantText(afterSpace, assistant.id, 'thinking', 'слово')

    expect(complete[0].thinking).toBe('Первое слово')
  })

  it('keeps auto-scroll only while reader remains near bottom', () => {
    expect(isNearMessagesBottom({ scrollHeight: 1000, scrollTop: 668, clientHeight: 300 })).toBe(true)
    expect(isNearMessagesBottom({ scrollHeight: 1000, scrollTop: 500, clientHeight: 300 })).toBe(false)
  })

  it('scrolls only history belonging to current conversation', () => {
    expect(shouldScrollLoadedConversationToBottom(42, 42)).toBe(true)
    expect(shouldScrollLoadedConversationToBottom('42', 42)).toBe(true)
    expect(shouldScrollLoadedConversationToBottom(42, 43)).toBe(false)
    expect(shouldScrollLoadedConversationToBottom(null, 42)).toBe(false)
  })

  it('ignores a stale conversation-load result', () => {
    expect(isLatestConversationLoad(2, 2)).toBe(true)
    expect(isLatestConversationLoad(1, 2)).toBe(false)
  })
})
