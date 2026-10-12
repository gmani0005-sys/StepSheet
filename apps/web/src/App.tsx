import React from 'react';
import { WorkbenchPage } from './pages/WorkbenchPage';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F3F3F3] text-[#212121] flex items-center justify-center p-6">
          <div className="bg-white border border-[#D4D4D4] rounded p-6 max-w-md w-full shadow-lg space-y-4">
            <div className="flex items-center gap-2 text-[#C50F1F] font-bold text-sm">
              <span>StepSheet View Recovery</span>
            </div>
            <p className="text-xs text-[#605E5C]">
              An unexpected display issue occurred ({this.state.error?.message || 'Runtime error'}). Your datasets and steps remain safely stored.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="px-4 py-1.5 bg-[#217346] hover:bg-[#185C37] text-white text-xs font-semibold rounded transition-colors"
              >
                Resume Workbook
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  return (
    <AppErrorBoundary>
      <WorkbenchPage />
    </AppErrorBoundary>
  );
}

export default App;

