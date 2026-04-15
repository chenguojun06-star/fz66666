import { memo } from 'react';

const EmptyState = memo(function EmptyState({ icon = '📋', title = '暂无数据', desc }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <div className="empty-state-title">{title}</div>
      {desc && <div className="empty-state-desc">{desc}</div>}
    </div>
  );
});

export default EmptyState;
