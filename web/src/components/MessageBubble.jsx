import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function MessageBubble({ role, content }) {
  const isUser = role === 'USER'

  return (
    <div className={`message ${isUser ? 'message-user' : 'message-assistant'}`}>
      {!isUser && <div className="bubble-role">Assistant</div>}
      <div className={`bubble ${isUser ? 'bubble-user' : 'bubble-assistant'}`}>
        <div className="bubble-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      </div>
    </div>
  )
}
