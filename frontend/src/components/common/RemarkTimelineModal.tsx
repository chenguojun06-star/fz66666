import React, { useState, useEffect, useCallback } from 'react';
import { Input, Button, Empty, Spin, App, Tag } from 'antd';
import ResizableModal from './ResizableModal';
import { remarkApi } from '@/services/system/remarkApi';
import type { OrderRemark } from '@/services/system/remarkApi';

const { TextArea } = Input;

interface RemarkTimelineModalProps {
  open: boolean;
  onClose: () => void;
  targetType: 'order' | 'style';
  targetNo: string;
}

/**
 * 通用备注弹窗 — 按订单号(大货)/款号(样衣开发) 收集各节点人员的备注
 */
const RemarkTimelineModal: React.FC<RemarkTimelineModalProps> = ({
  open,
  onClose,
  targetType,
  targetNo,
}) => {
  const { message } = App.useApp();
  const [remarks, setRemarks] = useState<OrderRemark[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [content, setContent] = useState('');
  const [authorRole, setAuthorRole] = useState('');

  const fetchRemarks = useCallback(async () => {
    if (!targetNo) return;
    setLoading(true);
    try {
      const res = await remarkApi.list({ targetType, targetNo });
      setRemarks(Array.isArray(res) ? res : []);
    } catch {
      message.error('加载备注失败');
    } finally {
      setLoading(false);
    }
  }, [targetType, targetNo, message]);

  useEffect(() => {
    if (open && targetNo) {
      fetchRemarks();
      setContent('');
      setAuthorRole('');
    }
  }, [open, targetNo, fetchRemarks]);

  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (!trimmed) {
      message.warning('请输入备注内容');
      return;
    }
    setSubmitting(true);
    try {
      await remarkApi.add({
        targetType,
        targetNo,
        authorRole: authorRole.trim() || undefined,
        content: trimmed,
      });
      message.success('备注已添加');
      setContent('');
      setAuthorRole('');
      fetchRemarks();
    } catch {
      message.error('添加备注失败');
    } finally {
      setSubmitting(false);
    }
  };

  const title = targetType === 'order' ? `订单备注 — ${targetNo}` : `款式备注 — ${targetNo}`;

  return (
    <ResizableModal
      title={title}
      open={open}
      onCancel={onClose}
      width="40vw"
      footer={null}
      destroyOnClose
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
        {/* 输入区 */}
        <div style={{ background: '#fafafa', padding: 12, borderRadius: 6 }}>
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
        </div>

        {/* 备注列表 */}
        <div style={{ flex: 1, overflow: 'auto', minHeight: 200 }}>
          <Spin spinning={loading}>
            {remarks.length === 0 && !loading ? (
              <Empty description="暂无备注" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {remarks.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      padding: '10px 12px',
                      background: '#fff',
                      border: '1px solid #f0f0f0',
                      borderRadius: 6,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span>
                        <strong>{r.authorName || '匿名'}</strong>
                        {r.authorRole && (
                          <Tag color="blue" style={{ marginLeft: 8 }}>{r.authorRole}</Tag>
                        )}
                      </span>
                      <span style={{ color: '#999', fontSize: 12 }}>
                        {r.createTime ? r.createTime.replace('T', ' ').substring(0, 16) : ''}
                      </span>
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {r.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Spin>
        </div>
      </div>
    </ResizableModal>
  );
};

export default RemarkTimelineModal;
