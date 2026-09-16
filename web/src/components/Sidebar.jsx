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

export default function Sidebar({ conversations, activeId, onSelect, onRename, onSearch, onNewChat, onLogout, loading, collapsed, onToggleCollapse }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searchError, setSearchError] = useState('')
  const [searchStatus, setSearchStatus] = useState('idle')
  const [editingId, setEditingId] = useState(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [focusSearch, setFocusSearch] = useState(false)
  const searchInputRef = useRef(null)
  const renameInFlightRef = useRef(false)

  useEffect(() => {
    if (!collapsed && focusSearch) {
      searchInputRef.current?.focus()
      setFocusSearch(false)
    }
  }, [collapsed, focusSearch])

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
  const displayed = query.trim().length >= 2 && isSearchReady ? results : conversations
  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="sidebar-header">
        <button className="btn-new-chat" onClick={onNewChat} disabled={loading} title={collapsed ? 'Новый чат' : undefined}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {!collapsed && <span>Новый чат</span>}
        </button>
        {onToggleCollapse && (
          <button className="sidebar-collapse-btn" onClick={onToggleCollapse} title={collapsed ? 'Развернуть' : 'Свернуть'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {collapsed ? (
                <polyline points="9 18 15 12 9 6" />
              ) : (
                <polyline points="15 18 9 12 15 6" />
              )}
            </svg>
          </button>
        )}
        {collapsed && onToggleCollapse && (
          <button className="sidebar-collapse-btn" onClick={() => { setFocusSearch(true); onToggleCollapse() }} title="Поиск" aria-label="Поиск">⌕</button>
        )}
      </div>

      {!collapsed && (
        <div className="sidebar-search">
          <input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по чатам" aria-label="Поиск по чатам" />
          {searchStatus === 'loading' && <span className="spinner-small sidebar-search-state" aria-label="Идёт поиск" />}
        </div>
      )}

      <nav className="sidebar-list">
        {searchError && <div className="sidebar-empty">{searchError}</div>}
        {displayed.length === 0 && !collapsed && !searchError && (
          <div className="sidebar-empty">{isSearchReady ? 'Ничего не найдено' : 'Нет чатов'}</div>
        )}
        {displayed.map((conv) => {
          const id = conv.conversationId || conv.id
          const isResult = Boolean(conv.conversationId)
          return <div key={id} className={`sidebar-item ${id === activeId ? 'sidebar-item-active' : ''}`}>
            <button className="sidebar-item-main" onClick={() => onSelect(conv)} disabled={loading} title={collapsed ? (conv.title || 'Без названия') : undefined}>
            {!collapsed ? (
              <>
                <div className="sidebar-item-info">
                  {editingId === id ? (
                    <input className="sidebar-title-input" value={draftTitle} autoFocus onClick={(event) => event.stopPropagation()} onChange={(event) => setDraftTitle(event.target.value)} onKeyDown={(event) => {
                      if (event.key === 'Enter') commitRename({ id })
                      if (event.key === 'Escape') setEditingId(null)
                    }} onBlur={() => commitRename({ id })} />
                  ) : <span className="sidebar-item-title"><Highlight value={conv.title || 'Без названия'} /></span>}
                  {isResult ? <span className="sidebar-search-snippet"><span>{conv.matchedIn === 'TITLE' ? 'В названии' : 'В сообщении: '}</span><Highlight value={conv.snippet} /></span> : <span className="sidebar-item-date">{conv.lastMessageAt || conv.createdAt ? new Date(conv.lastMessageAt || conv.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : ''}</span>}
                </div>
                {!isResult && <span className={`mode-badge mode-badge-${conv.mode?.toLowerCase() || 'plain'}`}>{conv.mode || 'PLAIN'}</span>}
              </>
            ) : (
              <span className="sidebar-item-letter">{(conv.title || '?')[0]}</span>
            )}
            </button>
            {!collapsed && !isResult && editingId !== id && <button className="sidebar-more" onClick={(event) => beginRename(event, conv)} title="Переименовать" aria-label="Переименовать">…</button>}
          </div>
        })}
      </nav>

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
    </aside>
  )
}
