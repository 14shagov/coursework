// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import RagProgress from './RagProgress'

describe('RagProgress', () => {
  it('renders the search state as a standalone progress panel', () => {
    const markup = renderToStaticMarkup(
      <RagProgress
        steps={{ embedding: { status: 'done', label: 'Эмбеддим запрос…' } }}
        notice="Найдено чанков: 5"
        onDismiss={() => {}}
      />,
    )

    expect(markup).toContain('class="rag-progress"')
    expect(markup).toContain('Поиск по базе знаний')
    expect(markup).toContain('Найдено чанков: 5')
  })
})
