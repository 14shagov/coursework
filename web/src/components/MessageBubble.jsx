import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function MessageBubble({ role, content, thinking, isStreaming }) {
  const isUser = role === 'USER'
  const [thinkingExpanded, setThinkingExpanded] = useState(false)
  const thinkingContentRef = useRef(null)

  // Auto-expand thinking once we actually have thinking text or during streaming.
  useEffect(() => {
    if (isStreaming || (thinking && thinking.length > 0)) {
      setThinkingExpanded(true)
    }
  }, [thinking, isStreaming])

  // Auto-scroll thinking while it is streaming/appending.
  useEffect(() => {
    if (isStreaming && thinkingContentRef.current) {
      thinkingContentRef.current.scrollTop = thinkingContentRef.current.scrollHeight
    }
  }, [thinking, isStreaming])

  const showThinking = isStreaming || (thinking && thinking.length > 0)

  if (isUser) {
    return (
      <div className="message message-user">
        <div className="bubble bubble-user">
          <div className="bubble-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="message message-assistant">
      {!isUser && <div className="bubble-role">Assistant</div>}

      {showThinking && (
        <div className="thinking-block">
          <button
            className="thinking-toggle"
            onClick={() => setThinkingExpanded((v) => !v)}
            aria-expanded={thinkingExpanded}
            disabled={isStreaming}
          >
            <svg className="thinking-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d={thinkingExpanded ? 'M3 4.5L6 7.5L9 4.5' : 'M4.5 3L7.5 6L4.5 9'}
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="thinking-label">
              {isStreaming ? 'Анализирую...' : thinkingExpanded ? 'Скрыть рассуждения' : 'Рассуждения'}
            </span>
          </button>
          <div
            className={`thinking-content ${thinkingExpanded ? 'thinking-content-open' : ''} ${isStreaming ? 'thinking-content-streaming' : ''}`}
            ref={thinkingContentRef}
          >
            <div className="bubble-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{thinking || ''}</ReactMarkdown>
              {isStreaming && <span className="thinking-typing-cursor" />}
            </div>
          </div>
        </div>
      )}

      <div className={`bubble ${isUser ? 'bubble-user' : 'bubble-assistant'}`}>
        <div className="bubble-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      </div>
    </div>
  )
}
