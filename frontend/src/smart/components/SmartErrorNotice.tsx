import React from 'react';
import { Alert, Button, Space } from 'antd';
import { SmartErrorInfo } from '../core/types';

interface SmartErrorNoticeProps {
  error: SmartErrorInfo;
  onFix?: () => void;
}

const SmartErrorNotice: React.FC<SmartErrorNoticeProps> = ({ error, onFix }) => {
  const description = (
    <Space orientation="vertical" size={4}>
      {error.reason ? <span>原因：{error.reason}</span> : null}
      {error.code ? <span>错误码：{error.code}</span> : null}
      {error.actionText && onFix ? (
        <Button type="primary" onClick={onFix}>
          {error.actionText}
        </Button>
      ) : null}
    </Space>
  );

  return <Alert type="warning" showIcon title={error.title} description={description} />;
};

export default SmartErrorNotice;
