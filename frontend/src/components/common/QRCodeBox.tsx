import React from 'react';
import { QRCodeCanvas } from 'qrcode.react';

export interface QRCodeBoxProps {
  /**
   * 二维码的值（纯字符串或JSON对象，会自动stringify）
   */
  value: string | Record<string, unknown>;

  /**
   * 二维码尺寸（像素）
   * @default 120
   */
  size?: number;

  /**
   * 底部显示的标签文字
   */
  label?: string;

  /**
   * 样式变体
   * - 'primary': 蓝色主题（默认，用于重要扫码）
   * - 'default': 灰色主题（用于普通扫码）
   * - 'success': 绿色主题（用于成功/完成状态）
   * - 'warning': 橙色主题（用于警告/待处理）
   * @default 'primary'
   */
  variant?: 'primary' | 'default' | 'success' | 'warning';

  /**
   * 纠错级别
   * @default 'M'
   */
  level?: 'L' | 'M' | 'Q' | 'H';

  /**
   * 是否包含边距
   * @default false
   */
  includeMargin?: boolean;

  /**
   * 自定义样式
   */
  style?: React.CSSProperties;

  /**
   * 自定义类名
   */
  className?: string;
}

const variantStyles = {
  primary: {
    background: '#e6f7ff',
    borderColor: 'var(--color-primary)',
    boxShadow: '0 4px 12px rgba(24, 144, 255, 0.15)',
    labelColor: '#1890ff',
  },
  default: {
    background: 'var(--color-bg-container)',
    borderColor: 'var(--color-border)',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
    labelColor: '#595959',
  },
  success: {
    background: 'rgba(34, 197, 94, 0.15)',
    borderColor: '#52c41a',
    boxShadow: '0 4px 12px rgba(82, 196, 26, 0.15)',
    labelColor: '#52c41a',
  },
  warning: {
    background: 'rgba(234, 179, 8, 0.15)',
    borderColor: '#faad14',
    boxShadow: '0 4px 12px rgba(250, 173, 20, 0.15)',
    labelColor: '#faad14',
  },
};

/**
 * 通用二维码展示组件
 *
 * 用于在全站统一展示二维码，支持多种主题样式和自定义配置
 *
 * **特性：**
 * - 固定尺寸：二维码大小不随窗口缩放而变化，保持清晰可扫描
 * - 多主题：支持 primary、default、success、warning 四种样式
 * - 统一规范：全站统一的二维码展示样式
 *
 * @example
 * ```tsx
 * // 订单扫码（蓝色主题）
 * <QRCodeBox
 *   value={{ type: 'order', orderNo: 'PO20260122001' }}
 *   label="📱 订单扫码"
 *   variant="primary"
 *   size={120}
 * />
 *
 * // 裁剪单扫码（默认主题）
 * <QRCodeBox
 *   value={task.qrCode}
 *   label="裁剪单"
 *   variant="default"
 *   size={100}
 * />
 *
 * // 质检合格（绿色主题）
 * <QRCodeBox
 *   value={qualityRecord.qrCode}
 *   label="✓ 质检通过"
 *   variant="success"
 * />
 * ```
 */
export const QRCodeBox: React.FC<QRCodeBoxProps> = ({
  value,
  size = 120,
  label,
  variant = 'primary',
  level = 'M',
  includeMargin = false,
  style,
  className,
}) => {
  const qrValue = typeof value === 'string' ? value : JSON.stringify(value);
  const variantStyle = variantStyles[variant];

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '8px',
        background: variantStyle.background,
        borderRadius: '8px',
        border: `2px solid ${variantStyle.borderColor}`,
        boxShadow: variantStyle.boxShadow,
        flexShrink: 0,
        width: 'fit-content',
        minWidth: `${size + 16}px`, // size + 2*padding
        maxWidth: `${size + 16}px`,
        ...style,
      }}
    >
      <div
        style={{
          width: `${size}px`,
          height: `${size}px`,
          flexShrink: 0,
        }}
      >
        <QRCodeCanvas
          value={qrValue}
          size={size}
          level={level}
          includeMargin={includeMargin}
          style={{
            width: '100%',
            height: '100%',
          }}
        />
      </div>
      {label && (
        <div
          style={{
            marginTop: '8px',
            fontSize: '12px',
            color: variantStyle.labelColor,
            fontWeight: 600,
            textAlign: 'center',
            wordBreak: 'break-all',
            width: `${size}px`,
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
};

export default QRCodeBox;
