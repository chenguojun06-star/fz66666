import React from 'react';
import { Button, Space } from 'antd';
import { PlusOutlined, ClockCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

interface Props {
  hasOverdue?: boolean;
  hasError?: boolean;
}

const QuickActionBar: React.FC<Props> = ({ hasOverdue = false, hasError = false }) => {
  const navigate = useNavigate();

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 0', flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: 12, color: 'var(--neutral-text-tertiary)', fontWeight: 500, letterSpacing: 0.5 }}>
        快捷操作
      </span>
      <Space size={8} wrap>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => navigate('/production?openCreate=true')}
          ghost
        >
          创建订单
        </Button>
        {hasOverdue && (
          <Button
            icon={<ClockCircleOutlined />}
            onClick={() => navigate('/production?filter=overdue')}
            style={{ color: '#cf1322', borderColor: '#ffccc7' }}
          >
            查看逾期
          </Button>
        )}
        {hasError && (
          <Button
            icon={<WarningOutlined />}
            onClick={() => navigate('/production?filter=behind')}
            danger
          >
            今日异常
          </Button>
        )}
      </Space>
    </div>
  );
};

export default QuickActionBar;