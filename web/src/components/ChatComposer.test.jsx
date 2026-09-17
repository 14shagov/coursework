// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ChatComposer from './ChatComposer'

describe('ChatComposer', () => {
  it('renders multiline input and send affordance', () => {
    const markup = renderToStaticMarkup(<ChatComposer value="Вопрос" onChange={() => {}} onSubmit={() => {}} onCancel={() => {}} />)

    expect(markup).toContain('<textarea')
    expect(markup).toContain('Enter — отправить')
    expect(markup).toContain('Отправить сообщение')
  })

  it('replaces send with stop during stream', () => {
    const markup = renderToStaticMarkup(<ChatComposer value="" onChange={() => {}} onSubmit={() => {}} onCancel={() => {}} isStreaming />)

    expect(markup).toContain('Остановить ответ')
    expect(markup).not.toContain('Отправить сообщение')
  })
})
