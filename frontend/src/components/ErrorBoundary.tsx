import { Component, type ReactNode } from 'react';

type State = { failed: boolean };

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
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
