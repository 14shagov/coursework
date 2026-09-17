// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8')

describe('thinking panel scrolling', () => {
  it('allows wheel scrolling to continue in the chat after the panel reaches an edge', () => {
    const thinkingPanelRule = styles.match(/\.thinking-content-open\s*\{([\s\S]*?)\n\}/)?.[1]

    expect(thinkingPanelRule).toBeDefined()
    expect(thinkingPanelRule).toMatch(/overscroll-behavior\s*:\s*auto/)
  })
})
