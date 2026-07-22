import React from 'react';
import { Button } from 'antd';
import { QuickEntryConfig } from './quickEntryConfig';

interface QuickEntryCardProps {
  entries: QuickEntryConfig[];
  onOpenSettings: () => void;
}

const QuickEntryCard: React.FC<QuickEntryCardProps> = ({ entries, onOpenSettings }) => {
  return (
    <div className="dashboard-card">
      <div className="card-header">
        <h3 className="card-title">快捷入口</h3>
        <Button
          type="text"
          onClick={onOpenSettings}
          title="设置快捷入口"
          style={{ color: 'var(--color-text-tertiary)' }}
        />
      </div>
      <div className="card-content">
        <div className="quick-entry-grid">
          {entries
            .filter(entry => entry.enabled)
            .map(entry => (
              <a
                key={entry.id}
                href={entry.href}
                className={`quick-entry-item quick-entry-item--${entry.className}`}
              >
                <span className={`entry-icon entry-icon--${entry.className}`}>{entry.icon}</span>
                <span className="entry-label">{entry.label}</span>
              </a>
            ))
          }
        </div>
      </div>
    </div>
  );
};

export default QuickEntryCard;
