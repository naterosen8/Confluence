import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Confluence crashed:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="error-boundary">
        <h1>Something broke</h1>
        <p className="muted">
          The screener hit an unexpected error rendering this page. Reloading usually fixes it — if not, the data
          feeding this page may be malformed.
        </p>
        <button onClick={() => window.location.assign('/')}>Back to screener</button>
      </div>
    )
  }
}
