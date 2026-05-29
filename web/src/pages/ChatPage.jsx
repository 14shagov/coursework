import { useEffect, useState } from 'react'
import {
  createConversation,
  getMessages,
  initEmbeddings,
  sendMessage,
  updateMode,
} from '../api/chat'
import MessageBubble from '../components/MessageBubble'

export default function ChatPage({ onLogout }) {
  const [conversationId, setConversationId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [mode, setMode] = useState('PLAIN')
  const [embeddingInitLoading, setEmbeddingInitLoading] = useState(false)
  const [retrievalStatus, setRetrievalStatus] = useState('')

  const handleModeChange = async (nextMode) => {
    setMode((prevMode) => {
      if (prevMode !== nextMode) {
        console.info('[chat] mode:switched', { from: prevMode, to: nextMode })
      }
      return nextMode
    })

    if (conversationId != null) {
      try {
        await updateMode(conversationId, nextMode)
        console.info('[chat] mode:sync-success', { conversationId, mode: nextMode })
      } catch (e) {
        console.error('[chat] mode:sync-error', e)
      }
    }
  }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const savedId = localStorage.getItem('conversationId')
    console.info('[chat] init:start', { savedConversationId: savedId })

    async function init() {
      setLoading(true)
      setError('')
      try {
        if (savedId) {
          setConversationId(Number(savedId))
          console.info('[chat] init:load-history', { conversationId: Number(savedId) })
          const history = await getMessages(savedId)
          setMessages(Array.isArray(history) ? history : [])
          console.info('[chat] init:history-loaded', {
            conversationId: Number(savedId),
            messagesCount: Array.isArray(history) ? history.length : 0,
          })
        } else {
          const id = await createConversation()
          setConversationId(id)
          localStorage.setItem('conversationId', String(id))
          console.info('[chat] init:conversation-created', { conversationId: id })
        }
      } catch (e) {
        console.error('[chat] init:error', e)
        setError(`Ошибка инициализации: ${e.message}`)
      } finally {
        setLoading(false)
        console.info('[chat] init:done')
      }
    }

    init()
  }, [])

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
    console.info('[chat] submit:start', { conversationId, mode, userText })
    setInput('')
    setError('')
    setMessages((prev) => [...prev, { role: 'USER', content: userText }])
    setLoading(true)

    try {
      const response = await sendMessage(conversationId, userText, mode)
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
          className="embeddings-init-button"
          onClick={onInitEmbeddings}
          disabled={embeddingInitLoading}
          title="Запустить векторизацию данных без эмбеддингов"
        >
          {embeddingInitLoading ? 'Инициализация...' : 'Инициализировать эмбеддинги'}
        </button>
        <div className="chat-header"><h1>RAG Chatbot</h1></div>

        <div className="mode-switch">
          <label>
            <input
              type="radio"
              name="mode"
              value="PLAIN"
              checked={mode === 'PLAIN'}
              onChange={() => handleModeChange('PLAIN')}
            />
            PLAIN
          </label>
          <label>
            <input
              type="radio"
              name="mode"
              value="RAG"
              checked={mode === 'RAG'}
              onChange={() => handleModeChange('RAG')}
            />
            RAG
          </label>
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
