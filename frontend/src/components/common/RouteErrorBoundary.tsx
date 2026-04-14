import React from 'react';
import { Button, Result } from 'antd';

type RouteErrorBoundaryProps = {
  children: React.ReactNode;
  pageName?: string;
};

type RouteErrorBoundaryState = {
  hasError: boolean;
  message?: string;
};

class RouteErrorBoundary extends React.Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  constructor(props: RouteErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { hasError: true, message: error?.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[RouteErrorBoundary] ${this.props.pageName || 'Unknown'} page error:`, error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false, message: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 48, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          <Result
            status="500"
            title={`${this.props.pageName || '页面'}开小差了`}
            subTitle={this.state.message || '请稍后重试或刷新页面'}
            extra={[
              <Button key="retry" type="primary" onClick={this.handleReload}>重试</Button>,
              <Button key="refresh" onClick={() => window.location.reload()}>刷新页面</Button>,
            ]}
          />
        </div>
      );
    }
    return this.props.children;
  }
}

export function withRouteErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  pageName: string
): React.FC<P> {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';
  const ComponentWithErrorBoundary: React.FC<P> = (props) => (
    <RouteErrorBoundary pageName={pageName}>
      <WrappedComponent {...props} />
    </RouteErrorBoundary>
  );
  ComponentWithErrorBoundary.displayName = `withRouteErrorBoundary(${displayName})`;
  return ComponentWithErrorBoundary;
}

export default RouteErrorBoundary;
