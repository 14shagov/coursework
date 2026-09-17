import { useEffect, useRef } from 'react'

const MAX_COMPOSER_HEIGHT = 176

function resizeTextarea(textarea) {
  if (!textarea) return
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_COMPOSER_HEIGHT)}px`
}

export default function ChatComposer({ value, onChange, onSubmit, onCancel, disabled, isStreaming, modelControl }) {
  const textareaRef = useRef(null)
  const formRef = useRef(null)

  useEffect(() => {
    resizeTextarea(textareaRef.current)
  }, [value])

  const handleKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    formRef.current?.requestSubmit()
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="input-row">
      <label className="sr-only" htmlFor="chat-composer">Сообщение</label>
      <textarea
        ref={textareaRef}
        id="chat-composer"
        name="message"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onInput={(event) => resizeTextarea(event.currentTarget)}
        onKeyDown={handleKeyDown}
        placeholder="Напишите сообщение…"
        autoComplete="off"
        rows={1}
        disabled={disabled}
      />
      {isStreaming ? (
        <button type="button" onClick={onCancel} title="Остановить ответ" className="stop-button" aria-label="Остановить ответ">
          <span />
        </button>
      ) : (
        <button type="submit" disabled={disabled || !value.trim()} title="Отправить" className="send-button" aria-label="Отправить сообщение">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      )}
      <div className="composer-footer">
        <p className="composer-hint">Enter — отправить · Shift+Enter — новая строка</p>
        {modelControl}
      </div>
    </form>
  )
}
