import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  createConversation,
  listChatModels,
  listConversations,
  getConversation,
  getMessages,
  getEmbeddingJob,
  startEmbeddingJob,
  startMessageStreaming,
  updateConversationModel,
  updateConversationTitle,
  deleteConversation,
  searchConversations,
  startSearchReindex,
  getSearchReindex,
} from '../api/chat'
import MessageBubble from '../components/MessageBubble'
import ChatComposer from '../components/ChatComposer'
import RagProgress from '../components/RagProgress'
import Sidebar from '../components/Sidebar'

let localMessageSequence = 0

const MODEL_DETAILS = {
  'DeepSeek-V4-Flash': {
    name: 'DeepSeek V4 Flash',
    description: 'Быстрые ответы и рассуждения',
    provider: 'DeepSeek',
  },
  'DeepSeek-V4-Pro': {
    name: 'DeepSeek V4 Pro',
    description: 'Больше времени на сложные задачи',
    provider: 'DeepSeek',
  },
  'glm-4.5-air': {
    name: 'GLM 4.5 Air',
    description: 'Сбалансированная reasoning-модель',
    provider: 'GLM',
  },
  'Qwen3.6-35B-A3B': {
    name: 'Qwen 3.6 35B',
    description: 'Универсальная reasoning-модель',
    provider: 'Qwen',
  },
  'step-3.7-flash': {
    name: 'Step 3.7 Flash',
    description: 'Быстрый режим с рассуждениями',
    provider: 'Step',
  },
}

function getModelDetails(modelId) {
  return MODEL_DETAILS[modelId] || {
    name: modelId || 'Выберите модель',
    description: 'Модель для ответов в этом чате',
    provider: 'LLM',
  }
}

function ModelGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a4 4 0 0 0-4 4v1a4 4 0 0 0-2 3.46V13a4 4 0 0 0 2 3.46V17a4 4 0 0 0 4 4" />
      <path d="M12 3a4 4 0 0 1 4 4v1a4 4 0 0 1 2 3.46V13a4 4 0 0 1-2 3.46V17a4 4 0 0 1-4 4" />
      <path d="M9 12h6M12 9v6" />
    </svg>
  )
}

function ModelPicker({ modelId, models, onChange, disabled, variant = 'setup' }) {
  const [open, setOpen] = useState(false)
  const pickerRef = useRef(null)
  const details = getModelDetails(modelId)

  useEffect(() => {
    if (!open) return undefined
    const closeOnOutsidePress = (event) => {
      if (!pickerRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePress)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div ref={pickerRef} className={`model-picker model-picker-${variant}`}>
      <button type="button" className="model-picker-trigger" onClick={() => setOpen((value) => !value)} disabled={disabled || models.length === 0} aria-haspopup="listbox" aria-expanded={open}>
        <span className="model-picker-name">{details.name}</span>
        <span className="model-picker-chevron" aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="model-picker-menu" role="listbox" aria-label="Выбор модели">
          {models.map((model) => {
            const option = getModelDetails(model.id)
            const selected = model.id === modelId
            return <button key={model.id} type="button" role="option" aria-selected={selected} className={`model-picker-option ${selected ? 'model-picker-option-selected' : ''}`} onClick={() => { onChange({ target: { value: model.id } }); setOpen(false) }}>
              <span className="model-picker-option-name">{option.name}</span>
              <span className="model-picker-option-description">{option.description}</span>
              {selected && <span className="model-picker-check" aria-label="Выбрано">✓</span>}
            </button>
          })}
        </div>
      )}
    </div>
  )
}

function ModelSelector({ modelId, models, onChange, disabled, saving, variant = 'chat' }) {
  const details = getModelDetails(modelId)
  const isSetup = variant === 'setup'

  if (variant === 'composer') {
    return (
      <div className="composer-model-selector">
        <ModelPicker variant="composer" modelId={modelId} models={models} onChange={onChange} disabled={disabled} />
        {saving && <span className="composer-model-saving" role="status">Сохраняем…</span>}
      </div>
    )
  }

  return (
    <div className={`model-selector model-selector-${variant}`}>
      <div className="model-selector-icon"><ModelGlyph /></div>
      <div className="model-selector-copy">
        <span className="model-selector-label">{isSetup ? 'Модель для ответов' : 'Модель ответа'}</span>
        <span className="model-selector-name">{details.name}</span>
        {isSetup && <span className="model-selector-description">{details.description}</span>}
      </div>
      <div className="model-selector-actions">
        <ModelPicker variant={isSetup ? 'setup' : 'chat'} modelId={modelId} models={models} onChange={onChange} disabled={disabled} />
        <span className="reasoning-badge"><span className="reasoning-badge-dot" />Reasoning</span>
      </div>
      {saving && <span className="model-selector-saving" role="status">Сохраняем…</span>}
    </div>
  )
}

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

export function shouldScrollLoadedConversationToBottom(scrollTargetId, conversationId) {
  return scrollTargetId != null && String(scrollTargetId) === String(conversationId)
}

export function isLatestConversationLoad(loadRequestId, currentLoadRequestId) {
  return loadRequestId === currentLoadRequestId
}

function createRagStepStates() {
  return {
    embedding: { status: 'pending', label: 'Эмбеддим запрос…' },
    search: { status: 'pending', label: 'Ищем похожие фрагменты…' },
    generation: { status: 'pending', label: 'Формируем ответ…' },
  }
}

function ChatLayout({
  conversations,
  activeId,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  onSearchConversations,
  onNewChat,
  onLogout,
  loading,
  sidebarCollapsed,
  onToggleSidebarCollapse,
  sidebarMobileOpen,
  onToggleSidebarMobile,
  children,
}) {
  const sidebarProps = {
    conversations,
    activeId,
    onSelect: onSelectConversation,
    onRename: onRenameConversation,
    onDelete: onDeleteConversation,
    onSearch: onSearchConversations,
    onNewChat,
    onLogout,
    loading,
  }

  return (
    <div className={`app-layout ${sidebarMobileOpen ? 'sidebar-mobile-panel-open' : ''}`}>
      <div className={`sidebar-desktop ${sidebarCollapsed ? 'sidebar-desktop-collapsed' : ''}`}>
        <Sidebar
          {...sidebarProps}
          collapsed={sidebarCollapsed}
          onToggleCollapse={onToggleSidebarCollapse}
        />
      </div>

      {sidebarMobileOpen && (
        <>
          <div className="sidebar-overlay sidebar-overlay-visible" onClick={onToggleSidebarMobile} />
          <div className="sidebar-mobile-panel">
            <Sidebar {...sidebarProps} />
          </div>
        </>
      )}

      <div className="main-area">{children}</div>
    </div>
  )
}

export default function ChatPage({ onLogout }) {
  const [conversationId, setConversationId] = useState(null)
  const [conversationMode, setConversationMode] = useState('PLAIN')
  const [chatModels, setChatModels] = useState([])
  const [selectedLlmModel, setSelectedLlmModel] = useState('')
  const [modelChangeLoading, setModelChangeLoading] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [embeddingInitLoading, setEmbeddingInitLoading] = useState(false)
  const [embeddingJob, setEmbeddingJob] = useState(null)
  const [ragStepStates, setRagStepStates] = useState(null)
  const [ragNotice, setRagNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showModeSelect, setShowModeSelect] = useState(false)
  const [conversations, setConversations] = useState([])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false)
  const [streamingAssistantId, setStreamingAssistantId] = useState(null)
  const [highlightedMessageId, setHighlightedMessageId] = useState(null)
  const [searchReindexJob, setSearchReindexJob] = useState(null)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'))
  const messagesContainerRef = useRef(null)
  const autoFollowRef = useRef(true)
  const initialScrollToBottomRef = useRef(null)
  const conversationLoadRequestRef = useRef(0)
  const scrollFrameRef = useRef(null)
  const ragProgressDismissedRef = useRef(false)
  const streamCancelRef = useRef(null)
  const streamCancelledRef = useRef(false)
  const embeddingJobTimerRef = useRef(null)
  const searchReindexTimerRef = useRef(null)
  const titleRefreshTimersRef = useRef([])

  const clearRagProgress = () => {
    ragProgressDismissedRef.current = false
    setRagStepStates(null)
    setRagNotice('')
  }

  const dismissRagProgress = () => {
    ragProgressDismissedRef.current = true
    setRagStepStates(null)
    setRagNotice('')
  }

  const persistConversation = (id, mode) => {
    setConversationId(id)
    setConversationMode(mode)
    localStorage.setItem('conversationId', String(id))
  }

  const defaultChatModel = (models) => models.find((model) => model.defaultModel)?.id || models[0]?.id || ''

  const loadChatModels = async () => {
    const models = await listChatModels()
    const availableModels = Array.isArray(models) ? models : []
    setChatModels(availableModels)
    setSelectedLlmModel((current) => current || defaultChatModel(availableModels))
    return availableModels
  }

  const scrollToBottom = (behavior = 'smooth') => {
    const container = messagesContainerRef.current
    if (container) {
      if (behavior === 'instant') {
        container.scrollTop = container.scrollHeight
        return
      }
      container.scrollTo({ top: container.scrollHeight, behavior })
      return
    }
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
    setShowScrollToBottom(!autoFollowRef.current)
  }

  useLayoutEffect(() => {
    if (!shouldScrollLoadedConversationToBottom(initialScrollToBottomRef.current, conversationId)) return
    initialScrollToBottomRef.current = null
    scrollToBottom('instant')
  }, [conversationId, messages])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
  }, [theme])

  const loadConversation = async (conv) => {
    const loadRequestId = conversationLoadRequestRef.current + 1
    conversationLoadRequestRef.current = loadRequestId
    setLoading(true)
    setError('')
    clearRagProgress()
    autoFollowRef.current = true
    setShowScrollToBottom(false)
    initialScrollToBottomRef.current = null
    setMessages([])
    try {
      const targetId = conv.conversationId || conv.id
      persistConversation(targetId, conv.mode || 'PLAIN')
      const convData = await getConversation(targetId)
      if (!isLatestConversationLoad(loadRequestId, conversationLoadRequestRef.current)) return
      setConversationMode(convData?.mode || conv.mode || 'PLAIN')
      setSelectedLlmModel(convData?.llmModel || defaultChatModel(chatModels))
      const history = await getMessages(targetId)
      if (!isLatestConversationLoad(loadRequestId, conversationLoadRequestRef.current)) return
      if (conv.matchedMessageId) {
        setHighlightedMessageId(conv.matchedMessageId)
        setTimeout(() => {
          if (isLatestConversationLoad(loadRequestId, conversationLoadRequestRef.current)) {
            document.getElementById(`message-${conv.matchedMessageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }, 100)
      } else {
        setHighlightedMessageId(null)
        initialScrollToBottomRef.current = targetId
      }
      setMessages(Array.isArray(history) ? history : [])
      setShowModeSelect(false)
      setSidebarMobileOpen(false)
    } catch (e) {
      if (!isLatestConversationLoad(loadRequestId, conversationLoadRequestRef.current)) return
      console.error('[chat] load:error', e)
      setError('Ошибка загрузки: ' + e.message)
    } finally {
      if (isLatestConversationLoad(loadRequestId, conversationLoadRequestRef.current)) setLoading(false)
    }
  }

  const refreshConversations = async () => {
    try {
      const list = await listConversations()
      setConversations(Array.isArray(list) ? list : [])
    } catch (_) {}
  }

  const refreshPendingTitles = () => {
    titleRefreshTimersRef.current.forEach(clearTimeout)
    titleRefreshTimersRef.current = [1000, 3000, 6000].map((delay) => setTimeout(refreshConversations, delay))
  }

  useEffect(() => {
    const savedId = localStorage.getItem('conversationId')
    async function init() {
      const loadRequestId = conversationLoadRequestRef.current + 1
      conversationLoadRequestRef.current = loadRequestId
      setLoading(true)
      setError('')
      try {
        const models = await loadChatModels()
        await refreshConversations()
        if (savedId) {
          const convData = await getConversation(savedId)
          if (!isLatestConversationLoad(loadRequestId, conversationLoadRequestRef.current)) return
          persistConversation(Number(savedId), convData?.mode || 'PLAIN')
          setSelectedLlmModel(convData?.llmModel || defaultChatModel(models))
          const history = await getMessages(savedId)
          if (!isLatestConversationLoad(loadRequestId, conversationLoadRequestRef.current)) return
          initialScrollToBottomRef.current = savedId
          setMessages(Array.isArray(history) ? history : [])
        } else {
          setShowModeSelect(true)
        }
      } catch (e) {
        if (!isLatestConversationLoad(loadRequestId, conversationLoadRequestRef.current)) return
        console.error('[chat] init:error', e)
        localStorage.removeItem('conversationId')
        setConversationId(null)
        setConversationMode('PLAIN')
        setShowModeSelect(true)
        setError('Ошибка загрузки чата: ' + e.message)
      } finally {
        if (isLatestConversationLoad(loadRequestId, conversationLoadRequestRef.current)) setLoading(false)
      }
    }

    init()
  }, [])

  useEffect(() => () => {
    streamCancelRef.current?.()
    clearTimeout(embeddingJobTimerRef.current)
    clearTimeout(searchReindexTimerRef.current)
    titleRefreshTimersRef.current.forEach(clearTimeout)
    if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current)
  }, [])

  useEffect(() => {
    if (streamingAssistantId) scheduleScrollToBottom()
  }, [messages, streamingAssistantId])

  const handleCreateConversation = async (mode) => {
    conversationLoadRequestRef.current += 1
    initialScrollToBottomRef.current = null
    setLoading(true)
    setError('')
    try {
      const created = await createConversation(mode, selectedLlmModel)
      persistConversation(created.id, created?.mode || mode)
      setSelectedLlmModel(created?.llmModel || selectedLlmModel)
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
    setShowScrollToBottom(false)
    streamCancelledRef.current = false
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
                const base = prev || createRagStepStates()
                return {
                  ...base,
                  [chunk.step]: {
                    ...base[chunk.step],
                    status: chunk.status === 'start' ? 'active' : 'done',
                  },
                }
              })
            } else if (chunk.type === 'rag_search') {
              if (!ragProgressDismissedRef.current) setRagNotice('Найдено чанков: ' + (chunk.foundChunks ?? '?'))
            } else if (chunk.type === 'thinking') {
              if (typeof chunk.thinking !== 'string' || chunk.thinking === '') return
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
              if (conversationMode === 'RAG' && !ragProgressDismissedRef.current) {
                setRagStepStates((prev) => {
                  const base = prev || createRagStepStates()
                  return {
                    embedding:   { ...base.embedding, status: 'done' },
                    search:      { ...base.search, status: 'done' },
                    generation:  { ...base.generation, status: 'done' },
                  }
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
      if (e?.name === 'AbortError' && streamCancelledRef.current) {
        setMessages((prev) => prev.map((message) => message.id === assistantId ? { ...message, isStreaming: false, wasCancelled: true } : message))
      } else {
        setMessages((prev) => prev.filter((message) => message.id !== assistantId))
        setError('Ошибка отправки: ' + e.message)
        clearRagProgress()
      }
      setStreamingAssistantId(null)
    } finally {
      refreshPendingTitles()
      streamCancelRef.current = null
      setLoading(false)
    }
  }

  const onStopStreaming = () => {
    if (!streamCancelRef.current) return
    streamCancelledRef.current = true
    streamCancelRef.current()
  }

  const onNewChat = () => {
    conversationLoadRequestRef.current += 1
    initialScrollToBottomRef.current = null
    clearRagProgress()
    autoFollowRef.current = true
    setShowModeSelect(true)
    setMessages([])
    setConversationId(null)
    setConversationMode('PLAIN')
    setSelectedLlmModel(defaultChatModel(chatModels))
    localStorage.removeItem('conversationId')
    setSidebarMobileOpen(false)
  }

  const onRenameConversation = async (id, title) => {
    try {
      await updateConversationTitle(id, title)
      await refreshConversations()
    } catch (e) {
      setError('Ошибка переименования: ' + e.message)
      throw e
    }
  }

  const onDeleteConversation = async (id) => {
    try {
      await deleteConversation(id)
      if (Number(id) === Number(conversationId)) onNewChat()
      await refreshConversations()
    } catch (e) {
      setError('Ошибка удаления: ' + e.message)
      throw e
    }
  }

  const onSearchConversations = useCallback((query) => searchConversations(query), [])

  const onStartSearchReindex = async () => {
    try {
      const job = await startSearchReindex()
      setSearchReindexJob(job)
      const poll = async () => {
        try {
          const current = await getSearchReindex(job.id)
          setSearchReindexJob(current)
          if (current.status === 'QUEUED' || current.status === 'PENDING' || current.status === 'RUNNING') {
            searchReindexTimerRef.current = setTimeout(poll, 1000)
          }
        } catch (e) {
          setError('Ошибка переиндексации: ' + e.message)
        }
      }
      searchReindexTimerRef.current = setTimeout(poll, 500)
    } catch (e) {
      setError('Ошибка запуска переиндексации: ' + e.message)
    }
  }

  const onChangeChatModel = async (event) => {
    const llmModel = event.target.value
    if (conversationId == null) {
      setSelectedLlmModel(llmModel)
      return
    }

    setModelChangeLoading(true)
    setError('')
    try {
      const updated = await updateConversationModel(conversationId, llmModel)
      setSelectedLlmModel(updated?.llmModel || llmModel)
    } catch (e) {
      setError('Ошибка смены модели: ' + e.message)
    } finally {
      setModelChangeLoading(false)
    }
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
      <ChatLayout
        conversations={conversations}
        activeId={conversationId}
        onSelectConversation={loadConversation}
        onRenameConversation={onRenameConversation}
        onDeleteConversation={onDeleteConversation}
        onSearchConversations={onSearchConversations}
        onNewChat={onNewChat}
        onLogout={onLogout}
        loading={loading}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebarCollapse={() => setSidebarCollapsed((v) => !v)}
        sidebarMobileOpen={sidebarMobileOpen}
        onToggleSidebarMobile={() => setSidebarMobileOpen(false)}
      >
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
              <p className="mode-select-subtitle">Сначала настройте модель, затем выберите режим работы.</p>
              <section className="model-choice-card" aria-label="Выбор модели">
                <div className="setup-step">Шаг 1</div>
                <ModelSelector
                  variant="setup"
                  modelId={selectedLlmModel}
                  models={chatModels}
                  onChange={onChangeChatModel}
                  disabled={loading}
                  saving={modelChangeLoading}
                />
                <p className="model-choice-hint">Thinking будет показан отдельным блоком в ответе. Модель можно сменить позже.</p>
              </section>
              <div className="setup-step setup-step-mode">Шаг 2 · Режим чата</div>
              <div className="mode-cards">
                <button className="mode-card" onClick={() => handleCreateConversation('PLAIN')} disabled={loading || !selectedLlmModel}>
                  <div className="mode-card-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M8 12h8M12 8v8" />
                    </svg>
                  </div>
                  <span className="mode-card-eyebrow">Свободный разговор</span>
                  <h3>PLAIN</h3>
                  <p>Ответы модели без поиска по вашим материалам</p>
                </button>
                <button className="mode-card" onClick={() => handleCreateConversation('RAG')} disabled={loading || !selectedLlmModel}>
                  <div className="mode-card-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
                      <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
                    </svg>
                  </div>
                  <span className="mode-card-eyebrow">Работа с материалами</span>
                  <h3>RAG</h3>
                  <p>Ищет контекст в базе знаний перед ответом</p>
                </button>
              </div>
              {loading && <div className="loading"><div className="spinner" /></div>}
              {error && <div className="error">{error}</div>}
            </div>
        </div>
      </ChatLayout>
    )
  }

  // ===== CHAT SCREEN =====
  return (
    <ChatLayout
      conversations={conversations}
      activeId={conversationId}
      onSelectConversation={loadConversation}
      onRenameConversation={onRenameConversation}
      onDeleteConversation={onDeleteConversation}
      onSearchConversations={onSearchConversations}
      onNewChat={onNewChat}
      onLogout={onLogout}
      loading={loading}
      sidebarCollapsed={sidebarCollapsed}
      onToggleSidebarCollapse={() => setSidebarCollapsed((v) => !v)}
      sidebarMobileOpen={sidebarMobileOpen}
      onToggleSidebarMobile={() => setSidebarMobileOpen((v) => !v)}
    >
      <div className="chat-container chat-container-chat">
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
              <span className={`mode-indicator mode-indicator-${conversationMode.toLowerCase()}`} title={conversationMode === 'RAG' ? 'Ответ строится с поиском по базе знаний' : 'Ответ без поиска по базе знаний'}>
                {conversationMode === 'RAG' && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
                    <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
                  </svg>
                )}
                {conversationMode === 'RAG' ? 'По базе знаний' : 'Свободный чат'}
              </span>
              <button className="theme-toggle" onClick={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')} title={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'} aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}>{theme === 'dark' ? '☀' : '☾'}</button>
              <div className="header-admin-actions" aria-label="Администрирование">
                <button className="embeddings-init-button" onClick={onInitEmbeddings} disabled={embeddingInitLoading} title="Инициализировать эмбеддинги" aria-label="Инициализировать эмбеддинги">{embeddingInitLoading ? '⏳' : '🧠'}</button>
                <button className="embeddings-init-button" onClick={onStartSearchReindex} title="Переиндексировать поиск" aria-label="Переиндексировать поиск">🔎</button>
              </div>
            </div>
          </div>

          <div className="rag-progress-region">
            <RagProgress steps={ragStepStates} notice={ragNotice} onDismiss={dismissRagProgress} />
          </div>

          <div className="messages" key={conversationId} ref={messagesContainerRef} onScroll={onMessagesScroll}>
            {messages.length === 0 && !loading && (
              <div className="messages-empty">
                <div>
                  <h2>{conversationMode === 'RAG' ? 'Спросите по вашим материалам' : 'Чем помочь?'}</h2>
                  <p>{conversationMode === 'RAG' ? 'Я найду релевантные фрагменты перед ответом.' : 'Задайте вопрос, попросите объяснить или написать текст.'}</p>
                  <div className="prompt-suggestions">
                    {(conversationMode === 'RAG'
                      ? ['Что известно об экзопланетах?', 'Найди главное по этой теме', 'Какие источники использованы?']
                      : ['Объясни сложную тему простыми словами', 'Составь краткий план', 'Помоги сравнить варианты']
                    ).map((prompt) => <button type="button" key={prompt} onClick={() => setInput(prompt)}>{prompt}</button>)}
                  </div>
                </div>
              </div>
            )}
            {messages.map((msg, idx) => (
              <MessageBubble
                key={msg.id || idx}
                messageId={msg.id}
                highlighted={msg.id === highlightedMessageId}
                role={msg.role}
                content={msg.content}
                thinking={msg.thinking}
                isStreaming={msg.isStreaming}
                wasCancelled={msg.wasCancelled}
                streamingStatus={
                  msg.isStreaming && !msg.content && conversationMode === 'PLAIN'
                    ? 'Формирую ответ…'
                    : ''
                }
              />
            ))}
            {loading && !streamingAssistantId && messages.length === 0 && (
              <div className="message assistant">
                <div className="bubble bubble-assistant">
                  <div className="spinner" />
                </div>
              </div>
            )}
          </div>

          {showScrollToBottom && (
            <button type="button" className="scroll-to-bottom" onClick={() => { autoFollowRef.current = true; setShowScrollToBottom(false); scrollToBottom() }} title="К последнему сообщению" aria-label="К последнему сообщению">
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v13" />
                <path d="m6.5 13 5.5 5.5 5.5-5.5" />
              </svg>
            </button>
          )}

          {error && <div className="error">{error}</div>}
          {embeddingJob && (
            <div className="embedding-job-status">
              Эмбеддинги: {embeddingJob.status.toLowerCase()} — {embeddingJob.processedChunks + embeddingJob.skippedChunks + embeddingJob.failedChunks}/{embeddingJob.totalChunks}
              {embeddingJob.failedChunks > 0 && `, ошибок: ${embeddingJob.failedChunks}`}
              {embeddingJob.errorMessage && ` — ${embeddingJob.errorMessage}`}
            </div>
          )}
          {searchReindexJob && (
            <div className="embedding-job-status">
              Поиск: {searchReindexJob.status.toLowerCase()} — {searchReindexJob.processedDocuments}/{searchReindexJob.totalDocuments}
              {searchReindexJob.errorMessage && ` — ${searchReindexJob.errorMessage}`}
            </div>
          )}
          <ChatComposer
            value={input}
            onChange={setInput}
            onSubmit={onSubmit}
            onCancel={onStopStreaming}
            disabled={loading && !streamingAssistantId}
            isStreaming={Boolean(streamingAssistantId)}
            modelControl={<ModelSelector variant="composer" modelId={selectedLlmModel} models={chatModels} onChange={onChangeChatModel} disabled={loading} saving={modelChangeLoading} />}
          />
      </div>
    </ChatLayout>
  )
}
