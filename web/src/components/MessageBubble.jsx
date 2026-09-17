import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function CopyGlyph({ copied }) {
  if (copied) return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
}

function CodeBlock({ children }) {
  const [copied, setCopied] = useState(false)
  const code = String(children?.props?.children ?? children).replace(/\n$/, '')
  const copy = async () => {
    await navigator.clipboard?.writeText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }
  return <div className="code-block"><button type="button" className="code-copy" onClick={copy} title={copied ? 'Скопировано' : 'Копировать код'} aria-label={copied ? 'Скопировано' : 'Копировать код'}><CopyGlyph copied={copied} /></button><pre>{children}</pre></div>
}

function MarkdownContent({ children }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: ({ children: code }) => <CodeBlock>{code}</CodeBlock>, table: ({ children }) => <div className="table-scroll"><table>{children}</table></div> }}>{children}</ReactMarkdown>
}

export default function MessageBubble({ messageId, highlighted, role, content, thinking, isStreaming, wasCancelled, streamingStatus }) {
  const isUser = role === 'USER'
  const [thinkingExpanded, setThinkingExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const thinkingContentRef = useRef(null)
  const shouldAutoScrollRef = useRef(true)
  const hasThinking = typeof thinking === 'string' && thinking.trim().length > 0
  const hasContent = typeof content === 'string' && content.trim().length > 0

  useEffect(() => {
    if (isStreaming && hasThinking) setThinkingExpanded(true)
  }, [hasThinking, isStreaming])

  useEffect(() => {
    if (isStreaming && thinkingExpanded && shouldAutoScrollRef.current && thinkingContentRef.current) {
      thinkingContentRef.current.scrollTop = thinkingContentRef.current.scrollHeight
    }
  }, [thinking, isStreaming, thinkingExpanded])

  const copyAnswer = async () => {
    await navigator.clipboard?.writeText(content || '')
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const handleThinkingScroll = () => {
    const element = thinkingContentRef.current
    if (element) shouldAutoScrollRef.current = element.scrollHeight - element.scrollTop - element.clientHeight <= 24
  }

  if (isUser) return <div id={messageId ? `message-${messageId}` : undefined} className={`message message-user ${highlighted ? 'message-highlighted' : ''}`}><div className="bubble bubble-user"><div className="bubble-content"><MarkdownContent>{content}</MarkdownContent></div></div></div>

  return <div id={messageId ? `message-${messageId}` : undefined} className={`message message-assistant ${highlighted ? 'message-highlighted' : ''}`}>
    <div className="bubble-role"><span className="assistant-glyph" aria-hidden="true">✦</span> Ассистент</div>
    {hasThinking && <div className="thinking-block">
      <button className="thinking-toggle" onClick={() => setThinkingExpanded((value) => !value)} aria-expanded={thinkingExpanded}>
        <span className="thinking-heading"><span className="thinking-label">Мысли модели</span>{isStreaming && <span className="thinking-live"><span className="thinking-live-dot" aria-hidden="true" />Думаю…</span>}</span>
        <span className={`thinking-chevron ${thinkingExpanded ? 'thinking-chevron-open' : ''}`} aria-hidden="true">⌄</span>
      </button>
      <div className={`thinking-content ${thinkingExpanded ? 'thinking-content-open' : ''}`} ref={thinkingContentRef} onScroll={handleThinkingScroll} aria-hidden={!thinkingExpanded}>
        <div className="bubble-content thinking-scroll-content"><MarkdownContent>{thinking}</MarkdownContent>{isStreaming && <span className="thinking-typing-cursor" />}</div>
      </div>
    </div>}
    {streamingStatus && <div className="streaming-status" role="status"><span className="spinner-small" aria-hidden="true" />{streamingStatus}</div>}
    {hasContent && <div className="assistant-answer"><div className="bubble bubble-assistant"><div className="bubble-content"><MarkdownContent>{content}</MarkdownContent>{isStreaming && <span className="answer-typing-cursor" />}</div></div>{!isStreaming && <div className="message-actions"><button type="button" onClick={copyAnswer} title={copied ? 'Скопировано' : 'Копировать ответ'} aria-label={copied ? 'Скопировано' : 'Копировать ответ'}><CopyGlyph copied={copied} /></button></div>}</div>}
    {wasCancelled && <div className="streaming-status">Ответ остановлен</div>}
  </div>
}
