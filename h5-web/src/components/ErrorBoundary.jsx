import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.href = '/home';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleReset);
      }
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '60vh', padding: 24, textAlign: 'center',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', background: 'rgba(239,68,68,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
            fontSize: 24,
          }}>⚠</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 8 }}>
            页面出现异常
          </div>
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 20, maxWidth: 280 }}>
            {this.state.error?.message || '发生了未知错误'}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={this.handleReset} style={{
              padding: '10px 24px', borderRadius: 12, border: '1px solid var(--color-border)',
              background: 'var(--color-bg-card)', fontSize: 14, cursor: 'pointer',
            }}>重试</button>
            <button onClick={this.handleReload} style={{
              padding: '10px 24px', borderRadius: 12, border: 'none',
              background: 'var(--color-primary)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>返回首页</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
