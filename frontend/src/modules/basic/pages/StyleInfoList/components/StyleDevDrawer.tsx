import React from 'react';
import { Drawer } from 'antd';
import StyleDevelopmentWorkbench from './StyleDevelopmentWorkbench';
import { StyleInfo, WorkbenchSection } from '@/types/style';

interface StyleDevDrawerProps {
  open: boolean;
  record: StyleInfo | null;
  section: WorkbenchSection;
  onClose: () => void;
  onSync: () => void;
}

/** 开发工作台 Drawer：BOM / 纸样 / 码数单价 / 二次工艺 */
const StyleDevDrawer: React.FC<StyleDevDrawerProps> = ({
  open, record, section, onClose, onSync,
}) => {
  return (
    <Drawer
      open={open}
      title={record ? `${record.styleNo} · 开发工作台` : ''}
      onClose={onClose}
      size="large"
      styles={{ wrapper: { width: '85%' }, body: { padding: 0 } }}
      destroyOnHidden
    >
      {record && (
        <StyleDevelopmentWorkbench
          record={record}
          onClose={onClose}
          initialSection={section}
          onSync={onSync}
        />
      )}
    </Drawer>
  );
};

export default StyleDevDrawer;
