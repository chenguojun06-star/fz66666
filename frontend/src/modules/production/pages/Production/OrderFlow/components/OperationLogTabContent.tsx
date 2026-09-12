import React, { useMemo } from 'react';
import { Button, Empty, Input, Table, Image, Tag } from 'antd';
import {
  HistoryOutlined,
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
          rows={3}
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
        // D-362d：对齐全站日志标准四列（操作时间/操作类型/操作内容/操作人）——替换旧时间线
        <Table
          size="small"
          rowKey="key"
          dataSource={items}
          pagination={false}
          columns={[
            { title: '操作时间', dataIndex: 'timeDisplay', key: 'time', width: 150, render: (v: string) => <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>{v}</span> },
            { title: '操作类型', key: 'type', width: 130, render: (_: unknown, it: UnifiedItem) => it.tag
                ? <Tag color={it.tag.color} style={{ marginRight: 0 }}>{it.tag.label}</Tag>
                : <span style={{ fontWeight: 500 }}>{it.author}</span> },
            { title: '操作内容', key: 'content', render: (_: unknown, it: UnifiedItem) => (
              <div>
                {it.content && <div style={{ wordBreak: 'break-all' }}>{it.content}</div>}
                {it.images && it.images.length > 0 && (
                  <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <Image.PreviewGroup>
                      {it.images.map((url: string, idx: number) => (
                        <Image
                          key={idx}
                          src={getFullAuthedFileUrl(url)}
                          style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 4, cursor: 'pointer' }}
                          preview={{ cover: '预览' }}
                        />
                      ))}
                    </Image.PreviewGroup>
                  </div>
                )}
              </div>
            ) },
            { title: '操作人', key: 'operator', width: 110, render: (_: unknown, it: UnifiedItem) => it.operator || it.author || '-' },
          ]}
        />
      ) : (
        <Empty description="暂无操作记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}
    </div>
  );
};

export default OperationLogTabContent;
