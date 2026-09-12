import { useEffect, useRef, useState } from 'react'
import {
  createConversation,
  listConversations,
  getConversation,
  getMessages,
  initEmbeddings,
  sendMessage,
  sendMessageStreaming,
} from '../api/chat'
import MessageBubble from '../components/MessageBubble'
import Sidebar from '../components/Sidebar'

export default function ChatPage({ onLogout }) {
  const [conversationId, setConversationId] = useState(null)
  const [conversationMode, setConversationMode] = useState('PLAIN')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [embeddingInitLoading, setEmbeddingInitLoading] = useState(false)
  const [retrievalStatus, setRetrievalStatus] = useState('')
  const [ragStepStates, setRagStepStates] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showModeSelect, setShowModeSelect] = useState(false)
  const [conversations, setConversations] = useState([])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false)
  const [streamingAssistantId, setStreamingAssistantId] = useState(null)
  const messagesEndRef = useRef(null)
  const ragCleanupTimerRef = useRef(null)
  const ragCleanupScheduledRef = useRef(false)

  const clearRagCleanupTimer = () => {
    if (ragCleanupTimerRef.current) {
      clearTimeout(ragCleanupTimerRef.current)
      ragCleanupTimerRef.current = null
    }
    ragCleanupScheduledRef.current = false
  }

  const scheduleRagClear = (delay) => {
    clearRagCleanupTimer()
    ragCleanupScheduledRef.current = true
    ragCleanupTimerRef.current = setTimeout(() => {
      ragCleanupScheduledRef.current = false
      setRagStepStates(null)
    }, delay)
  }

  const persistConversation = (id, mode) => {
    setConversationId(id)
    setConversationMode(mode)
    localStorage.setItem('conversationId', String(id))
    localStorage.setItem('conversationMode', mode)
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadConversation = async (conv) => {
    setLoading(true)
    setError('')
    try {
      persistConversation(conv.id, conv.mode || 'PLAIN')
      const history = await getMessages(conv.id)
      setMessages(Array.isArray(history) ? history : [])
      setShowModeSelect(false)
      setSidebarMobileOpen(false)
      setTimeout(scrollToBottom, 100)
    } catch (e) {
      console.error('[chat] load:error', e)
      setError('Ошибка загрузки: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const refreshConversations = async () => {
    try {
      const list = await listConversations(1)
      setConversations(Array.isArray(list) ? list : [])
    } catch (_) {}
  }

  useEffect(() => {
    const savedId = localStorage.getItem('conversationId')
    const savedMode = localStorage.getItem('conversationMode')

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
    if (!input.trim() || conversationId == null || loading) return

    const userText = input.trim()
    setInput('')
    setError('')
    setMessages((prev) => [...prev, { id: Date.now(), role: 'USER', content: userText }])
    // Start RAG progress for RAG mode — first step active, others pending
    if (conversationMode === 'RAG') {
      setRagStepStates({
        embedding:   { status: 'active', label: 'Эмбеддим запрос…' },
        search:      { status: 'pending', label: 'Ищем похожие фрагменты…' },
        generation:  { status: 'pending', label: 'Формируем ответ…' },
      })
    }

    // Create a placeholder assistant message for streaming
    const assistantId = Date.now() + 1
    setStreamingAssistantId(assistantId)
    setMessages((prev) => [...prev, {
      id: assistantId,
      role: 'ASSISTANT',
      content: '',
      thinking: '',
      isStreaming: true,
    }])

    try {
      let response

      // Try streaming first, fall back to non-streaming on error
      try {
        await sendMessageStreaming(
          conversationId,
          userText,
          conversationMode,
          (chunk) => {
            // ── RAG step management (new, real) ──
            if (chunk.type === 'rag_step') {
              const validSteps = ['embedding', 'search', 'generation']
              if (!validSteps.includes(chunk.step)) {
                console.warn('[chat] unknown rag_step:', chunk)
                return
              }
              setRagStepStates((prev) => {
                if (!prev) return prev
                return {
                  ...prev,
                  [chunk.step]: {
                    ...prev[chunk.step],
                    status: chunk.status === 'start' ? 'active' : 'done',
                  },
                }
              })
            } else if (chunk.type === 'rag_search') {
              setRetrievalStatus('Найдено чанков: ' + chunk.foundChunks)
            } else if (chunk.type === 'thinking') {
              // Append partial thinking text
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, thinking: (m.thinking || '') + chunk.thinking }
                    : m
                )
              )
            } else if (chunk.type === 'done') {
              // Final answer received — replace streaming message with complete one
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: chunk.content || '',
                        thinking: chunk.thinking || m.thinking,
                        isStreaming: false,
                      }
                    : m
                )
              )
              setStreamingAssistantId(null)

              if (chunk.usedRag) {
                setRetrievalStatus(
                  chunk.usedContext
                    ? 'RAG: найдено чанков: ' + chunk.retrievedChunksCount
                    : 'Контекст не найден, ответ без базы знаний'
                )
              } else {
                setRetrievalStatus('')
              }

              // All RAG steps done — clear after a short delay
              if (conversationMode === 'RAG') {
                setRagStepStates((prev) => {
                  if (!prev) return prev
                  return {
                    embedding:   { ...prev.embedding, status: 'done' },
                    search:      { ...prev.search, status: 'done' },
                    generation:  { ...prev.generation, status: 'done' },
                  }
                })
                scheduleRagClear(1000)
              }
            } else if (chunk.type === 'error') {
              // Streaming failed — mark message as non-streaming
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, isStreaming: false } : m
                )
              )
              setStreamingAssistantId(null)
              if (conversationMode === 'RAG') {
                setRagStepStates((prev) => {
                  if (!prev) return prev
                  return {
                    embedding:   { ...prev.embedding, status: 'error' },
                    search:      { ...prev.search, status: 'error' },
                    generation:  { ...prev.generation, status: 'error' },
                  }
                })
                scheduleRagClear(2000)
              }
              throw new Error(chunk.error || 'Streaming error')
            }
          }
        )
      } catch (streamErr) {
        console.warn('[chat] streaming failed, falling back to non-streaming:', streamErr.message)
        // Fallback: non-streaming request
        response = await sendMessage(conversationId, userText, conversationMode)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: response?.content || '',
                  thinking: response?.thinking,
                  isStreaming: false,
                }
              : m
          )
        )
        setStreamingAssistantId(null)

        if (response?.usedRag) {
          setRetrievalStatus(
            response?.usedContext
              ? 'RAG: найдено чанков: ' + (response?.retrievedChunksCount ?? 0)
              : 'Контекст не найден, ответ без базы знаний'
          )
        } else {
          setRetrievalStatus('')
        }

        // Fallback: mark all RAG steps done immediately (unless already errored)
        if (conversationMode === 'RAG') {
          setRagStepStates((prev) => {
            if (!prev) return prev
            // If any step already errored, don't overwrite
            if (Object.values(prev).some((s) => s.status === 'error')) return prev
            return {
              embedding:   { status: 'done', label: 'Эмбеддим запрос…' },
              search:      { status: 'done', label: 'Ищем похожие фрагменты…' },
              generation:  { status: 'done', label: 'Формируем ответ…' },
            }
          })
          scheduleRagClear(1000)
        }
      }

      await refreshConversations()
      setTimeout(scrollToBottom, 100)
    } catch (e) {
      setError('Ошибка отправки: ' + e.message)
      setRagStepStates(null)
      setStreamingAssistantId(null)
    } finally {
      setLoading(false)
    }
  }

  const onNewChat = () => {
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
      await initEmbeddings()
    } catch (e) {
      setError('Ошибка инициализации эмбеддингов: ' + e.message)
    } finally {
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

          <div className="messages" key={conversationId}>
            {/* RAG progress — real steps from SSE events */}
            {conversationMode === 'RAG' && ragStepStates && (
              <div className="rag-progress">
                {Object.entries(ragStepStates).map(([key, step], idx) => (
                  <div className={`rag-step rag-step-${step.status}`} key={idx}>
                    {step.status === 'active' && <span className="rag-step-icon spinner-small" />}
                    {step.status === 'done' && <span className="rag-step-icon rag-check">✓</span>}
                    {step.status === 'error' && <span className="rag-step-icon rag-error">✗</span>}
                    {step.status === 'pending' && <span className="rag-step-icon">○</span>}
                    <span className="rag-step-label">{step.label}</span>
                  </div>
                ))}
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
          {retrievalStatus && <div className="retrieval-status">{retrievalStatus}</div>}

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
