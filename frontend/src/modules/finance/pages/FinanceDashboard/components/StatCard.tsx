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
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  prefix = '¥',
  color,
  active,
  onClick,
}) => (
  <Card
    className={styles.statCard}
    onClick={onClick}
    hoverable={!!onClick}
    style={active ? { borderColor: 'var(--color-primary)', borderWidth: 2 } : undefined}
  >
    <div className={styles.cardTitle}>{title}</div>
    <div className={styles.cardValue} style={color ? { color } : undefined}>
      {prefix}
      {value.toLocaleString()}
    </div>
  </Card>
);

export default StatCard;
