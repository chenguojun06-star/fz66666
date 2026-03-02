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

    // 动态导入失败（部署后旧chunk被替换）→ 自动刷新一次
    const msg = error?.message || '';
    if (msg.includes('Failed to fetch dynamically imported module') || msg.includes('Loading chunk')) {
      const key = '__chunk_reload__';
      const last = sessionStorage.getItem(key);
      const now = Date.now();
      // 5秒内只允许刷新一次，防止无限循环
      if (!last || now - Number(last) > 5000) {
        sessionStorage.setItem(key, String(now));
        window.location.reload();
        return;
      }
    }
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
