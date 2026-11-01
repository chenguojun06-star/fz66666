import React, { useCallback, useEffect, useState } from 'react';
import { Button, message, Tag } from 'antd';
import { BulbOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { memoryNudgeApi, type MemoryNudgeItem } from '@/services/intelligence/memoryNudgeApi';

/**
 * 记忆提醒（MemoryNudge）响应入口 — D-912
 *
 * 背景：MemoryNudgeOrchestrator 生成的记忆提醒只有 PENDING 状态，生产 5 条挂起无入口。
 * 本组件在消息中心提供采纳/忽略按钮，收口"有端点无入口"。
 */
const MemoryNudgeSection: React.FC = () => {
  const [items, setItems] = useState<MemoryNudgeItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await memoryNudgeApi.pending();
      setItems(Array.isArray(list) ? list : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAccept = async (id: string) => {
    try {
      await memoryNudgeApi.accept(id);
      message.success('已采纳');
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (e: any) {
      message.error(e?.message || '采纳失败');
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      await memoryNudgeApi.dismiss(id);
      message.success('已忽略');
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (e: any) {
      message.error(e?.message || '忽略失败');
    }
  };

  if (loading || items.length === 0) return null;

  return (
    <div className="sap-section">
      <div className="sap-section-title">
        <BulbOutlined style={{ color: 'var(--color-accent-purple)' }} /> 记忆提醒
        <span className="u-ml-8 u-fs-11 u-br-10" style={{ color: 'var(--color-accent-purple)', background: 'var(--status-info-bg)', padding: '1px 8px' }}>
          {items.length} 条待处理
        </span>
      </div>
      {items.map((n) => (
        <div key={n.id} className="sap-insight-row" style={{ borderLeft: '3px solid var(--color-accent-purple)' }}>
          <div className="u-flex-1" style={{ minWidth: 0 }}>
            <div className="u-fs-14 u-fw-600" style={{ color: 'var(--color-text-primary)', lineHeight: 1.4 }}>
              {n.title || '记忆提醒'}
            </div>
            {n.content && (
              <div className="u-fs-13 u-mt-2 u-ws-pre-wrap" style={{ color: 'var(--color-text-secondary)' }}>
                {n.content}
              </div>
            )}
            {n.confidence != null && (
              <Tag style={{ marginTop: 4, fontSize: 11 }}>置信度 {(n.confidence * 100).toFixed(0)}%</Tag>
            )}
          </div>
          <div className="u-d-flex u-gap-4 u-fshrink-0">
            <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleAccept(n.id)}>
              采纳
            </Button>
            <Button size="small" icon={<CloseOutlined />} onClick={() => handleDismiss(n.id)}>
              忽略
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default MemoryNudgeSection;
