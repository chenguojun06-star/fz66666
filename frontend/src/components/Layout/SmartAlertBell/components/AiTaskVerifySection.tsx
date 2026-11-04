import React, { useCallback, useEffect, useState } from 'react';
import { Button, message, Tag } from 'antd';
import { CheckOutlined, RobotOutlined, StopOutlined } from '@ant-design/icons';
import { aiTaskApi, type AiVerifyTask } from '@/services/intelligence/aiTaskApi';

/**
 * AI 执行待验证任务 — D-914
 *
 * 背景：HighRiskAuditHook 每次写操作都会记一条 PENDING 任务，后端也有列表端点，
 * 但前端零调用方 —— 用户看不到「AI 刚做了什么」，24 小时后被过期扫描清掉。
 * 本组件在消息中心提供「已确认 / 无需处理」两个动作，收口「有列表无入口」。
 */

const TARGET_LABELS: Record<string, string> = {
  ORDER: '订单',
  FACTORY: '工厂',
  MATERIAL: '物料',
  PRODUCTION: '生产',
  STYLE: '款式',
  SYSTEM: '系统',
};

function formatTime(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const AiTaskVerifySection: React.FC = () => {
  const [items, setItems] = useState<AiVerifyTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await aiTaskApi.pending();
      setItems(list);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleComplete = async (id: number, note: string) => {
    setBusyId(id);
    try {
      await aiTaskApi.complete(id, note);
      message.success('已处理');
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      message.error(e instanceof Error ? e.message : '处理失败');
    } finally {
      setBusyId(null);
    }
  };

  if (loading || items.length === 0) return null;

  return (
    <div className="sap-section">
      <div className="sap-section-title">
        <RobotOutlined style={{ color: 'var(--color-accent-purple)' }} /> AI 执行待验证
        <span
          className="u-ml-8 u-fs-11 u-br-10"
          style={{ color: 'var(--color-accent-purple)', background: 'var(--status-info-bg)', padding: '1px 8px' }}
        >
          {items.length} 条
        </span>
      </div>
      {items.map((t) => (
        <div key={t.id} className="sap-insight-row" style={{ borderLeft: '3px solid var(--color-primary)' }}>
          <div className="u-flex-1" style={{ minWidth: 0 }}>
            <div className="u-fs-14 u-fw-600" style={{ color: 'var(--color-text-primary)', lineHeight: 1.4 }}>
              {t.taskSummary || t.taskSourceTool || 'AI 操作'}
            </div>
            <div className="u-fs-12 u-mt-2" style={{ color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {t.taskSourceTool && <Tag style={{ fontSize: 11, margin: 0 }}>{t.taskSourceTool}</Tag>}
              {t.targetId && (
                <span>
                  {TARGET_LABELS[t.targetType || ''] || t.targetType || '目标'} {t.targetId}
                </span>
              )}
              {t.assignedTo && <span>· {t.assignedTo}</span>}
              {t.createdAt && <span>· {formatTime(t.createdAt)}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <Button
              size="small"
              type="primary"
              icon={<CheckOutlined />}
              loading={busyId === t.id}
              onClick={() => void handleComplete(t.id, '用户已确认')}
            >
              已确认
            </Button>
            <Button
              size="small"
              icon={<StopOutlined />}
              disabled={busyId === t.id}
              onClick={() => void handleComplete(t.id, '用户确认无需处理')}
            >
              无需处理
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default AiTaskVerifySection;
