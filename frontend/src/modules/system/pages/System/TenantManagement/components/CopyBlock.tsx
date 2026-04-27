import React from 'react';
import { Button, Tag } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { message } from '@/utils/antdStatic';

const CopyBlock: React.FC<{ code: string; lang?: string }> = ({ code, lang = '' }) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => message.success('已复制到剪贴板'));
  };
  return (
    <div style={{ position: 'relative', background: 'var(--color-bg-base)', borderRadius: 8, padding: '16px 48px 16px 16px', margin: '12px 0', overflow: 'auto' }}>
      <Button icon={<CopyOutlined />} size="small" type="text" style={{ position: 'absolute', top: 8, right: 8, color: '#aaa' }} onClick={handleCopy} />
      {lang && <Tag style={{ position: 'absolute', top: 8, left: 12, opacity: 0.7 }}>{lang}</Tag>}
      <pre style={{ color: 'var(--color-text-secondary)', margin: lang ? '24px 0 0 0' : 0, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{code}</pre>
    </div>
  );
};

export default CopyBlock;
