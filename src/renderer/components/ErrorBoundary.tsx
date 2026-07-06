import { Component, type ErrorInfo, type ReactNode } from 'react'
import { deriveErrorBoundaryState, type ErrorBoundaryState } from './error-boundary-state'

// A8-6, Stufe 2: globale Auffangschicht fuer den Renderer. Ein Render-Throw in
// einem Kind wuerde sonst ein WEISSES Fenster erzeugen (React unmountet den Baum).
// Diese Klassen-Komponente faengt den Fehler, loggt nur die Klartext-message
// (secret-frei — kein Objekt-/Stack-Dump) und zeigt eine gestylte, laien-
// verstaendliche Fehlerseite mit "Neu laden"-Knopf statt des leeren Fensters.
interface Props {
  children: ReactNode
}
export class ErrorBoundary extends Component<Props, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, msg: '' }

  // React-Lifecycle: aus dem Fehler den neuen State ableiten (rendert Fallback).
  static getDerivedStateFromError(err: unknown): ErrorBoundaryState {
    return deriveErrorBoundaryState(err)
  }

  // Nur loggen (secret-frei): message + Komponenten-Herkunft, nie das ganze Objekt.
  componentDidCatch(err: unknown, info: ErrorInfo): void {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
    console.error('[renderer] ErrorBoundary', msg, info.componentStack ?? '')
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="error-boundary" role="alert">
        <div className="eb-box">
          <div className="eb-title">Etwas ist schiefgelaufen</div>
          <p className="eb-text">
            Die Ansicht konnte nicht angezeigt werden. Deine Konfigurationsdateien
            sind nicht betroffen. Lade die App neu, um es erneut zu versuchen.
          </p>
          {this.state.msg && <div className="eb-detail">{this.state.msg}</div>}
          <button type="button" className="eb-reload" onClick={() => location.reload()}>
            Neu laden
          </button>
        </div>
      </div>
    )
  }
}
