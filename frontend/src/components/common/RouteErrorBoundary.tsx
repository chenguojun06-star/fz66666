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

const CHUNK_ERROR_PATTERNS = [
  'Failed to fetch dynamically imported module',
  'Loading chunk',
  'dynamically imported module',
  'error loading dynamically imported module',
];

function isChunkLoadError(error: Error): boolean {
  const msg = error?.message || '';
  return CHUNK_ERROR_PATTERNS.some(p => msg.includes(p));
}

let _chunkReloadAttempted = false;

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
    if (isChunkLoadError(error) && !_chunkReloadAttempted) {
      _chunkReloadAttempted = true;
      console.warn('[RouteErrorBoundary] 检测到资源加载失败，自动刷新页面...');
      setTimeout(() => window.location.reload(), 300);
    }
  }

  handleReload = () => {
    this.setState({ hasError: false, message: undefined });
  };

  render() {
    if (this.state.hasError) {
      const isChunk = isChunkLoadError({ message: this.state.message } as Error);
      return (
        <div style={{ padding: 48, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          <Result
            status="500"
            title={isChunk ? '系统已更新' : `${this.props.pageName || '页面'}开小差了`}
            subTitle={isChunk ? '检测到新版本，正在自动刷新...' : (this.state.message || '请稍后重试或刷新页面')}
            extra={isChunk ? [] : [
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
