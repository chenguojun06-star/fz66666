import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Input, Button, Empty, Spin, App, Tag, Image, Drawer, Timeline, Alert } from 'antd';
import {
  UserOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  NodeIndexOutlined,
} from '@ant-design/icons';
import MultiImageUploadBox from './MultiImageUploadBox';
import { remarkApi } from '@/services/system/remarkApi';
import type { OrderRemark } from '@/services/system/remarkApi';
import { productionPatternApi } from '@/services/production/productionApi';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { toTs, displayTime } from '@/utils/timeline';

const { TextArea } = Input;

interface RemarkTimelineModalProps {
  open: boolean;
  onClose: () => void;
  targetType: 'order' | 'style' | 'pattern';
  targetNo: string;
  defaultRole?: string;
  canAddRemark?: boolean;
}

/** 样衣链路节点（来自后端 getPatternTimeline） */
interface PatternTimelineNode {
  node: string;
  time: string;
  operator?: string;
  durationHours?: number;
}

/** 统一时间线项（备注 + 链路节点合并） */
interface UnifiedItem {
  key: string;
  ts: number;
  isLink: boolean;
  author: string;
  operator?: string;
  timeDisplay: string;
  content: string;
  images?: string[];
  durationHours?: number;
}

const RemarkTimelineModal: React.FC<RemarkTimelineModalProps> = ({
  open,
  onClose,
  targetType,
  targetNo,
  defaultRole,
  canAddRemark = true,
}) => {
  const { message } = App.useApp();
  const [remarks, setRemarks] = useState<OrderRemark[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [content, setContent] = useState('');
  const [authorRole, setAuthorRole] = useState('');
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);

  // 样衣链路节点（仅 targetType === 'pattern' 时加载）
  const [patternNodes, setPatternNodes] = useState<PatternTimelineNode[]>([]);
  const [patternAnomalies, setPatternAnomalies] = useState<string[]>([]);
  const [patternLoading, setPatternLoading] = useState(false);

  const isPattern = targetType === 'pattern';

  const fetchRemarks = useCallback(async () => {
    if (!targetNo) return;
    setLoading(true);
    try {
      const res: any = await remarkApi.list({ targetType, targetNo });
      const list = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
      setRemarks(list);
    } catch {
      message.error('加载备注失败');
    } finally {
      setLoading(false);
    }
  }, [targetType, targetNo, message]);

  const fetchPatternTimeline = useCallback(async () => {
    if (!isPattern || !targetNo) {
      setPatternNodes([]);
      setPatternAnomalies([]);
      return;
    }
    setPatternLoading(true);
    try {
      const res: any = await productionPatternApi.getTimeline(targetNo);
      const data = res?.data || res;
      setPatternNodes(Array.isArray(data?.nodes) ? data.nodes : []);
      setPatternAnomalies(Array.isArray(data?.anomalies) ? data.anomalies : []);
    } catch {
      // 时间线加载失败不阻塞备注展示
      setPatternNodes([]);
      setPatternAnomalies([]);
    } finally {
      setPatternLoading(false);
    }
  }, [isPattern, targetNo]);

  useEffect(() => {
    if (open && targetNo) {
      fetchRemarks();
      fetchPatternTimeline();
      setContent('');
      setAuthorRole(defaultRole || '');
      setUploadedImages([]);
    }
  }, [open, targetNo, defaultRole, fetchRemarks, fetchPatternTimeline]);

  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (!trimmed && uploadedImages.length === 0) {
      message.warning('请输入备注内容或上传图片');
      return;
    }
    setSubmitting(true);
    try {
      await remarkApi.add({
        targetType,
        targetNo,
        authorRole: authorRole.trim() || undefined,
        content: trimmed || '(图片备注)',
        imageUrls: uploadedImages.length > 0 ? JSON.stringify(uploadedImages) : undefined,
      });
      message.success('备注已添加');
      setContent('');
      setAuthorRole(defaultRole || '');
      setUploadedImages([]);
      fetchRemarks();
    } catch {
      message.error('添加备注失败');
    } finally {
      setSubmitting(false);
    }
  };

  const parseImageUrls = (imageUrls?: string): string[] => {
    if (!imageUrls) return [];
    try {
      const parsed = JSON.parse(imageUrls);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  /** 合并备注 + 链路节点，按时间降序 */
  const unifiedItems = useMemo<UnifiedItem[]>(() => {
    const remarkItems: UnifiedItem[] = remarks.map((r) => ({
      key: `remark-${r.id}`,
      ts: toTs(r.createTime),
      isLink: false,
      author: r.authorName || '匿名',
      operator: r.authorRole,
      timeDisplay: r.createTime ? r.createTime.replace('T', ' ').substring(0, 16) : '',
      content: r.content,
      images: parseImageUrls(r.imageUrls),
    }));

    const linkItems: UnifiedItem[] = patternNodes.map((n, idx) => ({
      key: `link-${idx}-${n.node}`,
      ts: toTs(n.time),
      isLink: true,
      author: n.node,
      operator: n.operator,
      timeDisplay: displayTime(n.time),
      content: '',
      durationHours: n.durationHours,
    }));

    return [...remarkItems, ...linkItems].sort((a, b) => b.ts - a.ts);
  }, [remarks, patternNodes]);

  const title = targetType === 'order'
    ? `订单备注 — ${targetNo}`
    : isPattern
      ? `样衣备注日志 — ${targetNo}`
      : `款式备注 — ${targetNo}`;

  const totalLoading = loading || patternLoading;

  return (
    <Drawer
      title={title}
      open={open}
      onClose={onClose}
      placement="right"
      size="large"
      styles={{ wrapper: { width: '55vw' }, body: { padding: '16px 24px', display: 'flex', flexDirection: 'column', overflow: 'auto' } }}
      destroyOnHidden
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
        {/* 样衣异常提示（跟随模式：异常信息直接展示在备注日志顶部） */}
        {isPattern && patternAnomalies.length > 0 && (
          <Alert
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            message="链路异常"
            description={
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {patternAnomalies.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            }
          />
        )}

        {canAddRemark ? <div style={{ background: 'var(--color-bg-container)', padding: 12, borderRadius: 6 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <Input
              placeholder="你的角色/工序（可选，如：裁剪、车缝、质检）"
              value={authorRole}
              onChange={(e) => setAuthorRole(e.target.value)}
              style={{ flex: '0 0 200px' }}
              maxLength={50}
            />
            <Button type="primary" onClick={handleSubmit} loading={submitting}>
              提交备注
            </Button>
          </div>
          <TextArea
            placeholder="输入备注内容…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            maxLength={1000}
            showCount
          />
          <div style={{ marginTop: 8 }}>
            <MultiImageUploadBox
              value={uploadedImages}
              onChange={setUploadedImages}
              maxCount={5}
              maxSizeMB={5}
              accept="image/jpeg,image/png"
            />
          </div>
        </div> : null}

        <div style={{ flex: 1, overflow: 'auto', minHeight: 200 }}>
          <Spin spinning={totalLoading}>
            {unifiedItems.length === 0 && !totalLoading ? (
              <Empty description="暂无备注与链路记录" />
            ) : (
              <Timeline
                items={unifiedItems.map((it) => ({
                  color: it.isLink ? 'blue' : 'green',
                  dot: it.isLink ? (
                    <NodeIndexOutlined style={{ fontSize: 14, color: 'var(--color-primary)' }} />
                  ) : undefined,
                  children: (
                    <div
                      key={it.key}
                      style={{
                        padding: '10px 12px',
                        background: it.isLink ? 'var(--color-primary-light)' : 'var(--color-bg-base)',
                        border: '1px solid var(--color-border-light)',
                        borderRadius: 6,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {it.isLink && <Tag color="blue" style={{ marginRight: 0 }}>链路</Tag>}
                          <strong>{it.author}</strong>
                          {it.operator && (
                            <Tag style={{ marginLeft: 0 }}>
                              <UserOutlined /> {it.operator}
                            </Tag>
                          )}
                        </span>
                        <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <ClockCircleOutlined />
                          {it.timeDisplay}
                          {it.isLink && it.durationHours != null && it.durationHours > 0 && (
                            <span style={{ color: 'var(--color-text-quaternary)', marginLeft: 4 }}>
                              · 耗时{it.durationHours}h
                            </span>
                          )}
                        </span>
                      </div>
                      {it.content && (
                        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                          {it.content}
                        </div>
                      )}
                      {it.images && it.images.length > 0 && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                          <Image.PreviewGroup>
                            {it.images.map((url, idx) => (
                              <Image
                                key={idx}
                                src={getFullAuthedFileUrl(url)}
                                style={{ width: 320, height: 320, objectFit: 'cover', borderRadius: 4, cursor: 'pointer' }}
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
            )}
          </Spin>
        </div>
      </div>
    </Drawer>
  );
};

export default RemarkTimelineModal;
