import React from 'react';
import { Button, Dropdown } from 'antd';
import { DownOutlined } from '@ant-design/icons';

interface StyleBomAddRowsDropdownProps {
  onAddRows: (count: number) => void;
  disabled?: boolean;
  type?: 'primary' | 'dashed' | 'default';
  label?: string;
}

const StyleBomAddRowsDropdown: React.FC<StyleBomAddRowsDropdownProps> = ({
  onAddRows,
  disabled,
  type = 'primary',
  label = '添加物料',
}) => (
  <Dropdown
    disabled={disabled}
    menu={{
      items: [
        { key: '1', label: '+1行' },
        { key: '5', label: '+5行' },
        { key: '10', label: '+10行' },
      ],
      onClick: ({ key }) => onAddRows(Number(key)),
    }}
  >
    <Button type={type}>
      {label} <DownOutlined />
    </Button>
  </Dropdown>
);

export default StyleBomAddRowsDropdown;
