import { Component } from 'react';
import { RefreshCw } from 'lucide-react';

// Last line of defense against a blank page: a render error anywhere below
// (including a route chunk that failed to load after its retry+reload cycle)
// used to unmount the whole tree. Keyed by route in App.jsx so navigating to
// another page clears the error state.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Route render error:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="error-boundary-card" role="alert">
        <h2>Something went wrong</h2>
        <p>This page hit an unexpected error. Reloading usually fixes it — if it keeps happening, please send us a feedback ticket.</p>
        <button type="button" className="error-boundary-reload" onClick={() => window.location.reload()}>
          <RefreshCw size={15} />
          Reload page
        </button>
      </div>
    );
  }
}
