import React from 'react';
import XiaoyunCloudAvatar, { type XiaoyunCloudMood } from './XiaoyunCloudAvatar';
import BrandMark from './BrandMark';
import styles from './BrandLoader.module.css';

/**
 * 全站统一加载指示器（D-702）
 *
 * <p><b>为什么要有这一个组件</b>：此前全站加载写法有 4 套并存 ——
 * AntD {@code <Spin>} 直接用（122 个文件）、AntD {@code Skeleton}（20 个）、
 * 自定义 loading 类名（16 个）、以及小云吉祥物局部使用。
 * 同一个「正在加载」在不同页面长得不一样，尺寸、动效、文案全是各自发挥。
 *
 * <p><b>本组件的定位</b>：<b>唯一的</b>加载入口。所有页面/组件的加载态都应该用它，
 * 不再直接写 {@code <Spin>}。
 *
 * <p><b>核心是「按像素分档」，不是把一个图形缩放</b>：
 * <ul>
 *   <li>{@code < 32px} → 极简云标 {@link BrandMark}。
 *       吉祥物有眼嘴光环双环，16px 下会糊成一个蓝点（实测确认）。</li>
 *   <li>{@code >= 32px} → 小云吉祥物 {@link XiaoyunCloudAvatar}。
 *       五官与呼吸光环在此尺寸才有可读性。</li>
 * </ul>
 * 传入 size 即自动选型，调用方无需关心这条规则。
 *
 * <p><b>示例</b>：
 * <pre>{@code
 * <BrandLoader size={18} onColor />              // 按钮内联
 * <BrandLoader size={20} label="正在同步订单…" />  // 表格行内
 * <BrandLoader size={64} label="正在加载…" />      // 内容区（默认）
 * <BrandLoader size={140} />                      // 全屏
 * <BrandLoader block />                           // 撑满容器 + 居中
 * }</pre>
 */

/** 低于此尺寸使用极简云标，高于则用小云吉祥物 */
export const MARK_MAX_SIZE = 32;

export type BrandLoaderSize = 16 | 18 | 20 | 24 | 32 | 40 | 48 | 64 | 96 | 140;

export interface BrandLoaderProps {
  /** 像素尺寸，同时决定使用云标还是吉祥物。默认 64 */
  size?: BrandLoaderSize | number;
  /** 下方提示文案。不传则只显示指示器 */
  label?: React.ReactNode;
  /** 置于品牌色/深色底上时置 true */
  onColor?: boolean;
  /** 撑满父容器并水平垂直居中（用于内容区/全屏） */
  block?: boolean;
  /** 吉祥物情绪态，仅 size >= 32 时有效 */
  mood?: XiaoyunCloudMood;
  /** 忙碌态：吉祥物加快节奏、嘴部动作。默认 true（这是个加载组件） */
  loading?: boolean;
  /** 无障碍文案。传 false 表示纯装饰 */
  ariaLabel?: string | false;
  className?: string;
  style?: React.CSSProperties;
}

const BrandLoader: React.FC<BrandLoaderProps> = ({
  size = 64,
  label,
  onColor = false,
  block = false,
  mood = 'normal',
  loading = true,
  ariaLabel,
  className = '',
  style,
}) => {
  const useMark = size < MARK_MAX_SIZE;
  const resolvedAriaLabel = ariaLabel === undefined ? (typeof label === 'string' ? label : '加载中') : ariaLabel;
  const hasWrapper = Boolean(label) || block;

  // 无障碍语义只能落在一处：嵌套 role="status" 是无效的无障碍树（外层已声明，
  // 内层再声明一次会被读屏重复播报）。故有包裹层时由外层承载，内层纯装饰。
  const indicator = useMark ? (
    <BrandMark
      size={size}
      onColor={onColor}
      label={hasWrapper ? false : resolvedAriaLabel}
    />
  ) : (
    <span aria-hidden={hasWrapper || undefined} style={{ display: 'inline-flex' }}>
      <XiaoyunCloudAvatar size={size} mood={mood} loading={loading} active={!loading} />
    </span>
  );

  // 无文案时不需要额外包裹层，避免多出一层影响布局
  if (!hasWrapper) {
    return <span className={className} style={style}>{indicator}</span>;
  }

  return (
    <div
      className={[styles.wrapper, block ? styles.block : '', className].filter(Boolean).join(' ')}
      style={style}
      role={resolvedAriaLabel === false ? 'presentation' : 'status'}
      aria-label={resolvedAriaLabel === false ? undefined : resolvedAriaLabel}
      aria-live={resolvedAriaLabel === false ? undefined : 'polite'}
      data-testid="brand-loader"
    >
      {indicator}
      {label ? <span className={styles.label}>{label}</span> : null}
    </div>
  );
};

export default BrandLoader;
export { BrandMark };
export type { XiaoyunCloudMood };
