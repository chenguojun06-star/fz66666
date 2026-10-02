import React from 'react';
import BrandLoader, { type BrandLoaderSize, type BrandLoaderProps } from './BrandLoader';
import styles from './BrandLoading.module.css';

/**
 * 内容区加载包装器（D-702）
 *
 * <p><b>承接什么</b>：全站原有 76 处 {@code <Spin spinning={loading}>…</Spin>} 的写法。
 * 这类用法不是「显示一个转圈」，而是<b>内容还在、只是处理中</b> —— 所以它必须保留
 * children，只在其上叠加遮罩与指示器，不能替换成 {@link BrandLoader}。
 *
 * <p><b>与 AntD Spin 的行为对齐</b>（避免迁移后手感变化）：
 * <ul>
 *   <li>{@code spinning=false} 时完全渲染 children，不加任何遮罩；</li>
 *   <li>{@code spinning=true} 时 children 仍在（可继续看到旧数据），叠加半透明遮罩 +
 *       居中指示器 —— 与 AntD 行为一致；</li>
 *   <li>{@code delay} 保留：AntD 支持延迟显示，避免 100ms 内的闪一下。</li>
 * </ul>
 *
 * <p><b>迁移对照</b>：
 * <pre>{@code
 * // 旧
 * <Spin spinning={loading}>{children}</Spin>
 * // 新（等价）
 * <BrandLoading spinning={loading}>{children}</BrandLoading>
 * }</pre>
 */

export interface BrandLoadingProps {
  /** 是否处于加载中 */
  spinning?: boolean;
  /** 延迟多少毫秒后才显示遮罩（对齐 AntD Spin 的 delay） */
  delay?: number;
  /** 指示器尺寸，默认 48（内容区足够大，不需要全屏规格） */
  size?: BrandLoaderSize | number;
  /** 遮罩上的提示文案 */
  tip?: React.ReactNode;
  /** 自定义遮罩样式（透传） */
  indicatorStyle?: React.CSSProperties;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** 其余透传给内部指示器 */
  indicatorProps?: Omit<BrandLoaderProps, 'size' | 'label' | 'block'>;
}

const BrandLoading: React.FC<BrandLoadingProps> = ({
  spinning = false,
  delay = 0,
  size = 48,
  tip,
  indicatorStyle,
  children,
  className = '',
  style,
  indicatorProps,
}) => {
  const [visible, setVisible] = React.useState(delay === 0 && spinning);

  // delay 逻辑：与 AntD 一致 —— spinning 变 true 后等 delay 毫秒才显示
  React.useEffect(() => {
    if (!spinning) {
      setVisible(false);
      return undefined;
    }
    if (delay === 0) {
      setVisible(true);
      return undefined;
    }
    const timer = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(timer);
  }, [spinning, delay]);

  return (
    <div
      className={[styles.wrap, className].filter(Boolean).join(' ')}
      style={style}
      aria-busy={spinning || undefined}
    >
      {children}
      {visible ? (
        <div className={styles.mask} data-testid="brand-loading-mask">
          <BrandLoader
            size={size}
            label={tip}
            block
            style={indicatorStyle}
            ariaLabel={typeof tip === 'string' ? tip : '加载中'}
            {...indicatorProps}
          />
        </div>
      ) : null}
    </div>
  );
};

export default BrandLoading;
