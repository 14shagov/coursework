// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createConversation,
  getEmbeddingJob,
  listChatModels,
  listConversations,
  startEmbeddingJob,
  startMessageStreaming,
  updateConversationModel,
} from './chat'
import { mockApiRequest } from './mock'

const encoder = new TextEncoder()

function sseResponse(chunks, close) {
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      close.current = () => controller.close()
    },
  }), {
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

describe('startMessageStreaming', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubEnv('VITE_MOCK', 'false')
  })

  afterEach(() => vi.unstubAllGlobals())

  it('waits for done and sends only content', async () => {
    const close = { current: null }
    globalThis.fetch = vi.fn().mockResolvedValue(sseResponse([
      'event: message\ndata: {"type":"content","content":"Answer"}\n\n',
      'event: message\ndata: {"type":"done"}\n\n',
    ], close))
    const chunks = []

    const stream = startMessageStreaming(7, 'Question', (chunk) => chunks.push(chunk))
    let complete = false
    stream.completion.then(() => { complete = true })
    await Promise.resolve()
    expect(complete).toBe(false)

    close.current()
    await expect(stream.completion).resolves.toBeUndefined()
    expect(chunks.map((chunk) => chunk.type)).toEqual(['content', 'done'])
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ content: 'Question' })
  })

  it('rejects on server error event', async () => {
    const close = { current: null }
    globalThis.fetch = vi.fn().mockResolvedValue(sseResponse([
      'event: message\ndata: {"type":"error","error":"safe message"}\n\n',
    ], close))

    const stream = startMessageStreaming(7, 'Question', vi.fn())
    close.current()
    await expect(stream.completion).rejects.toThrow('safe message')
  })

  it('aborts current fetch when cancelled', async () => {
    globalThis.fetch = vi.fn((_, options) => new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))

    const stream = startMessageStreaming(7, 'Question', vi.fn())
    stream.cancel()
    await expect(stream.completion).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('rejects mock stream when cancelled', async () => {
    vi.stubEnv('VITE_MOCK', 'true')
    const stream = startMessageStreaming(7, 'Question', vi.fn())
    stream.cancel()
    await expect(stream.completion).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('conversation contract', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubEnv('VITE_MOCK', 'false')
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response('{}', {
      headers: { 'Content-Type': 'application/json' },
    })))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('does not expose user identity or message mode in conversation requests', async () => {
    await createConversation('RAG', 'Qwen3.6-35B-A3B')
    await listConversations()

    expect(fetch.mock.calls[0][0]).toBe('/api/conversations')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ mode: 'RAG', title: 'Web Chat', llmModel: 'Qwen3.6-35B-A3B' })
    expect(fetch.mock.calls[1][0]).toBe('/api/conversations')
  })

  it('loads model catalog and changes a conversation model', async () => {
    await listChatModels()
    await updateConversationModel(42, 'DeepSeek-V4-Flash')

    expect(fetch.mock.calls[0][0]).toBe('/api/conversations/models')
    expect(fetch.mock.calls[1][0]).toBe('/api/conversations/42/model')
    expect(fetch.mock.calls[1][1].method).toBe('PUT')
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ llmModel: 'DeepSeek-V4-Flash' })
  })

  it('starts and reads the global embedding job', async () => {
    await startEmbeddingJob()
    await getEmbeddingJob(42)

    expect(fetch.mock.calls[0][0]).toBe('/api/admin/embeddings/jobs')
    expect(fetch.mock.calls[0][1].method).toBe('POST')
    expect(fetch.mock.calls[1][0]).toBe('/api/admin/embeddings/jobs/42')
  })
})

describe('mock conversation messages', () => {
  it('persists streamed reasoning so it is available after reopening the chat', async () => {
    vi.stubEnv('VITE_MOCK', 'true')
    const before = await mockApiRequest('/api/conversations/1/messages')
    const stream = startMessageStreaming(1, 'Почему небо голубое?', vi.fn())

    await expect(stream.completion).resolves.toBeUndefined()

    const after = await mockApiRequest('/api/conversations/1/messages')
    const assistant = after.at(-1)
    expect(after).toHaveLength(before.length + 2)
    expect(assistant).toMatchObject({ role: 'ASSISTANT', content: expect.any(String), thinking: expect.any(String) })
    expect(assistant.thinking).toContain('Почему небо голубое?')
  })
})
