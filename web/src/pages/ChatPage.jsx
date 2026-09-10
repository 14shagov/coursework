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
        // Если диалог не найден на бэкенде — сбрасываем и показываем выбор
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
      // ВАЖНО: используем mode из ответа, а не из аргумента — сервер может корректировать
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
      console.warn('[chat] submit:blocked', {
        hasInput: Boolean(input.trim()),
        conversationId,
        loading,
      })
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
        if (response?.usedContext) {
          setRetrievalStatus(`RAG: найдено чанков: ${response?.retrievedChunksCount ?? 0}`)
        } else {
          setRetrievalStatus('Контекст не найден, ответ без базы знаний')
        }
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
    if (embeddingInitLoading) {
      return
    }
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

  if (showModeSelect) {
    return (
      <div className="page">
        <div className="chat-container">
          <button
            type="button"
            className="logout-button logout-button-top"
            onClick={onLogout}
          >
            Выйти
          </button>

          <div className="mode-select-screen">
            <h1>RAG Chatbot</h1>
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
            {loading && <div className="loading">Создание чата...</div>}
            {error && <div className="error">{error}</div>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="chat-container">
        <button
          type="button"
          className="logout-button logout-button-top"
          onClick={onLogout}
        >
          Выйти
        </button>

        <button
          type="button"
          className="logout-button logout-button-secondary"
          onClick={onNewChat}
          title="Новый чат"
        >
          Новый чат
        </button>

        <button
          type="button"
          className="embeddings-init-button"
          onClick={onInitEmbeddings}
          disabled={embeddingInitLoading}
          title="Запустить векторизацию данных без эмбеддингов"
        >
          {embeddingInitLoading ? 'Инициализация...' : 'Инициализировать эмбеддинги'}
        </button>
        <div className="chat-header"><h1>RAG Chatbot</h1></div>

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
          {loading && <div className="loading">Загрузка...</div>}
        </div>

        {error && <div className="error">{error}</div>}
        {retrievalStatus && <div className="info">{retrievalStatus}</div>}

        <form onSubmit={onSubmit} className="input-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Введите сообщение..."
          />
          <button type="submit" disabled={loading || !input.trim()}>
            Отправить
          </button>
        </form>
      </div>
    </div>
  )
}
