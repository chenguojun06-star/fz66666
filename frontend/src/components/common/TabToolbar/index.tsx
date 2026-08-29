import React from 'react';

/**
 * 样衣开发详情页 Tab 统一工具条（D-210）
 *
 * 布局规范（全站一致，不东一个西一个）：
 *   [左：业务动作区]  [中：导入/AI 区]  [右：编辑/保存 区]
 *   - 左：该 tab 的主业务动作（生成采购单/批量配置跳码区/无二次工艺…）
 *   - 中：模板导入类（导入物料清单模板 + 导入模板）与 AI 识别
 *   - 右：编辑→保存/取消（永远在最右）；属性库齿轮紧邻编辑左侧
 * 按钮样式统一：主操作 primary，编辑/保存 primary，其余 default；输入框统一 220px。
 */
export interface TabToolbarProps {
  /** 左：主业务动作（生成采购单/批量跳码区…），没有则留空占位 */
  left?: React.ReactNode;
  /** 中：导入模板/AI 识别等 */
  center?: React.ReactNode;
  /** 右：编辑/保存/取消 + 属性库齿轮 */
  right?: React.ReactNode;
  style?: React.CSSProperties;
}

const TabToolbar: React.FC<TabToolbarProps> = ({ left, center, right, style }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap',
      marginBottom: 16,
      ...style,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: left ? '1 1 auto' : '1 1 0', minWidth: 0 }}>{left}</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>{center}</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginLeft: 'auto' }}>{right}</div>
  </div>
);

export default TabToolbar;
