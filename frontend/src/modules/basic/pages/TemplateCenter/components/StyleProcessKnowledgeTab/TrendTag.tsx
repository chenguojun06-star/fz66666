import React from 'react';
import { Tag } from 'antd';
import { RiseOutlined, FallOutlined, MinusOutlined } from '@ant-design/icons';

const TrendTag: React.FC<{ trend?: string }> = ({ trend }) => {
  if (!trend) return <span>-</span>;
  if (trend === 'UP')
    return (
      <Tag icon={<RiseOutlined />} color="volcano">
        上涨
      </Tag>
    );
  if (trend === 'DOWN')
    return (
      <Tag icon={<FallOutlined />} color="cyan">
        下降
      </Tag>
    );
  return (
    <Tag icon={<MinusOutlined />} color="default">
      平稳
    </Tag>
  );
};

export default TrendTag;
