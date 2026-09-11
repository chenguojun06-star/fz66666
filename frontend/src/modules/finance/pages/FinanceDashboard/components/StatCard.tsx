import React from 'react';
import { Card } from 'antd';
import styles from '../index.module.css';

interface StatCardProps {
  title: string;
  value: number;
  prefix?: string;
  color?: string;
  active?: boolean;
  onClick?: () => void;
  /** D-369：数值格式。money=金额（两位小数+¥），int=笔数/件数（整数、无货币符号） */
  format?: 'money' | 'int';
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  prefix = '¥',
  color,
  active,
  onClick,
  format = 'money',
}) => {
  const display = format === 'int'
    ? Number(value || 0).toLocaleString('zh-CN')
    : `${prefix}${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <Card
      className={styles.statCard}
      onClick={onClick}
      hoverable={!!onClick}
      style={active ? { borderColor: 'var(--color-primary)', borderWidth: 2 } : undefined}
    >
      <div className={styles.cardTitle}>{title}</div>
      <div className={styles.cardValue} style={color ? { color } : undefined}>
        {display}
      </div>
    </Card>
  );
};

export default StatCard;
