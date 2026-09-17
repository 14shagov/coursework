// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import MessageBubble from './MessageBubble'

describe('MessageBubble thinking state', () => {
  it('does not render an empty thinking panel while content is streaming', () => {
    const markup = renderToStaticMarkup(
      <MessageBubble
        role="ASSISTANT"
        content=""
        thinking=""
        isStreaming
        streamingStatus="Формирую ответ…"
      />,
    )

    expect(markup).not.toContain('thinking-block')
    expect(markup).not.toContain('thinking-typing-cursor')
    expect(markup).toContain('Формирую ответ…')
  })

  it('renders provider reasoning only after it is present', () => {
    const markup = renderToStaticMarkup(
      <MessageBubble role="ASSISTANT" content="" thinking="Проверяю контекст." isStreaming />,
    )

    expect(markup).toContain('thinking-block')
    expect(markup).toContain('Мысли модели')
    expect(markup).toContain('Думаю…')
    expect(markup).toContain('Проверяю контекст.')
    expect(markup).toContain('thinking-typing-cursor')
  })

  it('keeps saved reasoning available in a collapsed scrollable card', () => {
    const markup = renderToStaticMarkup(
      <MessageBubble role="ASSISTANT" content="Ответ" thinking="Сохранённая мысль." isStreaming={false} />,
    )

    expect(markup).toContain('Мысли модели')
    expect(markup).toContain('Сохранённая мысль.')
    expect(markup).toContain('thinking-content')
    expect(markup).toContain('aria-expanded="false"')
  })

  it('does not show a RAG context summary below an assistant response', () => {
    const markup = renderToStaticMarkup(
      <MessageBubble
        role="ASSISTANT"
        content="Ответ"
        ragMeta={{ usedRag: true, usedContext: true, usedChunks: 5, foundChunks: 5 }}
        ragProgress={{ steps: { search: { status: 'active', label: 'Ищем похожие фрагменты…' } } }}
      />,
    )

    expect(markup).not.toContain('Использован контекст:')
    expect(markup).not.toContain('rag-progress')
  })
})
