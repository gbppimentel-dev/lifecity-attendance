// Change ID: LC-P08F-v1
import { Component, Suspense, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'

type Props = { label: string; children: ReactNode }

export default class ScreenBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return <section className="dashboard-card empty-state" role="alert">
        <h2>Could Not Open {this.props.label}</h2>
        <p>Check your connection, then reload the page to try again.</p>
        <button type="button" className="secondary-button" onClick={() => window.location.reload()}>
          <RefreshCw size={16} aria-hidden="true"/>Reload Page
        </button>
      </section>
    }

    return <Suspense fallback={
      <section className="dashboard-card empty-state" role="status" aria-busy="true" aria-live="polite">
        <h2>Loading {this.props.label}</h2>
        <p>Getting this page ready…</p>
      </section>
    }>{this.props.children}</Suspense>
  }
}
