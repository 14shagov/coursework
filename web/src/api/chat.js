import { apiRequest, getAuthToken } from './client'
import { isMockEnabled, mockStreamResponse } from './mock'

export function createConversation(mode = 'PLAIN') {
  return apiRequest('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({
      userId: 1,
      mode,
      title: 'Web Chat',
    }),
  })
}

export function listConversations(userId = 1) {
  return apiRequest(`/api/conversations?userId=${userId}`)
}

export function getConversation(conversationId) {
  return apiRequest(`/api/conversations/${conversationId}`)
}

export function sendMessage(conversationId, content, mode) {
  return apiRequest(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, mode }),
  })
}

export function getMessages(conversationId) {
  return apiRequest(`/api/conversations/${conversationId}/messages`)
}

export function initEmbeddings() {
  return apiRequest('/api/admin/embeddings/init', {
    method: 'POST',
  })
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

export function sendMessageStreaming(conversationId, content, mode, onChunk) {
  if (isMockEnabled()) {
    return mockStreamResponse(content, mode, onChunk)
  }

  const token = getAuthToken()
  const url = `${import.meta.env.VITE_API_BASE_URL || ''}/api/conversations/${conversationId}/messages/stream`

  const controller = new AbortController()

  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ content, mode }),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Streaming error: HTTP ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      const emitChunk = (payload) => {
        try {
          onChunk(payload)
        } catch (e) {
          console.warn('[stream] callback error:', e)
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        const events = buffer.split('\n\n')
        buffer = events.pop() || ''

        for (const event of events) {
          const rest = parseSseEvent(event, (_, dataStr) => {
            try {
              const chunk = JSON.parse(dataStr)
              emitChunk(chunk)
            } catch (e) {
              console.warn('[stream] parse error:', dataStr)
            }
          })
        }
      }
    })
    .catch((err) => {
      console.error('[stream] fetch error:', err)
      onChunk({ type: 'error', error: err.message })
    })

  return () => controller.abort()
}
