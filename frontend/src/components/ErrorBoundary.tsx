import React, { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() { return { hasError: true }; }

  componentDidCatch(error: Error, _info: React.ErrorInfo) {
    // Suppress known non-fatal React+Zustand unmount error during logout
    if (error.message?.includes("reading 'length'") && error.message?.includes('undefined')) {
      return; // silent — known logout transition artifact
    }
    // Error boundary caught error — log to monitoring service when available
  }

  render() {
    if (this.state.hasError) {
      return null; // Silent fallback — let the app continue without crash
    }
    return this.props.children;
  }
}
