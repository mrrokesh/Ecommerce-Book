import { Component, type ReactNode } from 'react';
import { reportClientError } from '../lib/reportError';

type State = { failed: boolean };

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
    const err = error instanceof Error ? error : new Error(String(error));
    reportClientError({
      message: err.message,
      stack: err.stack,
      path: typeof location !== 'undefined' ? location.pathname : undefined,
      url: typeof location !== 'undefined' ? location.href : undefined,
    });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="container notfound">
        <h1>Something went wrong</h1>
        <p>Please refresh the page. If it keeps happening, contact Salem Book House.</p>
        <button type="button" className="btn btn-navy" onClick={() => window.location.assign('/')}>
          Back to home
        </button>
      </div>
    );
  }
}
