import React from 'react';
import './XiaoyunCard.css';

interface XiaoyunCardProps {
  level?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  icon?: React.ReactNode;
  extra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  compact?: boolean;
}

const XiaoyunCard: React.FC<XiaoyunCardProps> = ({
  level = 'info',
  title,
  icon,
  extra,
  children,
  className = '',
  onClick,
  compact = false,
}) => {
  return (
    <div
      className={`xy-card xy-card--${level} ${compact ? 'xy-card--compact' : ''} ${onClick ? 'xy-card--clickable' : ''} ${className}`}
      onClick={onClick}
    >
      {(title || icon || extra) && (
        <div className="xy-card__header">
          <div className="xy-card__title-row">
            {icon && <span className="xy-card__icon">{icon}</span>}
            {title && <span className="xy-card__title">{title}</span>}
          </div>
          {extra && <div className="xy-card__extra">{extra}</div>}
        </div>
      )}
      <div className="xy-card__body">{children}</div>
    </div>
  );
};

export const LevelIcon: Record<string, string> = {
  info: '💡',
  success: '✅',
  warning: '⚠️',
  danger: '🚨',
};

export default XiaoyunCard;
