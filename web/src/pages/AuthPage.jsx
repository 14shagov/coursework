import { useState } from 'react'
import { login, register } from '../api/auth'
import { setAuthToken } from '../api/client'

export default function AuthPage({ onAuth }) {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const response = mode === 'login'
        ? await login(email.trim(), password)
        : await register(username.trim(), email.trim(), password)
      setAuthToken(response.accessToken)
      onAuth(response)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const isLogin = mode === 'login'

  return (
    <div className="page">
      <div className="auth-card">
        <h1>{isLogin ? 'Вход' : 'Регистрация'}</h1>
        <form onSubmit={onSubmit} className="auth-form">
          {!isLogin && (
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              minLength={3}
              required
            />
          )}
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            type="email"
            maxLength={254}
            required
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            type="password"
            minLength={8}
            required
          />
          <button type="submit" className="auth-submit-button" disabled={loading}>
            {loading ? 'Подождите...' : isLogin ? 'Войти' : 'Зарегистрироваться'}
          </button>
        </form>
        {error && <div className="error">{error}</div>}
        <button
          type="button"
          className="auth-switch-button"
          onClick={() => setMode(isLogin ? 'register' : 'login')}
        >
          {isLogin ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
        </button>
      </div>
    </div>
  )
}
