import { useEffect, useRef, useState } from 'react'
import {
  createConversation,
  listConversations,
  getConversation,
  getMessages,
  getEmbeddingJob,
  startEmbeddingJob,
  startMessageStreaming,
} from '../api/chat'
import MessageBubble from '../components/MessageBubble'
import Sidebar from '../components/Sidebar'

let localMessageSequence = 0

function nextLocalMessageId() {
  if (globalThis.crypto?.randomUUID) {
    return `local-${globalThis.crypto.randomUUID()}`
  }

  localMessageSequence += 1
  return `local-${Date.now()}-${localMessageSequence}`
}

export function createPendingMessages(content) {
  return {
    user: { id: nextLocalMessageId(), role: 'USER', content },
    assistant: {
      id: nextLocalMessageId(),
      role: 'ASSISTANT',
      content: '',
      thinking: '',
      isStreaming: true,
    },
  }
}

export function appendAssistantText(messages, assistantId, field, value) {
  return messages.map((message) =>
    message.id === assistantId
      ? { ...message, [field]: (message[field] || '') + value }
      : message
  )
}

export function isNearMessagesBottom({ scrollHeight, scrollTop, clientHeight }, threshold = 32) {
  return scrollHeight - scrollTop - clientHeight <= threshold
}

export default function ChatPage({ onLogout }) {
  const [conversationId, setConversationId] = useState(null)
  const [conversationMode, setConversationMode] = useState('PLAIN')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [embeddingInitLoading, setEmbeddingInitLoading] = useState(false)
  const [embeddingJob, setEmbeddingJob] = useState(null)
  const [ragStepStates, setRagStepStates] = useState(null)
  const [ragNotice, setRagNotice] = useState('')
  const [ragProgressDismissed, setRagProgressDismissed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showModeSelect, setShowModeSelect] = useState(false)
  const [conversations, setConversations] = useState([])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false)
  const [streamingAssistantId, setStreamingAssistantId] = useState(null)
  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const autoFollowRef = useRef(true)
  const scrollFrameRef = useRef(null)
  const ragProgressDismissedRef = useRef(false)
  const streamCancelRef = useRef(null)
  const embeddingJobTimerRef = useRef(null)

  const clearRagProgress = () => {
    ragProgressDismissedRef.current = false
    setRagProgressDismissed(false)
    setRagStepStates(null)
    setRagNotice('')
  }

  const dismissRagProgress = () => {
    ragProgressDismissedRef.current = true
    setRagProgressDismissed(true)
    setRagStepStates(null)
    setRagNotice('')
  }

  const persistConversation = (id, mode) => {
    setConversationId(id)
    setConversationMode(mode)
    localStorage.setItem('conversationId', String(id))
    localStorage.setItem('conversationMode', mode)
  }

  const scrollToBottom = (behavior = 'smooth') => {
    const container = messagesContainerRef.current
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior })
      return
    }
    messagesEndRef.current?.scrollIntoView({ behavior })
  }

  const scheduleScrollToBottom = () => {
    if (!autoFollowRef.current) return
    if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current)
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null
      if (autoFollowRef.current) scrollToBottom('auto')
    })
  }

  const onMessagesScroll = () => {
    const container = messagesContainerRef.current
    if (!container) return
    autoFollowRef.current = isNearMessagesBottom(container)
  }

  const loadConversation = async (conv) => {
    setLoading(true)
    setError('')
    clearRagProgress()
    autoFollowRef.current = true
    try {
      persistConversation(conv.id, conv.mode || 'PLAIN')
      const history = await getMessages(conv.id)
      setMessages(Array.isArray(history) ? history : [])
      setShowModeSelect(false)
      setSidebarMobileOpen(false)
      setTimeout(() => scrollToBottom(), 100)
    } catch (e) {
      console.error('[chat] load:error', e)
      setError('Ошибка загрузки: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const refreshConversations = async () => {
    try {
      const list = await listConversations()
      setConversations(Array.isArray(list) ? list : [])
    } catch (_) {}
  }

  useEffect(() => {
    const savedId = localStorage.getItem('conversationId')
    async function init() {
      setLoading(true)
      setError('')
      try {
        await refreshConversations()
        if (savedId) {
          const convData = await getConversation(savedId)
          persistConversation(Number(savedId), convData?.mode || 'PLAIN')
          const history = await getMessages(savedId)
          setMessages(Array.isArray(history) ? history : [])
        } else {
          setShowModeSelect(true)
        }
      } catch (e) {
        console.error('[chat] init:error', e)
        localStorage.removeItem('conversationId')
        localStorage.removeItem('conversationMode')
        setConversationId(null)
        setConversationMode('PLAIN')
        setShowModeSelect(true)
        setError('Ошибка загрузки чата: ' + e.message)
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [])

  useEffect(() => () => {
    streamCancelRef.current?.()
    clearTimeout(embeddingJobTimerRef.current)
    if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current)
  }, [])

  useEffect(() => {
    if (streamingAssistantId) scheduleScrollToBottom()
  }, [messages, streamingAssistantId])

  const handleCreateConversation = async (mode) => {
    setLoading(true)
    setError('')
    try {
      const created = await createConversation(mode)
      persistConversation(created.id, created?.mode || mode)
      setMessages([])
      setShowModeSelect(false)
      await refreshConversations()
    } catch (e) {
      setError('Ошибка создания чата: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!input.trim() || conversationId == null || loading || streamCancelRef.current) return

    const userText = input.trim()
    const pendingMessages = createPendingMessages(userText)
    const assistantId = pendingMessages.assistant.id
    setLoading(true)
    autoFollowRef.current = true
    setInput('')
    setError('')
    setMessages((prev) => [...prev, pendingMessages.user, pendingMessages.assistant])

    // Reset RAG state at submit time; real progress will come from server events.
    clearRagProgress()

    setStreamingAssistantId(assistantId)

    try {
      const stream = startMessageStreaming(
        conversationId,
        userText,
        (chunk) => {
            if (chunk.type === 'rag_step') {
              if (ragProgressDismissedRef.current) return
              const validSteps = ['embedding', 'search', 'generation']
              if (!validSteps.includes(chunk.step)) {
                console.warn('[chat] unknown rag_step:', chunk)
                return
              }

              setRagStepStates((prev) => {
                const base = prev || {
                  embedding:   { status: 'pending', label: 'Эмбеддим запрос…' },
                  search:      { status: 'pending', label: 'Ищем похожие фрагменты…' },
                  generation:  { status: 'pending', label: 'Формируем ответ…' },
                }

                const next = {
                  ...base,
                  [chunk.step]: {
                    ...base[chunk.step],
                    status: chunk.status === 'start' ? 'active' : 'done',
                  },
                }

                return next
              })
            } else if (chunk.type === 'rag_search') {
              if (ragProgressDismissedRef.current) return
              setRagNotice('Найдено чанков: ' + (chunk.foundChunks ?? '?'))
            } else if (chunk.type === 'thinking') {
              if (typeof chunk.thinking !== 'string' || !chunk.thinking.trim()) return
              setMessages((prev) => appendAssistantText(prev, assistantId, 'thinking', chunk.thinking))
            } else if (chunk.type === 'content') {
              if (typeof chunk.content !== 'string' || !chunk.content) return
              setMessages((prev) => appendAssistantText(prev, assistantId, 'content', chunk.content))
            } else if (chunk.type === 'done') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: m.content,
                        thinking: m.thinking,
                        isStreaming: false,
                      }
                    : m
                )
              )
              setStreamingAssistantId(null)

              if (chunk.usedRag && !chunk.usedContext) {
                if (!ragProgressDismissedRef.current) {
                  setRagNotice('Релевантный контекст не найден')
                }
              }

              // Ensure RAG steps complete even if some events were missing.
              if (conversationMode === 'RAG') {
                setRagStepStates((prev) => {
                  const base = prev || {
                    embedding:   { status: 'pending', label: 'Эмбеддим запрос…' },
                    search:      { status: 'pending', label: 'Ищем похожие фрагменты…' },
                    generation:  { status: 'pending', label: 'Формируем ответ…' },
                  }

                  const next = {
                    embedding:   { ...base.embedding, status: 'done' },
                    search:      { ...base.search, status: 'done' },
                    generation:  { ...base.generation, status: 'done' },
                  }

                  return next
                })
              }
            }
        },
        conversationMode
      )
      streamCancelRef.current = stream.cancel
      await stream.completion

      await refreshConversations()
      setTimeout(() => scrollToBottom(), 100)
    } catch (e) {
      setMessages((prev) => prev.filter((message) => message.id !== assistantId))
      setError('Ошибка отправки: ' + e.message)
      clearRagProgress()
      setStreamingAssistantId(null)
    } finally {
      streamCancelRef.current = null
      setLoading(false)
    }
  }

  const onNewChat = () => {
    clearRagProgress()
    autoFollowRef.current = true
    setShowModeSelect(true)
    setMessages([])
    setConversationId(null)
    setConversationMode('PLAIN')
    localStorage.removeItem('conversationId')
    localStorage.removeItem('conversationMode')
    setSidebarMobileOpen(false)
  }

  const onInitEmbeddings = async () => {
    if (embeddingInitLoading) return
    setEmbeddingInitLoading(true)
    setError('')
    try {
      const job = await startEmbeddingJob()
      setEmbeddingJob(job)
      const pollJob = async () => {
        try {
          const current = await getEmbeddingJob(job.id)
          setEmbeddingJob(current)
          if (current.status === 'QUEUED' || current.status === 'RUNNING') {
            embeddingJobTimerRef.current = setTimeout(pollJob, 1000)
          } else {
            setEmbeddingInitLoading(false)
          }
        } catch (e) {
          setEmbeddingInitLoading(false)
          setError('Ошибка проверки статуса эмбеддингов: ' + e.message)
        }
      }
      embeddingJobTimerRef.current = setTimeout(pollJob, 500)
    } catch (e) {
      setError('Ошибка инициализации эмбеддингов: ' + e.message)
      setEmbeddingInitLoading(false)
    }
  }

  // ===== MODE SELECT SCREEN =====
  if (showModeSelect) {
    return (
      <div className={`app-layout ${sidebarMobileOpen ? 'sidebar-mobile-panel-open' : ''}`}>
        {/* Desktop sidebar — always visible on desktop */}
        <div className={`sidebar-desktop ${sidebarCollapsed ? 'sidebar-desktop-collapsed' : ''}`}>
          <Sidebar
            conversations={conversations}
            activeId={conversationId}
            onSelect={loadConversation}
            onNewChat={onNewChat}
            onLogout={onLogout}
            loading={loading}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
          />
        </div>

        {/* Mobile drawer — only rendered when open */}
        {sidebarMobileOpen && (
          <>
            <div className="sidebar-overlay sidebar-overlay-visible" onClick={() => setSidebarMobileOpen(false)} />
            <div className="sidebar-mobile-panel">
              <Sidebar
                conversations={conversations}
                activeId={conversationId}
                onSelect={loadConversation}
                onNewChat={onNewChat}
                onLogout={onLogout}
                loading={loading}
              />
            </div>
          </>
        )}

        <div className="main-area">
          <div className="chat-container mode-select-container">
            <div className="chat-header">
              <button className="btn-icon btn-icon-mobile" onClick={() => setSidebarMobileOpen((v) => !v)} title="Меню">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
              <h1>RAG Chatbot</h1>
              <div className="header-right"></div>
            </div>
            <div className="mode-select-content">
              <div className="mode-select-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
              </div>
              <h2 className="mode-select-title">Добро пожаловать!</h2>
              <p className="mode-select-subtitle">Выберите режим для нового чата:</p>
              <div className="mode-cards">
                <button className="mode-card" onClick={() => handleCreateConversation('PLAIN')} disabled={loading}>
                  <div className="mode-card-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M8 12h8M12 8v8" />
                    </svg>
                  </div>
                  <h3>PLAIN</h3>
                  <p>Обычный LLM-чат без базы знаний</p>
                </button>
                <button className="mode-card" onClick={() => handleCreateConversation('RAG')} disabled={loading}>
                  <div className="mode-card-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
                      <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
                    </svg>
                  </div>
                  <h3>RAG</h3>
                  <p>Чат с поиском по базе знаний</p>
                </button>
              </div>
              {loading && <div className="loading"><div className="spinner" /></div>}
              {error && <div className="error">{error}</div>}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ===== CHAT SCREEN =====
  return (
    <div className={`app-layout ${sidebarMobileOpen ? 'sidebar-mobile-panel-open' : ''}`}>
      {/* Desktop sidebar */}
      <div className={`sidebar-desktop ${sidebarCollapsed ? 'sidebar-desktop-collapsed' : ''}`}>
        <Sidebar
          conversations={conversations}
          activeId={conversationId}
          onSelect={loadConversation}
          onNewChat={onNewChat}
          onLogout={onLogout}
          loading={loading}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        />
      </div>

      {/* Mobile drawer */}
      {sidebarMobileOpen && (
        <>
          <div className="sidebar-overlay sidebar-overlay-visible" onClick={() => setSidebarMobileOpen(false)} />
          <div className="sidebar-mobile-panel">
            <Sidebar
              conversations={conversations}
              activeId={conversationId}
              onSelect={loadConversation}
              onNewChat={onNewChat}
              onLogout={onLogout}
              loading={loading}
            />
          </div>
        </>
      )}

      <div className="main-area">
        <div className="chat-container">
          <div className="chat-header">
            <button className="btn-icon btn-icon-mobile" onClick={() => setSidebarMobileOpen((v) => !v)} title="Меню">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <h1>RAG Chatbot</h1>
            <div className="header-right">
              {conversationMode === 'RAG' && (
                <span className="mode-indicator">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
                    <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
                  </svg>
                  RAG
                </span>
              )}
              <button
                className="embeddings-init-button"
                onClick={onInitEmbeddings}
                disabled={embeddingInitLoading}
                title="Инициализировать эмбеддинги"
              >
                {embeddingInitLoading ? '⏳' : '🧠'}
              </button>
            </div>
          </div>

          <div className="messages" key={conversationId} ref={messagesContainerRef} onScroll={onMessagesScroll}>
            {/* RAG progress — real steps from SSE events */}
            {conversationMode === 'RAG' && ragStepStates && !ragProgressDismissed && (
              <div className="rag-progress">
                <div className="rag-progress-header">
                  <span>Обработка RAG</span>
                  <button type="button" className="rag-progress-close" onClick={dismissRagProgress} aria-label="Закрыть этапы RAG" title="Закрыть">
                    ×
                  </button>
                </div>
                {Object.entries(ragStepStates).map(([key, step], idx) => (
                  <div className={`rag-step rag-step-${step.status}`} key={idx}>
                    {step.status === 'active' && <span className="rag-step-icon spinner-small" />}
                    {step.status === 'done' && <span className="rag-step-icon rag-check">✓</span>}
                    {step.status === 'error' && <span className="rag-step-icon rag-error">✗</span>}
                    {step.status === 'pending' && <span className="rag-step-icon">○</span>}
                    <span className="rag-step-label">{step.label}</span>
                  </div>
                ))}
                {ragNotice && <div className="rag-notice" role="status">{ragNotice}</div>}
              </div>
            )}
            {messages.length === 0 && !loading && (
              <div className="messages-empty">
                <p>Начните диалог{conversationMode === 'RAG' ? ' — поиск по базе знаний включён' : ''}</p>
              </div>
            )}
            {messages.map((msg, idx) => (
              <MessageBubble
                key={msg.id || idx}
                role={msg.role}
                content={msg.content}
                thinking={msg.thinking}
                isStreaming={msg.isStreaming}
                streamingStatus={
                  msg.isStreaming && !msg.content && conversationMode === 'PLAIN'
                    ? 'Формирую ответ…'
                    : ''
                }
              />
            ))}
            {loading && !streamingAssistantId && (
              <div className="message assistant">
                <div className="bubble bubble-assistant">
                  <div className="spinner" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {error && <div className="error">{error}</div>}
          {embeddingJob && (
            <div className="embedding-job-status">
              Эмбеддинги: {embeddingJob.status.toLowerCase()} — {embeddingJob.processedChunks + embeddingJob.skippedChunks + embeddingJob.failedChunks}/{embeddingJob.totalChunks}
              {embeddingJob.failedChunks > 0 && `, ошибок: ${embeddingJob.failedChunks}`}
              {embeddingJob.errorMessage && ` — ${embeddingJob.errorMessage}`}
            </div>
          )}
          <form onSubmit={onSubmit} className="input-row">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Введите сообщение..."
              autoComplete="off"
            />
            <button type="submit" disabled={loading || !input.trim()} title="Отправить" className="send-button">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
