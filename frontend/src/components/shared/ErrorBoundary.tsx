import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from './ErrorState';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * A crash inside a page must not take the shell with it: the boundary sits
 * around the routed content only, so the sidebar, header and navigation stay
 * usable and the user can walk somewhere else. The fallback is the app's shared
 * error state, so a thrown chart and a failed fetch look like the same class of
 * problem rather than two different tools' idea of an error.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <ErrorState
          title="This page could not be displayed"
          description="Something failed while rendering. The rest of the app is still usable from the navigation."
          detail={this.state.error?.message}
          onRetry={this.reset}
        />
      );
    }
    return this.props.children;
  }
}
