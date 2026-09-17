import { useEffect, useRef, useState } from 'react'

function Highlight({ value }) {
  const parts = String(value || '').split(/(<em>|<\/em>)/g)
  let marked = false
  return parts.map((part, index) => {
    if (part === '<em>') { marked = true; return null }
    if (part === '</em>') { marked = false; return null }
    return marked ? <mark key={index}>{part}</mark> : part
  })
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  )
}

function OpenSidebarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M9 4v16" />
    </svg>
  )
}

export default function Sidebar({ conversations, activeId, onSelect, onRename, onDelete, onSearch, onNewChat, onLogout, loading, collapsed, onToggleCollapse }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searchError, setSearchError] = useState('')
  const [searchStatus, setSearchStatus] = useState('idle')
  const [editingId, setEditingId] = useState(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [focusSearch, setFocusSearch] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const searchInputRef = useRef(null)
  const renameInFlightRef = useRef(false)

  useEffect(() => {
    if (!collapsed && focusSearch) {
      searchInputRef.current?.focus()
      setFocusSearch(false)
    }
  }, [collapsed, focusSearch])

  useEffect(() => {
    if (menuOpenId == null) return undefined
    const closeMenu = (event) => {
      if (!event.target.closest('.sidebar-item-actions')) setMenuOpenId(null)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMenuOpenId(null)
    }
    document.addEventListener('pointerdown', closeMenu)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeMenu)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpenId])

  useEffect(() => {
    const text = query.trim()
    if (text.length < 2) {
      setResults([])
      setSearchError('')
      setSearchStatus('idle')
      return undefined
    }
    let cancelled = false
    setSearchError('')
    setSearchStatus('loading')
    const timer = setTimeout(async () => {
      try {
        const response = await onSearch(text)
        if (cancelled) return
        setResults(Array.isArray(response) ? response : [])
        setSearchError('')
        setSearchStatus('ready')
      } catch (error) {
        if (cancelled) return
        setResults([])
        setSearchError('Поиск временно недоступен')
        setSearchStatus('error')
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, onSearch])

  const beginRename = (event, conversation) => {
    event.stopPropagation()
    setEditingId(conversation.id)
    setDraftTitle(conversation.title || '')
    setMenuOpenId(null)
  }

  const requestDeleteConversation = (event, conversation) => {
    event.stopPropagation()
    setMenuOpenId(null)
    setPendingDelete(conversation)
  }

  const confirmDeleteConversation = async () => {
    if (!pendingDelete || deleting) return
    setDeleting(true)
    try {
      await onDelete(pendingDelete.id)
      setPendingDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  const commitRename = async (conversation) => {
    if (renameInFlightRef.current) return
    const title = draftTitle.trim()
    if (!title) {
      setEditingId(null)
      return
    }
    renameInFlightRef.current = true
    try {
      await onRename(conversation.id, title)
      setEditingId(null)
    } catch (_) {
      // Parent already presents request error; keep input open for correction/retry.
    } finally {
      renameInFlightRef.current = false
    }
  }

  const isSearchReady = searchStatus === 'ready'
  const queryText = query.trim()
  const hasSearchQuery = queryText.length > 0
  const isSearchLoading = searchStatus === 'loading'
  const displayed = hasSearchQuery ? (isSearchReady ? results : []) : conversations
  const clearSearch = () => {
    setQuery('')
    searchInputRef.current?.focus()
  }
  const searchMessage = !hasSearchQuery
    ? 'Поиск по названиям и сообщениям'
    : queryText.length < 2
      ? 'Введите ещё символ для поиска'
      : isSearchLoading
        ? 'Ищем по истории чатов…'
        : isSearchReady
          ? results.length === 1 ? 'Найден 1 результат' : `Найдено: ${results.length}`
          : ''
  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="sidebar-header">
        {collapsed && onToggleCollapse && (
          <button className="sidebar-collapse-btn" onClick={onToggleCollapse} title="Открыть историю чатов" aria-label="Открыть историю чатов">
            <OpenSidebarIcon />
          </button>
        )}
        <button className="btn-new-chat" onClick={onNewChat} disabled={loading} title={collapsed ? 'Новый чат' : undefined}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {!collapsed && <span>Новый чат</span>}
        </button>
        {!collapsed && onToggleCollapse && (
          <button className="sidebar-collapse-btn" onClick={onToggleCollapse} title="Свернуть историю чатов" aria-label="Свернуть историю чатов">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}
        {collapsed && onToggleCollapse && (
          <button className="sidebar-collapse-btn" onClick={() => { setFocusSearch(true); onToggleCollapse() }} title="Поиск" aria-label="Поиск"><SearchIcon /></button>
        )}
      </div>

      {!collapsed && (
        <div className={`sidebar-search ${hasSearchQuery ? 'sidebar-search-active' : ''}`}>
          <div className="sidebar-search-field">
            <SearchIcon />
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && hasSearchQuery) clearSearch()
              }}
              placeholder="Найти чат или сообщение"
              aria-label="Поиск по чатам и сообщениям"
              aria-describedby="sidebar-search-hint"
              aria-busy={isSearchLoading}
            />
            {isSearchLoading && <span className="spinner-small sidebar-search-state" aria-label="Идёт поиск" />}
            {!isSearchLoading && hasSearchQuery && (
              <button className="sidebar-search-clear" type="button" onClick={clearSearch} aria-label="Очистить поиск" title="Очистить поиск">×</button>
            )}
          </div>
          <div className="sidebar-search-hint" id="sidebar-search-hint" role="status">{searchMessage}</div>
        </div>
      )}

      {collapsed ? <div className="sidebar-collapsed-spacer" aria-hidden="true" /> : (
      <nav className="sidebar-list">
        {hasSearchQuery && !searchError && (
          <div className="sidebar-search-results-label">
            <span>{isSearchLoading ? 'Поиск' : 'Результаты'}</span>
            {isSearchReady && <span>{results.length}</span>}
          </div>
        )}
        {searchError && <div className="sidebar-empty">{searchError}</div>}
        {displayed.length === 0 && !searchError && (!hasSearchQuery || isSearchReady) && (
          <div className={`sidebar-empty ${hasSearchQuery ? 'sidebar-empty-search' : ''}`}>
            {hasSearchQuery
              ? (isSearchReady ? <>Ничего не найдено<span>Попробуйте другое слово или фразу</span></> : null)
              : 'Нет чатов'}
          </div>
        )}
        {displayed.map((conv) => {
          const id = conv.conversationId || conv.id
          const isResult = Boolean(conv.conversationId)
          const mode = (conv.mode || 'PLAIN').toUpperCase()
          const modeLabel = mode === 'RAG' ? 'Поиск по базе знаний' : 'Свободный чат'
          const date = conv.lastMessageAt || conv.createdAt
          return <div key={id} className={`sidebar-item ${id === activeId ? 'sidebar-item-active' : ''}`}>
            <button className="sidebar-item-main" onClick={() => { setMenuOpenId(null); onSelect(conv) }} disabled={loading}>
              <>
                <div className="sidebar-item-info">
                  {editingId === id ? (
                    <input className="sidebar-title-input" value={draftTitle} autoFocus onClick={(event) => event.stopPropagation()} onChange={(event) => setDraftTitle(event.target.value)} onKeyDown={(event) => {
                      if (event.key === 'Enter') commitRename({ id })
                      if (event.key === 'Escape') setEditingId(null)
                    }} onBlur={() => commitRename({ id })} />
                  ) : <span className="sidebar-item-title"><Highlight value={conv.title || 'Без названия'} /></span>}
                  {isResult ? <span className="sidebar-search-snippet"><span>{conv.matchedIn === 'TITLE' ? 'В названии' : 'В сообщении: '}</span><Highlight value={conv.snippet} /></span> : <div className="sidebar-item-meta">
                    <span className="sidebar-item-date">{date ? new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : ''}</span>
                    <span className={`mode-badge mode-badge-${mode.toLowerCase()}`} title={modeLabel} aria-label={modeLabel}><span className="mode-badge-dot" aria-hidden="true" /><span>{mode}</span></span>
                  </div>}
                </div>
              </>
            </button>
            {!isResult && editingId !== id && (
              <div className="sidebar-item-actions">
                <button
                  className="sidebar-more"
                  type="button"
                  onClick={(event) => { event.stopPropagation(); setMenuOpenId((current) => current === id ? null : id) }}
                  title="Действия с чатом"
                  aria-label="Действия с чатом"
                  aria-expanded={menuOpenId === id}
                ><span className="sidebar-more-glyph" aria-hidden="true">…</span></button>
                {menuOpenId === id && (
                  <div className="sidebar-action-menu" role="menu" aria-label="Действия с чатом">
                    <button type="button" role="menuitem" onClick={(event) => beginRename(event, conv)}>Переименовать</button>
                    <button type="button" role="menuitem" className="sidebar-action-delete" onClick={(event) => requestDeleteConversation(event, conv)}>Удалить</button>
                  </div>
                )}
              </div>
            )}
          </div>
        })}
      </nav>
      )}

      <div className="sidebar-footer">
        <button className="sidebar-logout" onClick={onLogout} title="Выйти">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          {!collapsed && 'Выйти'}
        </button>
      </div>
      {pendingDelete && (
        <div className="confirmation-backdrop" role="presentation" onClick={() => !deleting && setPendingDelete(null)}>
          <section className="confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-conversation-title" onClick={(event) => event.stopPropagation()}>
            <div className="confirmation-dialog-icon" aria-hidden="true">!</div>
            <h2 id="delete-conversation-title">Удалить чат?</h2>
            <p>«{pendingDelete.title || 'Без названия'}» и все его сообщения будут удалены без возможности восстановления.</p>
            <div className="confirmation-dialog-actions">
              <button type="button" className="confirmation-cancel" onClick={() => setPendingDelete(null)} disabled={deleting}>Отмена</button>
              <button type="button" className="confirmation-delete" onClick={confirmDeleteConversation} disabled={deleting}>{deleting ? 'Удаляем…' : 'Удалить'}</button>
            </div>
          </section>
        </div>
      )}
    </aside>
  )
}
