import React from 'react';
import msgStyles from './MessageBubble.module.css';

interface PendingItemsSectionProps {
  items: any[];
  onDismiss: (id: string, e: React.MouseEvent) => void;
  onNavigate: (path: string) => void;
  onOpenTaskList: () => void;
}

const PendingItemsSection: React.FC<PendingItemsSectionProps> = ({
  items, onDismiss, onNavigate, onOpenTaskList,
}) => {
  if (items.length === 0) return null;

  return (
    <div className={msgStyles.pendingItems}>
      {items.slice(0, 6).map((item: any) => {
        const isPendingTask = !!item.taskType;
        const dl = item.daysLeft;
        const status = dl !== undefined
          ? (dl < 0 ? `已逾期${Math.abs(dl)}天` : dl === 0 ? '今天到期' : `剩${dl}天`)
          : (item.categoryLabel || item.taskType || '');
        const navPath = isPendingTask && item.deepLinkPath
          ? (() => {
              let p = item.deepLinkPath;
              const params: string[] = [];
              if (item.orderNo) params.push(`orderNo=${encodeURIComponent(item.orderNo)}`);
              if (item.styleNo) params.push(`styleNo=${encodeURIComponent(item.styleNo)}`);
              if (params.length) p += (p.includes('?') ? '&' : '?') + params.join('&');
              return p;
            })()
          : `/production/order-flow?orderNo=${encodeURIComponent(item.orderNo || '')}`;
        return (
          <div key={item.id || item.orderNo} className={msgStyles.pendingItem} style={{position:'relative'}}
            onClick={() => onNavigate(navPath)}
          >
            <span>{item.categoryIcon || '⚠️'}</span>
            <span style={{flex:1}}>
              {isPendingTask
                ? `${item.title}${item.description ? ' — ' + item.description : ''}`
                : `${item.orderNo}${item.styleNo ? `（${item.styleNo}）` : ''} — ${status}，进度${item.progress}%`
              }
            </span>
            <span style={{color:'var(--xiaoyun-primary)',fontSize:13}}>查看 →</span>
            <button
              className={msgStyles.pendingDismissBtn}
              onClick={(e) => onDismiss(item.id || item.orderNo, e)}
              title="今日不再提醒"
            >×</button>
          </div>
        );
      })}
      {items.length > 6 && (
        <div className={msgStyles.pendingMoreBtn} onClick={onOpenTaskList}>
          还有 {items.length - 6} 项待办，查看全部 →
        </div>
      )}
    </div>
  );
};

export default React.memo(PendingItemsSection);
