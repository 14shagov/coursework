// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { login, register } from './auth'

describe('auth API contract', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_MOCK', 'false')
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('{}', {
      headers: { 'Content-Type': 'application/json' },
    }))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('sends username, email, and password when registering', async () => {
    await register('student', 'student@example.com', 'password123')

    expect(fetch.mock.calls[0][0]).toBe('/api/auth/register')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      username: 'student',
      email: 'student@example.com',
      password: 'password123',
    })
  })

  it('sends email and password when logging in', async () => {
    await login('student@example.com', 'password123')

    expect(fetch.mock.calls[0][0]).toBe('/api/auth/login')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      email: 'student@example.com',
      password: 'password123',
    })
  })
})
