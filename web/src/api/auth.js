import { apiRequest } from './client'

export function register(username, email, password) {
  return apiRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password }),
  })
}

export function login(email, password) {
  return apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}
