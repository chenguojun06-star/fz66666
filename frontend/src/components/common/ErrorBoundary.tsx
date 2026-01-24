import React from 'react';
import { Button, Result } from 'antd';

export type ErrorBoundaryProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  message?: string;
};

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error?.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // 在控制台打印，便于快速定位
    console.error('Unexpected error caught by ErrorBoundary:', error, info);
  }

  handleReload = () => {
    try {
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    } catch {
    // Intentionally empty
      // 忽略错误
      /* 无操作：刷新失败时静默处理 */
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <Result
          status="500"
          title="页面开小差了"
          subTitle={this.state.message || '请稍后重试或刷新页面'}
          extra={<Button type="primary" onClick={this.handleReload}>刷新页面</Button>}
        />
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
