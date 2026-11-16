import { AlertTriangle, Home, RotateCw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled application error:', error.message, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.assign('/');
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-[#F4F8FD] flex items-center justify-center p-4">
        <div className="lucid-glass max-w-md w-full rounded-3xl p-8 text-center space-y-5">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 border border-rose-200">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-xl font-bold text-[#0B192C]">
              Unexpected View Error
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Something interrupted this screen. Your clinic records remain safely stored. Reload to
              continue working.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-5 text-sm font-semibold text-white shadow-sm hover:brightness-105 cursor-pointer"
            >
              <RotateCw className="h-4 w-4" aria-hidden="true" />
              Reload Page
            </button>
            <button
              type="button"
              onClick={this.handleGoHome}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#0B192C] hover:bg-slate-50 cursor-pointer"
            >
              <Home className="h-4 w-4 text-slate-600" aria-hidden="true" />
              Home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
