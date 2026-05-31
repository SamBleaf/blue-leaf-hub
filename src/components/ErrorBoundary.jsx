import { Component } from "react";

/**
 * Top-level error boundary. Catches render-time errors anywhere in the tree so a single
 * crashing component shows a recover screen instead of white-screening the whole app.
 * (Module-load/import errors happen before render and are not catchable here.)
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surface for debugging; replace with a logging service when one exists.
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            fontFamily: "Lato, system-ui, sans-serif",
            background: "#F8F9FA",
            color: "#1f2937",
          }}
        >
          <div style={{ maxWidth: 460, textAlign: "center" }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#006c9b", margin: "0 0 8px" }}>
              Something went wrong
            </h1>
            <p style={{ color: "#6b7280", margin: "0 0 20px", lineHeight: 1.5 }}>
              This screen hit an unexpected error. Your data is safe. Try reloading — if it keeps
              happening, let the team know what you were doing.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                background: "#006c9b",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
