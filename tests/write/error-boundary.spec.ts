// error-boundary.spec.ts — A8-6: reine LOGIK-Pruefung der ErrorBoundary-State-Ableitung (Stufe 2).
// DOM-frei: testet nur die statische getDerivedStateFromError-Ableitung, die den
// Fallback-State aus dem geworfenen Fehler bildet. Es wird NICHTS gemountet.
//
// WICHTIG (Scope-Grenze): Der End-to-End-PASS von A8-6 ("weisses Fenster wird
// verhindert") verlangt zusaetzlich einen BROWSER-SMOKE gegen den echten Build
// (Render-Throw provozieren -> Fallbackseite sichtbar). Das ist ein
// browser-basierter Schritt und gehoert NICHT in diesen Node-Runner — hier wird
// die ErrorBoundary bewusst nicht in einen DOM gemountet.
// Runner: Playwright (test/expect) als reiner Node-Test-Runner (kein Browser).
import { expect, test } from '@playwright/test'
import { deriveErrorBoundaryState } from '../../src/renderer/components/error-boundary-state'

test('getDerivedStateFromError: Error -> hasError=true + gekappte message', () => {
  const state = deriveErrorBoundaryState(new Error('x'))
  expect(state.hasError).toBe(true)
  expect(state.msg).toBe('x')
})

test('getDerivedStateFromError: Nicht-Error -> hasError=true + Fallback-Text', () => {
  const state = deriveErrorBoundaryState('kaputt')
  expect(state.hasError).toBe(true)
  expect(state.msg).toBe('Unbekannter Fehler')
})
