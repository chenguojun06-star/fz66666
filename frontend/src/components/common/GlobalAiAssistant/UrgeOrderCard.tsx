import React from 'react';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { ActionCard } from './types';
import styles from './index.module.css';

/** 催单内联编辑卡片 — 跟单员/老板直接在 AI 对话中填写出货日期和备注 */
const UrgeOrderCard: React.FC<{ card: ActionCard; onSaved: () => void }> = ({ card, onSaved }) => {
  const [shipDate, setShipDate] = React.useState(card.currentExpectedShipDate ?? '');
  const [remarks, setRemarks] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleSubmit = async () => {
    if (!card.orderNo) return;
    setSaving(true);
    setError('');
    try {
      await intelligenceApi.quickEditOrder({
        orderNo: card.orderNo,
        expectedShipDate: shipDate || undefined,
        remarks: remarks || undefined,
        urgencyLevel: 'urgent',
      });
      setSaved(true);
      onSaved();
    } catch (e) {
      setError((e as Error).message || '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <div className={styles.urgeCardSaved}>
        ✅ 已更新订单 <strong>{card.orderNo}</strong> 的出货日期与备注，感谢配合！
      </div>
    );
  }

  return (
    <div className={styles.urgeOrderCard}>
      <div className={styles.urgeCardHeader}>
        📦 催单通知 — <strong>{card.orderNo}</strong>
        {card.factoryName && <span className={styles.urgeCardFactory}> · {card.factoryName}</span>}
      </div>
      {card.responsiblePerson && (
        <div className={styles.urgeCardPerson}>负责人：{card.responsiblePerson}</div>
      )}
      <div className={styles.urgeCardDesc}>{card.desc ?? '请填写最新预计出货日期和备注，以便跟进。'}</div>
      <div className={styles.urgeCardForm}>
        <label className={styles.urgeFormLabel}>预计出货日期</label>
        <input
          type="date"
          className={styles.urgeFormInput}
          value={shipDate}
          onChange={e => setShipDate(e.target.value)}
        />
        <label className={styles.urgeFormLabel}>备注说明</label>
        <textarea
          className={styles.urgeFormTextarea}
          placeholder="例如：面料延误 / 预计下周一交货..."
          value={remarks}
          rows={2}
          onChange={e => setRemarks(e.target.value)}
        />
        {error && <div className={styles.urgeCardError}>{error}</div>}
        <button
          className={styles.urgeSubmitBtn}
          onClick={() => { void handleSubmit(); }}
          disabled={saving || (!shipDate && !remarks)}
        >
          {saving ? '保存中…' : '✅ 确认提交'}
        </button>
      </div>
    </div>
  );
};

export default UrgeOrderCard;
