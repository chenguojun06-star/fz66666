import React from 'react';
import { Space } from 'antd';
import './StandardToolbar.css';

export interface StandardToolbarProps {
  left: React.ReactNode;
  right?: React.ReactNode;
}

const StandardToolbar: React.FC<StandardToolbarProps> = ({ left, right }) => {
  return (
    <div className="standard-toolbar">
      <div className="standard-toolbar-left">{left}</div>
      {right ? (
        <div className="standard-toolbar-right">
          <Space wrap>{right}</Space>
        </div>
      ) : null}
    </div>
  );
};

export default StandardToolbar;
