import { useState } from 'react'
import ChatPage from './pages/ChatPage'
import AuthPage from './pages/AuthPage'
import { getAuthToken, setAuthToken } from './api/client'

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(getAuthToken()))

  if (!isAuthenticated) {
    return <AuthPage onAuth={() => setIsAuthenticated(true)} />
  }

  return <ChatPage onLogout={() => { localStorage.removeItem('conversationId'); setAuthToken(null); setIsAuthenticated(false) }} />
}
