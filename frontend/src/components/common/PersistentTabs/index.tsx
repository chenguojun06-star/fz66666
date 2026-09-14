import React from 'react';
import { Tabs, type TabsProps } from 'antd';
import { usePersistentTab } from '@/hooks/usePersistentTab';

interface PersistentTabsProps extends Omit<TabsProps, 'activeKey' | 'onChange' | 'defaultActiveKey'> {
  /** URL 参数名，同一页面内多个 Tab 必须各不相同，否则会互相覆盖 */
  paramName: string;
  /** 默认选中项；URL 上没有该参数时使用。通常传原来 defaultActiveKey 的值 */
  defaultKey?: string;
}

/**
 * 会记住选中项的 Tabs —— 解决「刷新后 Tab 跳回第一个」。
 *
 * antd 原生的 defaultActiveKey 是非受控的，值只存在组件内存里，
 * 页面刷新或路由离开再回来就会丢失、回到第一项。
 * 本组件把选中项写进 URL query，刷新后自动还原，且链接可分享。
 *
 * 用法（替换原来的 <Tabs defaultActiveKey="x" ...>）：
 *   <PersistentTabs paramName="myTab" defaultKey="x" items={[...]} />
 */
const PersistentTabs: React.FC<PersistentTabsProps> = ({ paramName, defaultKey, ...rest }) => {
  const [activeKey, setActiveKey] = usePersistentTab(paramName, defaultKey || '');
  return <Tabs activeKey={activeKey} onChange={setActiveKey} {...rest} />;
};

export default PersistentTabs;
