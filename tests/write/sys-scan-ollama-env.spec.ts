import { test, expect } from '@playwright/test'
import { ollamaEnvEntry } from '../../src/main/scan/sys-scan'

// Befund 2026-07-19: der fruehere Hardcode („OLLAMA_* stale — Ollama entfernt")
// erzeugte eine Dauerwarnung, obwohl Ollama aktiv ist (OLLAMA_MODELS u.a.
// gesetzt, Modelle im konfigurierten lokalen Modellordner). Der Eintrag wird
// jetzt live aus den Env-NAMEN abgeleitet (keine Werte, D008).

test('ollamaEnvEntry: ohne OLLAMA_*-Variablen kein Eintrag (kein Warn-Noise)', () => {
  const backup = process.env.OLLAMA_SPEC_PROBE
  delete process.env.OLLAMA_SPEC_PROBE
  try {
    // Andere echte OLLAMA_*-Variablen koennen gesetzt sein — fuer den
    // Negativpfad alle temporaer ausblenden.
    const hidden: Record<string, string | undefined> = {}
    for (const key of Object.keys(process.env).filter((k) => k.startsWith('OLLAMA'))) {
      hidden[key] = process.env[key]
      delete process.env[key]
    }
    try {
      expect(ollamaEnvEntry()).toBeNull()
    } finally {
      for (const [key, value] of Object.entries(hidden)) {
        if (value !== undefined) process.env[key] = value
      }
    }
  } finally {
    if (backup !== undefined) process.env.OLLAMA_SPEC_PROBE = backup
  }
})

test('ollamaEnvEntry: gesetzte OLLAMA_*-Variablen => aktiver Eintrag statt stale-Warnung', () => {
  process.env.OLLAMA_SPEC_PROBE = '1'
  try {
    const entry = ollamaEnvEntry()
    expect(entry).toMatchObject({ id: 'ollama', name: 'OLLAMA_*', status: 'active', v: 'gesetzt' })
    expect(entry?.desc).toContain('Ollama aktiv')
    expect(entry?.desc).not.toContain('entfernt')
  } finally {
    delete process.env.OLLAMA_SPEC_PROBE
  }
})
