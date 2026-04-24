import React from 'react';
import type { ActionCard } from './types';
import UrgeOrderCard from './UrgeOrderCard';
import styles from './ActionCardWidget.module.css';
import sharedStyles from './index.module.css';

const ActionCardWidget: React.FC<{
  card: ActionCard;
  onAction: (type: string, path?: string, orderId?: string) => void;
  onUrgeOrderSaved?: () => void;
}> = ({ card, onAction, onUrgeOrderSaved }) => {
  // 如果是催单卡片，走专用组件
  if (card.actions.some(a => a.type === 'urge_order')) {
    return <UrgeOrderCard card={card} onSaved={onUrgeOrderSaved ?? (() => { /* no-op */ })} />;
  }
  const actionTypes = card.actions.map(a => a.type);
  const urgencyCls = actionTypes.includes('mark_urgent')
    ? styles.cardUrgent
    : actionTypes.includes('send_notification')
    ? styles.cardWarning
    : actionTypes.includes('remove_urgent')
    ? styles.cardNormal
    : '';
  return (
    <div className={`${styles.actionCard} ${urgencyCls}`}>
      <div className={styles.actionCardTitle}>⚡ {card.title}</div>
      {card.desc && <div className={styles.actionCardDesc}>{card.desc}</div>}
      <div className={styles.actionCardBtns}>
        {card.actions.map((action, i) => (
          <button
            key={i}
            className={`${sharedStyles.actionBtn} ${action.type === 'mark_urgent' ? sharedStyles.actionBtnDanger : sharedStyles.actionBtnPrimary}`}
            onClick={() => onAction(action.type, action.path, card.orderId)}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ActionCardWidget;
