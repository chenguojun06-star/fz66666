import React, { useMemo } from 'react';
import { Button, Empty, Input, Timeline, Image, Tag } from 'antd';
import {
  HistoryOutlined,
  UserOutlined,
  ScanOutlined,
  ShoppingOutlined,
  ScissorOutlined,
} from '@ant-design/icons';
import { displayDate } from '@/utils/display';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { toTs } from '@/utils/timeline';
import type { OrderRemark } from '@/services/system/remarkApi';
import type { LinkNode } from '../hooks/useOrderLinkTimeline';

interface OperationLogTabContentProps {
  remarks: OrderRemark[];
  remarksLoading: boolean;
  newRemark: string;
  setNewRemark: (v: string) => void;
  handleAddRemark: () => void;
  /** 链路节点（扫码/采购/裁剪），与备注合并按时间倒序展示 */
  linkNodes?: LinkNode[];
  linkNodesLoading?: boolean;
}

const SYSTEM_ACTIONS = ['开始编辑', '完成编辑', '取消编辑', '从BOM生成采购', '从物料清单生成采购', '录入采购'];

/** 链路节点类型 → 图标 + 类型标签颜色 */
const LINK_TYPE_META: Record<
  string,
  { icon: React.ReactNode; label: string; tagColor: string }
> = {
  scan: { icon: <ScanOutlined />, label: '扫码', tagColor: 'blue' },
  purchase: { icon: <ShoppingOutlined />, label: '采购', tagColor: 'orange' },
  cutting: { icon: <ScissorOutlined />, label: '裁剪', tagColor: 'purple' },
};

/** 统一时间线项 */
interface UnifiedItem {
  key: string;
  ts: number;
  color: string;
  icon?: React.ReactNode;
  tag?: { label: string; color: string };
  author: string;
  operator?: string;
  timeDisplay: string;
  content: React.ReactNode;
  images?: string[];
}

const OperationLogTabContent: React.FC<OperationLogTabContentProps> = ({
  remarks,
  remarksLoading,
  newRemark,
  setNewRemark,
  handleAddRemark,
  linkNodes = [],
  linkNodesLoading = false,
}) => {
  const items = useMemo<UnifiedItem[]>(() => {
    const remarkItems: UnifiedItem[] = remarks.map((r) => {
      const isSystem = r.authorRole && SYSTEM_ACTIONS.includes(r.authorRole);
      const images = r.imageUrls
        ? (() => {
            try {
              return JSON.parse(r.imageUrls) as string[];
            } catch {
              return [];
            }
          })()
        : [];
      return {
        key: `remark-${r.id}`,
        ts: toTs(r.createTime),
        color: isSystem ? 'blue' : 'green',
        icon: isSystem ? <HistoryOutlined style={{ color: 'var(--color-primary)' }} /> : undefined,
        author: r.authorRole || r.authorName || '系统',
        operator: r.authorName,
        timeDisplay: displayDate(r.createTime, 'datetime'),
        content: r.content,
        images,
      };
    });

    const linkItems: UnifiedItem[] = linkNodes.map((n) => {
      const meta = LINK_TYPE_META[n.type] || LINK_TYPE_META.scan;
      return {
        key: n.id,
        ts: n.ts,
        color: n.color,
        icon: meta.icon,
        tag: { label: meta.label, color: meta.tagColor },
        author: n.title,
        operator: n.operator,
        timeDisplay: n.timeDisplay,
        content: n.detail,
      };
    });

    return [...remarkItems, ...linkItems].sort((a, b) => b.ts - a.ts);
  }, [remarks, linkNodes]);

  const loading = remarksLoading || linkNodesLoading;

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        <Input.TextArea
          value={newRemark}
          onChange={(e) => setNewRemark(e.target.value)}
          placeholder="添加备注..."
          autoSize={{ minRows: 3, maxRows: 8 }}
          maxLength={500}
          showCount
          style={{ flex: 1 }}
        />
        <Button type="primary" onClick={handleAddRemark} disabled={!newRemark.trim()}>
          添加
        </Button>
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-tertiary)' }}>加载中...</div>
      ) : items.length > 0 ? (
        <Timeline
          items={items.map((it) => ({
            color: it.color,
            dot: it.icon ? (
              <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>{it.icon}</span>
            ) : undefined,
            children: (
              <div key={it.key} style={{ paddingBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  {it.tag && <Tag color={it.tag.color} style={{ marginRight: 0 }}>{it.tag.label}</Tag>}
                  <strong>{it.author}</strong>
                  <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
                    {it.operator && (
                      <>
                        <UserOutlined /> {it.operator}
                      </>
                    )}
                  </span>
                  <span style={{ color: 'var(--color-text-quaternary)', fontSize: 12 }}>
                    {it.timeDisplay}
                  </span>
                </div>
                {it.content && (
                  <div style={{ color: 'var(--color-text-primary)' }}>{it.content}</div>
                )}
                {it.images && it.images.length > 0 && (
                  <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <Image.PreviewGroup>
                      {it.images.map((url: string, idx: number) => (
                        <Image
                          key={idx}
                          src={getFullAuthedFileUrl(url)}
                          style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 4, cursor: 'pointer' }}
                          preview={{ cover: '预览' }}
                        />
                      ))}
                    </Image.PreviewGroup>
                  </div>
                )}
              </div>
            ),
          }))}
        />
      ) : (
        <Empty description="暂无操作记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}
    </div>
  );
};

export default OperationLogTabContent;
