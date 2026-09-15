// Mock API для локальной разработки без бэкенда.
// Активируется через VITE_MOCK=true в web/.env

const MOCK_DELAY = 400
const MOCK_USER_ID = 999

const mockConversations = [
  { id: 1, userId: MOCK_USER_ID, mode: 'PLAIN', title: 'Общий чат', createdAt: new Date().toISOString() },
  { id: 2, userId: MOCK_USER_ID, mode: 'RAG', title: 'Астрономия', createdAt: new Date().toISOString() },
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

let mockEmbeddingJob = null

function wait(ms = MOCK_DELAY) {
  return new Promise((r) => setTimeout(r, ms))
}

function getPathname(path) {
  return path.split('?')[0]
}

function conversationIdFromMessagesPath(pathname) {
  return Number(pathname.split('/')[3])
}

export function isMockEnabled() {
  return import.meta.env.VITE_MOCK === 'true'
}

export async function mockApiRequest(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const pathname = getPathname(path)

  // auth
  if (pathname === '/api/auth/register' && method === 'POST') {
    const body = JSON.parse(options.body || '{}')
    await wait()
    return { accessToken: 'mock-jwt-' + Date.now(), tokenType: 'Bearer', expiresIn: 3600, userId: MOCK_USER_ID, username: body.username }
  }
  if (pathname === '/api/auth/login' && method === 'POST') {
    const body = JSON.parse(options.body || '{}')
    await wait()
    return { accessToken: 'mock-jwt-login', tokenType: 'Bearer', expiresIn: 3600, userId: MOCK_USER_ID, username: body.username }
  }

  // conversations list
  if (pathname === '/api/conversations' && method === 'GET') {
    await wait()
    return mockConversations.map(c => ({ ...c }))
  }

  // conversations create
  if (pathname === '/api/conversations' && method === 'POST') {
    const body = JSON.parse(options.body || '{}')
    const newId = Date.now()
    const conv = { id: newId, userId: MOCK_USER_ID, mode: body.mode || 'PLAIN', title: body.title || 'Новый чат', createdAt: new Date().toISOString() }
    mockConversations.push(conv)
    mockMessages[newId] = []
    await wait()
    return conv
  }

  // single conversation
  if (/^\/api\/conversations\/\d+$/.test(pathname) && method === 'GET') {
    const id = Number(pathname.split('/').pop())
    const conv = mockConversations.find((c) => c.id === id)
    if (!conv) { await wait(); throw new Error('Conversation not found') }
    await wait()
    return { ...conv }
  }

  // messages list
  if (/^\/api\/conversations\/\d+\/messages$/.test(pathname) && method === 'GET') {
    const id = conversationIdFromMessagesPath(pathname)
    await wait()
    return [...(mockMessages[id] || [])]
  }

  if (pathname === '/api/admin/embeddings/jobs' && method === 'POST') {
    const now = new Date().toISOString()
    mockEmbeddingJob = {
      id: Date.now(),
      status: 'COMPLETED',
      totalChunks: 3,
      processedChunks: 3,
      skippedChunks: 0,
      failedChunks: 0,
      requestedByUserId: MOCK_USER_ID,
      errorMessage: null,
      createdAt: now,
      startedAt: now,
      completedAt: now,
    }
    await wait()
    return { ...mockEmbeddingJob }
  }

  if (/^\/api\/admin\/embeddings\/jobs\/\d+$/.test(pathname) && method === 'GET') {
    if (!mockEmbeddingJob || mockEmbeddingJob.id !== Number(pathname.split('/').pop())) {
      await wait()
      throw new Error('Embedding job not found')
    }
    await wait()
    return { ...mockEmbeddingJob }
  }

  // fallback
  await wait()
  throw new Error('Not found (mock): ' + path)
}

// ====== Mock Streaming ======

/**
 * Simulates streaming with realistic RAG step events:
 *   rag_step(embedding, start/done) → rag_step(search, start/done) → rag_search → rag_step(generation, start) → thinking chunks → rag_step(generation, done) → done
 * Returns a cleanup function (no-op).
 */
export function mockStreamResponse(conversationId, content, mode, onChunk) {
  const query = truncate(content, 60)

  let thinkingText, answer, usedRag, usedContext, retrievedChunksCount
  if (mode === 'RAG') {
    thinkingText = `Запрос: «${query}» — тип: definition.\n\n1. Эмбеддинг запроса (dim=3072) готов.\n2. Поиск по БД: top-5, порог 0.72 → 3 чанка.\n3. Источники: NASA Exoplanet Archive, exoplanets.eu, Wikipedia.\n4. Формирую ответ из чанков #1, #2.`
    answer = 'Экзопланеты — это планеты за пределами нашей Солнечной системы. Согласно базе знаний, они обнаруживаются транзитным методом, методом радиальных скоростей и прямым наблюдением.'
    usedRag = true
    usedContext = true
    retrievedChunksCount = 3
  } else {
    thinkingText = `Пользователь спрашивает: «${query}»\n\n**Анализ:** общий вопрос, не требует RAG.\n**Сложность:** low.\n\nГенерирую ответ на основе базовых знаний.`
    answer = 'Это mock-ответ. Подключите бэкенд для реальных ответов.'
    usedRag = false
    usedContext = false
    retrievedChunksCount = 0
  }

  const thinkingWords = splitIntoWords(thinkingText)
  let i = 0
  let thinkingAccum = ''
  let finished = false

  const finish = () => {
    if (finished) return
    finished = true
    onChunk({ type: 'content', content: answer })
    if (!mockMessages[conversationId]) mockMessages[conversationId] = []
    mockMessages[conversationId].push(
      { id: Date.now(), role: 'USER', content, createdAt: new Date().toISOString() },
      { id: Date.now() + 1, role: 'ASSISTANT', content: answer, thinking: thinkingAccum, createdAt: new Date().toISOString() },
    )
    onChunk({
      type: 'done',
      thinking: thinkingAccum,
      content: answer,
      usedRag,
      usedContext,
      retrievedChunksCount,
    })
  }

  if (mode === 'RAG') {
    // ── Realistic RAG step sequence ──

    // Phase 1: Embedding start (100ms)
    const t0 = setTimeout(() => onChunk({ type: 'rag_step', step: 'embedding', status: 'start' }), 100)

    // Phase 1: Embedding done (700ms)
    const t1 = setTimeout(() => onChunk({ type: 'rag_step', step: 'embedding', status: 'done' }), 700)

    // Phase 2: Search start (800ms)
    const t2 = setTimeout(() => onChunk({ type: 'rag_step', step: 'search', status: 'start' }), 800)

    // Phase 2: Search done + found chunks (1600ms)
    const t3 = setTimeout(() => {
      onChunk({ type: 'rag_step', step: 'search', status: 'done' })
      onChunk({ type: 'rag_search', foundChunks: retrievedChunksCount })
    }, 1600)

    // Phase 3: Generation start (1700ms)
    const t4 = setTimeout(() => onChunk({ type: 'rag_step', step: 'generation', status: 'start' }), 1700)

    // Thinking chunks word-by-word (starting at 1900ms)
    let done = false
    const ragInterval = setInterval(() => {
      if (done) return
      if (i < thinkingWords.length) {
        thinkingAccum += thinkingWords[i]
        onChunk({ type: 'thinking', thinking: thinkingWords[i] })
        i++
      } else {
        done = true
        clearInterval(ragInterval)
        onChunk({
          type: 'rag_step',
          step: 'generation',
          status: 'done',
        })
        finish()
      }
    }, 50) // 50ms per word

    // Cleanup: clear all timeouts/interval if user navigates away
    return () => {
      clearTimeout(t0)
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(t4)
      clearInterval(ragInterval)
    }
  }

  // ── PLAIN mode (no RAG steps, original behavior) ──
  const interval = setInterval(() => {
    if (i < thinkingWords.length) {
      thinkingAccum += thinkingWords[i]
      onChunk({ type: 'thinking', thinking: thinkingWords[i] })
      i++
    } else {
      clearInterval(interval)
      finish()
    }
  }, 50) // 50ms per word

  // Cleanup: clear interval if user navigates away
  return () => clearInterval(interval)
}

function truncate(s, max) {
  if (!s) return ''
  return s.length <= max ? s : s.substring(0, max) + '...'
}

function splitIntoWords(text) {
  return text.split(/(?<=\s)|(?=\s)/)
}
