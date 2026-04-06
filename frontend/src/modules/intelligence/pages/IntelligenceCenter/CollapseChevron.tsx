import React from 'react';
import { DownOutlined, UpOutlined } from '@ant-design/icons';

const CollapseChevron = React.memo(({ panelKey: _panelKey, collapsed }: { panelKey: string; collapsed: boolean }) => (
  <span
    style={{ marginLeft: 'auto', cursor: 'pointer', color: collapsed ? '#a78bfa' : '#5a7a9a', fontSize: 12, padding: '0 4px', display: 'inline-flex', alignItems: 'center', flexShrink: 0, userSelect: 'none' }}
    title={collapsed ? '展开面板' : '收起面板'}
  >
    {collapsed ? <DownOutlined /> : <UpOutlined />}
  </span>
));
CollapseChevron.displayName = 'CollapseChevron';

export default CollapseChevron;
