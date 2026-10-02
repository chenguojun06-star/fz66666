import React from 'react';
import { BrandLoader } from './loading';

/**
 * 全局路由级加载指示器（D-702 收敛）
 *
 * <p><b>历史</b>：本组件是「再包一层 spinner」的重复实现 —— 它自己算尺寸、
 * 自己撑满容器，里面直接放 {@link XiaoyunCloudAvatar}。视觉虽已是小云，
 * 但走的是品牌体系之外的第二条路：以后要改加载视觉，这里会漏掉。
 *
 * <p><b>现在</b>：改为 {@link BrandLoader} 的薄封装，加载视觉只有一条出口。
 * 尺寸映射沿用原逻辑（small 32 / default 40 / large 52），不改变现有观感。
 *
 * <p>调用方无需改动 —— props 签名保持不变。
 */
interface XiaoyunSpinIndicatorProps {
  size?: 'small' | 'default' | 'large' | number;
}

const XiaoyunSpinIndicator: React.FC<XiaoyunSpinIndicatorProps> = ({ size = 'default' }) => {
  const resolveSize = () => {
    if (typeof size === 'number') return size;
    switch (size) {
      case 'small':
        return 32;
      case 'large':
        return 52;
      default:
        return 40;
    }
  };

  return <BrandLoader size={resolveSize()} block ariaLabel="加载中" />;
};

export default XiaoyunSpinIndicator;
