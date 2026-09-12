export default function Sidebar({ conversations, activeId, onSelect, onNewChat, onLogout, loading, className, collapsed, onToggleCollapse }) {
  return (
    <aside className={`sidebar ${className || ''} ${collapsed ? 'sidebar-collapsed' : ''}`}>
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
      </div>

      <nav className="sidebar-list">
        {conversations.length === 0 && !collapsed && (
          <div className="sidebar-empty">Нет чатов</div>
        )}
        {conversations.map((conv) => (
          <button
            key={conv.id}
            className={`sidebar-item ${conv.id === activeId ? 'sidebar-item-active' : ''}`}
            onClick={() => onSelect(conv)}
            title={collapsed ? (conv.title || 'Без названия') : undefined}
          >
            {!collapsed ? (
              <>
                <div className="sidebar-item-info">
                  <span className="sidebar-item-title">{conv.title || 'Без названия'}</span>
                  <span className="sidebar-item-date">
                    {conv.createdAt ? new Date(conv.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : ''}
                  </span>
                </div>
                <span className={`mode-badge mode-badge-${conv.mode?.toLowerCase() || 'plain'}`}>{conv.mode || 'PLAIN'}</span>
              </>
            ) : (
              <span className="sidebar-item-letter">{(conv.title || '?')[0]}</span>
            )}
          </button>
        ))}
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
