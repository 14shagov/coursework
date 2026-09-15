import { apiRequest, getAuthToken } from './client'
import { isMockEnabled, mockStreamResponse } from './mock'

export function createConversation(mode = 'PLAIN', llmModel) {
  return apiRequest('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({
      mode,
      title: 'Web Chat',
      llmModel,
    }),
  })
}

export function listChatModels() {
  return apiRequest('/api/conversations/models')
}

export function updateConversationModel(conversationId, llmModel) {
  return apiRequest(`/api/conversations/${conversationId}/model`, {
    method: 'PUT',
    body: JSON.stringify({ llmModel }),
  })
}

export function listConversations() {
  return apiRequest('/api/conversations')
}

export function getConversation(conversationId) {
  return apiRequest(`/api/conversations/${conversationId}`)
}

export function getMessages(conversationId) {
  return apiRequest(`/api/conversations/${conversationId}/messages`)
}

export function startEmbeddingJob() {
  return apiRequest('/api/admin/embeddings/jobs', {
    method: 'POST',
  })
}

export function getEmbeddingJob(jobId) {
  return apiRequest(`/api/admin/embeddings/jobs/${jobId}`)
}

function parseSseEvent(buffer, emit) {
  const lines = buffer.split('\n')
  let dataLines = []
  let eventType = 'message'
  let hasData = false

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r/g, '')

    if (line.startsWith(':')) {
      continue
    }

    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim() || 'message'
      continue
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
      hasData = true
    }
  }

  if (!hasData) return ''

  const dataStr = dataLines.join('\n')
  if (!dataStr.trim()) return ''

  emit(eventType, dataStr)
  return ''
}

export function startMessageStreaming(conversationId, content, onChunk, mockMode = 'PLAIN') {
  if (isMockEnabled()) {
    let cancelMock = () => {}
    let settled = false
    let rejectCompletion
    const completion = new Promise((resolve, reject) => {
      rejectCompletion = reject
      cancelMock = mockStreamResponse(conversationId, content, mockMode, (chunk) => {
        onChunk(chunk)
        if (chunk.type === 'error') {
          settled = true
          reject(new Error(chunk.error || 'Streaming error'))
        } else if (chunk.type === 'done') {
          settled = true
          resolve()
        }
      })
    })
    return {
      completion,
      cancel() {
        if (!settled) {
          settled = true
          cancelMock()
          rejectCompletion(new DOMException('Aborted', 'AbortError'))
        }
      },
    }
  }

  const token = getAuthToken()
  const url = `${import.meta.env.VITE_API_BASE_URL || ''}/api/conversations/${conversationId}/messages/stream`

  const controller = new AbortController()

  const completion = (async () => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ content }),
      signal: controller.signal,
    })
      if (!response.ok) {
        throw new Error(`Streaming error: HTTP ${response.status}`)
      }

      if (!response.body) {
        throw new Error('Streaming error: empty response body')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let receivedDone = false

      const emitChunk = (payload) => {
        onChunk(payload)
        if (payload.type === 'error') {
          throw new Error(payload.error || 'Streaming error')
        }
        if (payload.type === 'done') {
          receivedDone = true
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          parseSseEvent(buffer, (_, dataStr) => {
            let chunk
            try {
              chunk = JSON.parse(dataStr)
            } catch (e) {
              throw new Error('Streaming error: invalid event payload')
            }
            emitChunk(chunk)
          })
          break
        }

        buffer += decoder.decode(value, { stream: true })

        const events = buffer.split('\n\n')
        buffer = events.pop() || ''

        for (const event of events) {
          parseSseEvent(event, (_, dataStr) => {
            let chunk
            try {
              chunk = JSON.parse(dataStr)
            } catch (e) {
              throw new Error('Streaming error: invalid event payload')
            }
            emitChunk(chunk)
          })
        }
      }
      if (!receivedDone) {
        throw new Error('Streaming error: stream ended without done event')
      }
  })()

  return {
    completion,
    cancel() {
      controller.abort()
    },
  }
}
