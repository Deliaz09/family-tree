import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Eroare in interfata:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page-error">
          <h2>Eroare in interfata</h2>
          <p>{this.state.error.message || String(this.state.error)}</p>
          <button onClick={() => window.location.reload()}>
            Reincarca pagina
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
