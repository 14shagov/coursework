import { apiRequest } from './client'

export function createConversation() {
  return apiRequest('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({
      userId: 1,
      mode: 'PLAIN',
      title: 'Web Chat',
    }),
  })
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

export function updateMode(conversationId, mode) {
  return apiRequest(`/api/conversations/${conversationId}/mode?mode=${encodeURIComponent(mode)}`, {
    method: 'POST',
  })
}

export function initEmbeddings() {
  return apiRequest('/api/admin/embeddings/init', {
    method: 'POST',
  })
}
