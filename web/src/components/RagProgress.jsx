export default function RagProgress({ steps, notice, onDismiss }) {
  if (!steps) return null

  return <div className="rag-progress">
    <div className="rag-progress-header"><span>Поиск по базе знаний</span><button type="button" className="rag-progress-close" onClick={onDismiss} aria-label="Скрыть этапы RAG" title="Скрыть">×</button></div>
    {Object.entries(steps).map(([name, step]) => <div className={`rag-step rag-step-${step.status}`} key={name}>
      {step.status === 'active' && <span className="rag-step-icon spinner-small" />}
      {step.status === 'done' && <span className="rag-step-icon rag-check">✓</span>}
      {step.status === 'error' && <span className="rag-step-icon rag-error">✗</span>}
      {step.status === 'pending' && <span className="rag-step-icon">○</span>}
      <span className="rag-step-label">{step.label}</span>
    </div>)}
    {notice && <div className="rag-notice" role="status">{notice}</div>}
  </div>
}
