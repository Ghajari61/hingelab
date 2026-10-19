import { Component, type ReactNode } from "react";

/** Keeps the window usable when a page throws: the sidebar stays, and the page can be reopened. */
export class Crash extends Component<{ children: ReactNode; onReset?: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("HingeLab page error", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="dk dk-crash" role="alert">
        <h2>This page stopped working</h2>
        <p>Your other pages and saved files are fine. Open the page again; if it keeps happening, restart HingeLab.</p>
        <pre>{this.state.error.message.slice(0, 300)}</pre>
        <button type="button" className="btn primary" onClick={() => { this.setState({ error: null }); this.props.onReset?.(); }}>Open it again</button>
      </div>
    );
  }
}
