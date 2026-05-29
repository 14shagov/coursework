import { useState } from 'react'
import { login, register } from '../api/auth'
import { setAuthToken } from '../api/client'

export default function AuthPage({ onAuth }) {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const action = mode === 'login' ? login : register
      const response = await action(username.trim(), password)
      setAuthToken(response.accessToken)
      onAuth(response)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="chat-container">
        <h1>{mode === 'login' ? 'Вход' : 'Регистрация'}</h1>
        <form onSubmit={onSubmit} className="input-row auth-form">
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Логин" minLength={3} required />
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Пароль" type="password" minLength={8} required />
          <button type="submit" className="auth-submit-button" disabled={loading}>{loading ? 'Подождите...' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}</button>
        </form>
        {error && <div className="error">{error}</div>}
        <button type="button" className="auth-switch-button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
        </button>
      </div>
    </div>
  )
}
