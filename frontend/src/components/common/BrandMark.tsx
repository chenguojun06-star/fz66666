import React from 'react';
import styles from './BrandMark.module.css';

/**
 * 品牌极简云标（D-702）
 *
 * <p><b>为什么需要它</b>：小云吉祥物（{@link XiaoyunCloudAvatar}）有眼、嘴、光环、
 * 双层圆环，最小可读尺寸约 40px。低于这个尺寸五官会糊成一坨蓝色斑点 ——
 * 实测 16px 时只剩一个蓝点，既不像小云、也不像任何可识别的加载指示器。
 *
 * <p>所以本组件<b>不是</b>把吉祥物缩小，而是取其视觉 DNA 中唯一在 20px 仍然清晰的
 * 部分：<b>云的轮廓</b>（三团云 + 底座）。去掉五官，加一条会呼吸的横线表示「在动」。
 * 这样小尺寸下依然是「认得出是云」的品牌资产，而不是随手找的圆圈 spinner。
 *
 * <p><b>分档规则（全站统一，不允许各自发挥）</b>：
 * <table border="1">
 *   <tr><th>尺寸</th><th>用什么</th><th>典型场景</th></tr>
 *   <tr><td>&lt; 32px</td><td>BrandMark（本组件）</td><td>按钮内联、表格行内</td></tr>
 *   <tr><td>&ge; 32px</td><td>小云吉祥物</td><td>卡片、内容区、全屏</td></tr>
 * </table>
 *
 * <p>日常直接用 {@link BrandLoader} 即可，它会按 size 自动选型。
 */

export type BrandMarkSize = 16 | 18 | 20 | 24 | 28;

export interface BrandMarkProps {
  /** 像素尺寸。默认 20 —— 表格/列表行内的常用值 */
  size?: BrandMarkSize | number;
  /** 放在品牌色/深色底上时置 true，反转为白色描边 */
  onColor?: boolean;
  /** 无障碍文案。传 false 表示纯装饰（如紧跟已有文字） */
  label?: string | false;
  className?: string;
  style?: React.CSSProperties;
}

const BrandMark: React.FC<BrandMarkProps> = ({
  size = 20,
  onColor = false,
  label = '加载中',
  className = '',
  style,
}) => (
  <span
    className={[styles.mark, onColor ? styles.onColor : '', className].filter(Boolean).join(' ')}
    style={{ width: size, height: size, ...style }}
    role={label === false ? 'presentation' : 'status'}
    aria-label={label === false ? undefined : label}
    aria-live={label === false ? undefined : 'polite'}
    data-testid="brand-mark"
  >
    <span className={styles.puffLeft} />
    <span className={styles.puffCenter} />
    <span className={styles.puffRight} />
    <span className={styles.base} />
    <span className={styles.pulse} />
  </span>
);

export default BrandMark;
