import { useEffect, useState } from 'react'
import {
  createConversation,
  getConversation,
  getMessages,
  initEmbeddings,
  sendMessage,
} from '../api/chat'
import MessageBubble from '../components/MessageBubble'

export default function ChatPage({ onLogout }) {
  const [conversationId, setConversationId] = useState(null)
  const [conversationMode, setConversationMode] = useState('PLAIN')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [embeddingInitLoading, setEmbeddingInitLoading] = useState(false)
  const [retrievalStatus, setRetrievalStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showModeSelect, setShowModeSelect] = useState(false)

  const handleModeChange = (nextMode) => {
    setConversationMode(nextMode)
    console.info('[chat] mode:changed-locally', { conversationId, mode: nextMode })
  }

  const persistConversation = (id, mode) => {
    setConversationId(id)
    setConversationMode(mode)
    localStorage.setItem('conversationId', String(id))
    localStorage.setItem('conversationMode', mode)
  }

  useEffect(() => {
    const savedId = localStorage.getItem('conversationId')
    const savedMode = localStorage.getItem('conversationMode')
    console.info('[chat] init:start', { savedConversationId: savedId, savedMode })

    async function init() {
      setLoading(true)
      setError('')
      try {
        if (savedId) {
          const convData = await getConversation(savedId)
          const serverMode = convData?.mode || 'PLAIN'
          persistConversation(Number(savedId), serverMode)
          const history = await getMessages(savedId)
          setMessages(Array.isArray(history) ? history : [])
          console.info('[chat] init:history-loaded', {
            conversationId: Number(savedId),
            mode: serverMode,
            messagesCount: Array.isArray(history) ? history.length : 0,
          })
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
        setError(`Ошибка загрузки чата: ${e.message}`)
      } finally {
        setLoading(false)
        console.info('[chat] init:done')
      }
    }

    init()
  }, [])

  const handleCreateConversation = async (mode) => {
    setLoading(true)
    setError('')
    try {
      const created = await createConversation(mode)
      const serverMode = created?.mode && ['PLAIN', 'RAG'].includes(created.mode)
        ? created.mode
        : mode
      persistConversation(created.id, serverMode)
      setMessages([])
      setShowModeSelect(false)
      console.info('[chat] created', { conversationId: created.id, mode: serverMode })
    } catch (e) {
      console.error('[chat] create:error', e)
      setError(`Ошибка создания чата: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!input.trim() || conversationId == null || loading) {
      return
    }

    const userText = input.trim()
    console.info('[chat] submit:start', { conversationId, mode: conversationMode, userText })
    setInput('')
    setError('')
    setMessages((prev) => [...prev, { role: 'USER', content: userText }])
    setLoading(true)

    try {
      const response = await sendMessage(conversationId, userText, conversationMode)
      console.info('[chat] submit:assistant-response', { response })
      setMessages((prev) => [...prev, { role: 'ASSISTANT', content: response?.content || '' }])

      if (response?.usedRag) {
        setRetrievalStatus(response?.usedContext
          ? `RAG: найдено чанков: ${response?.retrievedChunksCount ?? 0}`
          : 'Контекст не найден, ответ без базы знаний')
      } else {
        setRetrievalStatus('')
      }
    } catch (e) {
      console.error('[chat] submit:error', e)
      setError(`Ошибка отправки: ${e.message}`)
    } finally {
      setLoading(false)
      console.info('[chat] submit:done')
    }
  }

  const onNewChat = () => {
    setShowModeSelect(true)
    setMessages([])
    setConversationId(null)
    setConversationMode('PLAIN')
    localStorage.removeItem('conversationId')
    localStorage.removeItem('conversationMode')
  }

  const onInitEmbeddings = async () => {
    if (embeddingInitLoading) return
    setEmbeddingInitLoading(true)
    setError('')
    try {
      await initEmbeddings()
      console.info('[chat] embeddings:init-triggered')
    } catch (e) {
      console.error('[chat] embeddings:init-error', e)
      setError(`Ошибка инициализации эмбеддингов: ${e.message}`)
    } finally {
      setEmbeddingInitLoading(false)
    }
  }

  // === Mode Selection Screen ===
  if (showModeSelect) {
    return (
      <div className="page">
        <div className="chat-container">
          <div className="chat-header">
            <div className="header-actions">
              <button
                className="btn-icon"
                onClick={onLogout}
                title="Выйти"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </div>
            <h1>RAG Chatbot</h1>
            <div className="header-actions" />
          </div>
          <div className="mode-select-screen">
            <h1>Добро пожаловать!</h1>
            <p>Выберите режим для нового чата:</p>
            <div className="mode-cards">
              <button
                className="mode-card"
                onClick={() => handleCreateConversation('PLAIN')}
                disabled={loading}
              >
                <h2>PLAIN</h2>
                <p>Обычный LLM-чат без базы знаний</p>
              </button>
              <button
                className="mode-card"
                onClick={() => handleCreateConversation('RAG')}
                disabled={loading}
              >
                <h2>RAG</h2>
                <p>Чат с поиском по векторной базе знаний</p>
              </button>
            </div>
            {loading && <div className="loading"><div className="spinner" /></div>}
            {error && <div className="error">{error}</div>}
          </div>
        </div>
      </div>
    )
  }

  // === Chat Screen ===
  return (
    <div className="page">
      <div className="chat-container">
        <div className="chat-header">
          <div className="header-actions">
            <button
              className="btn-icon"
              onClick={onLogout}
              title="Выйти"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
            <button className="btn-ghost" onClick={onNewChat}>
              + Новый чат
            </button>
          </div>
          <h1>RAG Chatbot</h1>
          <button
            type="button"
            className="embeddings-init-button"
            onClick={onInitEmbeddings}
            disabled={embeddingInitLoading}
            title="Запустить векторизацию данных"
          >
            {embeddingInitLoading ? 'Инициализация...' : 'Инициализировать эмбеддинги'}
          </button>
        </div>

        <div className="mode-switch">
          <button
            type="button"
            className={`mode-tab ${conversationMode === 'PLAIN' ? 'mode-tab-active' : ''}`}
            onClick={() => handleModeChange('PLAIN')}
          >
            PLAIN
          </button>
          <button
            type="button"
            className={`mode-tab ${conversationMode === 'RAG' ? 'mode-tab-active' : ''}`}
            onClick={() => handleModeChange('RAG')}
          >
            RAG
          </button>
        </div>

        <div className="messages">
          {messages.map((msg, idx) => (
            <MessageBubble key={idx} role={msg.role} content={msg.content} />
          ))}
          {loading && (
            <div className="message assistant">
              <div className="bubble bubble-assistant">
                <div className="spinner" />
              </div>
            </div>
          )}
        </div>

        {error && <div className="error">{error}</div>}
        {retrievalStatus && <div className="retrieval-status">{retrievalStatus}</div>}

        <form onSubmit={onSubmit} className="input-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Введите сообщение..."
          />
          <button type="submit" disabled={loading || !input.trim()} title="Отправить">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  )
}
