// Mock API для локальной разработки без бэкенда.
// Активируется через VITE_MOCK=true в web/.env

const MOCK_DELAY = 400

const mockConversations = [
  { id: 1, mode: 'PLAIN', title: 'Общий чат', createdAt: new Date().toISOString() },
  { id: 2, mode: 'RAG', title: 'Астрономия', createdAt: new Date().toISOString() },
]

const mockMessages = {
  1: [
    { id: 1, role: 'USER', content: 'Привет!', createdAt: new Date().toISOString() },
    { id: 2, role: 'ASSISTANT', content: 'Привет! Я AI-ассистент. Чем могу помочь?', createdAt: new Date().toISOString() },
  ],
  2: [
    { id: 3, role: 'USER', content: 'Что такое экзопланета?', createdAt: new Date().toISOString() },
    { id: 4, role: 'ASSISTANT', content: 'Экзопланета — это планета, которая обращается вокруг звезды вне Солнечной системы. На текущий момент подтверждено более 5000 таких объектов. Основные методы обнаружения: транзитный метод (фиксация падения яркости звезды при прохождении планеты), метод радиальных скоростей (обнаружение колебаний звезды под гравитационным влиянием планеты).', createdAt: new Date().toISOString() },
  ],
}

// Ответы для разных режимов
const plainAnswer = 'Это mock-ответ. Подключите бэкенд для реальных ответов.'

const ragAnswer = 'Экзопланеты — это планеты за пределами нашей Солнечной системы. Согласно базе знаний, они обнаруживаются транзитным методом, методом радиальных скоростей и прямым наблюдением. Большинство известных экзопланет — это горячие юпитеры, но интерес представляют и землеподобные объекты в зоне обитания.'

const ragNoContextAnswer = 'В базе знаний нет релевантной информации по вашему запросу. Попробуйте переформулировать вопрос или добавить материалы в базу знаний.'

function wait(ms = MOCK_DELAY) {
  return new Promise((r) => setTimeout(r, ms))
}

export function isMockEnabled() {
  return import.meta.env.VITE_MOCK === 'true'
}

export async function mockApiRequest(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase()

  // auth
  if (path === '/api/auth/register' && method === 'POST') {
    const body = JSON.parse(options.body || '{}')
    await wait()
    return { accessToken: 'mock-jwt-' + Date.now(), tokenType: 'Bearer', expiresIn: 3600, userId: 999, username: body.username }
  }
  if (path === '/api/auth/login' && method === 'POST') {
    const body = JSON.parse(options.body || '{}')
    await wait()
    return { accessToken: 'mock-jwt-login', tokenType: 'Bearer', expiresIn: 3600, userId: 999, username: body.username }
  }

  // conversations
  if (path === '/api/conversations' && method === 'POST') {
    const body = JSON.parse(options.body || '{}')
    const newId = Date.now()
    const conv = { id: newId, mode: body.mode || 'PLAIN', title: body.title || 'Новый чат', createdAt: new Date().toISOString() }
    mockConversations.push(conv)
    mockMessages[newId] = []
    await wait()
    return conv
  }
  if (/^\/api\/conversations\/\d+$/.test(path) && method === 'GET') {
    const id = Number(path.split('/').pop())
    const conv = mockConversations.find((c) => c.id === id)
    if (!conv) { await wait(); throw new Error('Conversation not found') }
    await wait()
    return { ...conv }
  }
  if (/^\/api\/conversations\/\d+\/messages$/.test(path) && method === 'GET') {
    const id = Number(path.split('/').pop())
    await wait()
    return [...(mockMessages[id] || [])]
  }
  if (/^\/api\/conversations\/\d+\/messages$/.test(path) && method === 'POST') {
    const body = JSON.parse(options.body || '{}')
    const id = Number(path.split('/').pop())
    const userMsg = { id: Date.now(), role: 'USER', content: body.content, createdAt: new Date().toISOString() }
    await wait(600)

    // разный ответ в зависимости от режима
    const conv = mockConversations.find((c) => c.id === id)
    const isRag = conv?.mode === 'RAG'
    let answer, usedRag, usedContext, retrievedChunksCount

    if (isRag) {
      usedRag = true
      usedContext = true
      retrievedChunksCount = 3
      answer = ragAnswer
    } else {
      usedRag = false
      usedContext = false
      retrievedChunksCount = 0
      answer = plainAnswer
    }

    const assistantMsg = { id: Date.now() + 1, role: 'ASSISTANT', content: answer, createdAt: new Date().toISOString() }
    if (!mockMessages[id]) mockMessages[id] = []
    mockMessages[id].push(userMsg, assistantMsg)
    return { content: answer, conversationId: id, usedRag, usedContext, retrievedChunksCount }
  }

  // fallback
  await wait()
  throw new Error('Not found (mock): ' + path)
}
