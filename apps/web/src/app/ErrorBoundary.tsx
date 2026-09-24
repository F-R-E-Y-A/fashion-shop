import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Luoi an toan cuoi cung: mot loi khong bat duoc trong mot trang chi lam hong trang do,
 * khong lam trang trang ca ung dung. Boc quanh cay dinh tuyen o AppProviders.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Loi khong bat duoc o giao dien:', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="shell__main">
        <p className="state state--error" role="alert">
          Giao diện gặp lỗi: {error.message}
        </p>
        <button type="button" onClick={() => this.setState({ error: null })}>
          Thử lại
        </button>
      </div>
    );
  }
}
