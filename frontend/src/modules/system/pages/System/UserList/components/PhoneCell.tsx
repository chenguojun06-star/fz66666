import React, { useState } from 'react';
import { Button, Typography } from 'antd';
import { EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';

const { Text } = Typography;

/** 手机号脱敏显示（默认 138****5621，点击眼睛图标切换明文） */
const maskPhone = (phone: string) => {
  if (phone.length >= 7) {
    return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
  }
  return phone;
};

interface PhoneCellProps {
  phone?: string;
}

const PhoneCell: React.FC<PhoneCellProps> = ({ phone }) => {
  const [visible, setVisible] = useState(false);

  if (!phone) return <Text type="secondary">-</Text>;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <Text style={{ fontVariantNumeric: 'tabular-nums' }}>
        {visible ? phone : maskPhone(phone)}
      </Text>
      <Button
        type="text"
        size="small"
        icon={visible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? '隐藏完整手机号' : '查看完整手机号'}
        title={visible ? '隐藏完整手机号' : '查看完整手机号'}
        style={{ padding: '0 2px', color: 'var(--color-text-tertiary, #8c8c8c)' }}
      />
    </span>
  );
};

export default PhoneCell;
