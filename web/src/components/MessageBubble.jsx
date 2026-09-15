import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function MessageBubble({ role, content, thinking, isStreaming, streamingStatus }) {
  const isUser = role === 'USER'
  const [thinkingExpanded, setThinkingExpanded] = useState(false)
  const thinkingContentRef = useRef(null)
  const shouldAutoScrollRef = useRef(true)
  const hasThinking = typeof thinking === 'string' && thinking.trim().length > 0
  const hasContent = typeof content === 'string' && content.trim().length > 0

  // Live reasoning opens on its first chunk. Historical reasoning stays collapsed.
  useEffect(() => {
    if (isStreaming && hasThinking) {
      setThinkingExpanded(true)
    }
  }, [hasThinking, isStreaming])

  // Follow the stream only while the reader remains at the bottom.
  useEffect(() => {
    if (isStreaming && thinkingExpanded && shouldAutoScrollRef.current && thinkingContentRef.current) {
      thinkingContentRef.current.scrollTop = thinkingContentRef.current.scrollHeight
    }
  }, [thinking, isStreaming, thinkingExpanded])

  const handleThinkingScroll = () => {
    const element = thinkingContentRef.current
    if (!element) return
    shouldAutoScrollRef.current = element.scrollHeight - element.scrollTop - element.clientHeight <= 24
  }

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
      <div className="bubble-role">Assistant</div>

      {hasThinking && (
        <div className="thinking-block">
          <button
            className="thinking-toggle"
            onClick={() => setThinkingExpanded((v) => !v)}
            aria-expanded={thinkingExpanded}
          >
            <span className="thinking-heading">
              <svg className="thinking-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 18h6M10 22h4M8.3 14.6A6.5 6.5 0 1 1 15.7 14.6c-.86.62-1.38 1.57-1.48 2.4H9.78c-.1-.83-.62-1.78-1.48-2.4Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="thinking-label">Мысли модели</span>
              {isStreaming && <span className="thinking-live"><span className="thinking-live-dot" aria-hidden="true" />Думаю…</span>}
            </span>
            <svg className={`thinking-chevron ${thinkingExpanded ? 'thinking-chevron-open' : ''}`} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div
            className={`thinking-content ${thinkingExpanded ? 'thinking-content-open' : ''}`}
            ref={thinkingContentRef}
            onScroll={handleThinkingScroll}
            aria-hidden={!thinkingExpanded}
          >
            <div className="bubble-content thinking-scroll-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{thinking || ''}</ReactMarkdown>
              {isStreaming && hasThinking && <span className="thinking-typing-cursor" />}
            </div>
          </div>
        </div>
      )}

      {streamingStatus && (
        <div className="streaming-status" role="status">
          <span className="spinner-small" aria-hidden="true" />
          {streamingStatus}
        </div>
      )}

      {hasContent && (
        <div className="bubble bubble-assistant">
          <div className="bubble-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}
