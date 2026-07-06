export interface ErrorBoundaryState {
  hasError: boolean
  msg: string
}

export function deriveErrorBoundaryState(err: unknown): ErrorBoundaryState {
  const msg = err instanceof Error ? err.message.slice(0, 200) : 'Unbekannter Fehler'
  return { hasError: true, msg }
}
