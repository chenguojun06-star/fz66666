import React from 'react';
import { Alert, Button, Space, Tag } from 'antd';
import { SmartHintItem } from '../core/types';

interface SmartGuideBarProps {
  stage: string;
  nextStep?: string;
  pendingCount?: number;
  hints?: SmartHintItem[];
  onAction?: (item: SmartHintItem) => void;
}

const colorByLevel = (level?: SmartHintItem['level']) => {
  if (level === 'high') return 'error';
  if (level === 'medium') return 'warning';
  return 'default';
};

const SmartGuideBar: React.FC<SmartGuideBarProps> = ({
  stage,
  nextStep,
  pendingCount = 0,
  hints = [],
  onAction,
}) => {
  const title = `${stage} · 下一步：${nextStep || '继续当前流程'}`;
  const description = (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <div>待处理项：{pendingCount}</div>
      {hints.map((item) => (
        <Space key={item.key} size={8} wrap>
          <Tag color={colorByLevel(item.level)}>{item.level || 'low'}</Tag>
          <span>{item.title}</span>
          {item.actionText ? (
            <Button size="small" type="link" onClick={() => onAction?.(item)}>
              {item.actionText}
            </Button>
          ) : null}
        </Space>
      ))}
    </Space>
  );

  return <Alert type="info" showIcon message={title} description={description} />;
};

export default SmartGuideBar;
