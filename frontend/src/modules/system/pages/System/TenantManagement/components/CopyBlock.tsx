import React from 'react';
import { Button, Tag } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { message } from '@/utils/antdStatic';

const CopyBlock: React.FC<{ code: string; lang?: string }> = ({ code, lang = '' }) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => message.success('已复制到剪贴板'));
  };
  return (
    <div className="u-pos-relative u-br-8 u-m-12px0 u-ov-auto" style={{ background: 'var(--color-bg-base)', padding: '16px 48px 16px 16px' }}>
      <Button icon={<CopyOutlined />} type="text" style={{ position: 'absolute', top: 8, right: 8, color: 'var(--color-text-quaternary)' }} onClick={handleCopy} />
      {lang && <Tag style={{ position: 'absolute', top: 8, left: 12, opacity: 0.7 }}>{lang}</Tag>}
      <pre style={{ color: 'var(--color-text-secondary)', margin: lang ? '24px 0 0 0' : 0, fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{code}</pre>
    </div>
  );
};

export default CopyBlock;
