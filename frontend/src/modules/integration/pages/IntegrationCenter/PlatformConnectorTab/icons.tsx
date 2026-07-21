import React from 'react';
import { ApiOutlined, CloudOutlined, ShopOutlined } from '@ant-design/icons';

const IconMap: Record<string, React.ReactNode> = {
  cloud: <CloudOutlined />,
  shop: <ShopOutlined />,
  tb: <ApiOutlined />, dy: <ApiOutlined />, jd: <ApiOutlined />,
  tm: <ApiOutlined />, pdd: <ApiOutlined />, xhs: <ApiOutlined />,
  wx: <ApiOutlined />, sf: <ApiOutlined />,
};

export const renderIcon = (iconName: string): React.ReactNode => IconMap[iconName] || <ApiOutlined />;
