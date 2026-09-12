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

/**
 * Streaming send — returns SSE stream of chunks.
 * Each chunk: { type: 'thinking' | 'done', thinking?: string, content?: string, ...rag fields }
 * onChunk is called for every chunk. Returns cleanup fn when done.
 */
export function sendMessageStreaming(conversationId, content, mode, onChunk) {
  // Mock mode: use simulated streaming with direct callbacks
  if (isMockEnabled()) {
    return mockStreamResponse(content, mode, onChunk)
  }

  // Real mode: SSE streaming via fetch
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

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Split by double newline (SSE event boundary)
        const events = buffer.split('\n\n')
        buffer = events.pop() // Keep incomplete event in buffer

        for (const event of events) {
          const lines = event.split('\n')
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6)
              try {
                const chunk = JSON.parse(jsonStr)
                onChunk(chunk)
              } catch (e) {
                console.warn('[stream] parse error:', jsonStr)
              }
            }
          }
        }
      }
      return () => controller.abort()
    })
    .catch((err) => {
      console.error('[stream] fetch error:', err)
      // Signal done on error too
      onChunk({ type: 'error', error: err.message })
    })
}
