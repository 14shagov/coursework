// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Sidebar from './Sidebar'

describe('Sidebar', () => {
  const props = {
    conversations: [],
    activeId: null,
    onSelect: () => {},
    onRename: () => {},
    onDelete: () => {},
    onSearch: () => [],
    onNewChat: () => {},
    onLogout: () => {},
    onToggleCollapse: () => {},
    loading: false,
  }

  it('puts the sidebar opener before the new-chat action when collapsed', () => {
    const markup = renderToStaticMarkup(<Sidebar {...props} collapsed />)

    expect(markup.indexOf('Открыть историю чатов')).toBeLessThan(markup.indexOf('Новый чат'))
  })

  it('keeps the chat mode in the lower metadata row and exposes a contextual actions button', () => {
    const markup = renderToStaticMarkup(
      <Sidebar
        {...props}
        conversations={[{ id: 1, title: 'Венера', mode: 'RAG', createdAt: '2026-09-17T12:00:00Z' }]}
      />,
    )

    expect(markup).toContain('sidebar-item-meta')
    expect(markup).toContain('mode-badge-dot')
    expect(markup).toContain('sidebar-more')
  })
})
