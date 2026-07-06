import { test, expect } from '@playwright/test'

test('third-party notices: escapes backslashes before markdown pipes', async () => {
  const { escapeCell } = await import('../../scripts/release/generate-third-party-notices.mjs')

  expect(escapeCell('MIT')).toBe('MIT')
  expect(escapeCell('left|right')).toBe('left\\|right')
  expect(escapeCell('left\\|right')).toBe('left\\\\\\|right')
})
