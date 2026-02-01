import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { App, Button, Input, Modal, Space, Tag } from 'antd';
import api from '@/utils/api';
import { isSupervisorOrAboveUser, useAuth } from '@/utils/AuthContext';
import { formatDateTime } from '@/utils/datetime';
import type { StyleAttachment } from '@/types/style';
import StyleAttachmentTab from './StyleAttachmentTab';

interface Props {
  styleId: string | number;
  patternStatus?: string;
  patternStartTime?: string;
  patternCompletedTime?: string;
  patternAssignee?: string;
  readOnly?: boolean;
  onRefresh: () => void;
}

const StylePatternTab: React.FC<Props> = ({
  styleId,
  patternStatus,
  patternStartTime,
  patternCompletedTime,
  patternAssignee,
  readOnly,
  onRefresh,
}) => {
  const { message, modal } = App.useApp();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [sectionKey, setSectionKey] = useState<'files'>('files');
  const [patternFiles, setPatternFiles] = useState<StyleAttachment[]>([]);
  const [patternCheckResult, setPatternCheckResult] = useState<{ complete: boolean; missingItems: string[] } | null>(null);

  // 检查纸样是否齐全
  const checkPatternComplete = useCallback(async () => {
    try {
      const res = await api.get<{ code: number; data: { complete: boolean; missingItems: string[] } }>('/style/attachment/pattern/check', { params: { styleId } });
      if (res.code === 200) {
        setPatternCheckResult(res.data);
      }
    } catch {
    // Intentionally empty
      // 忽略错误
      // ignore
    }
  }, [styleId]);

  useEffect(() => {
    checkPatternComplete();
  }, [checkPatternComplete, patternFiles]);

  const status = useMemo(() => String(patternStatus || '').trim().toUpperCase(), [patternStatus]);
  const locked = useMemo(() => status === 'COMPLETED', [status]);
  const childReadOnly = useMemo(() => Boolean(readOnly) || locked, [readOnly, locked]);

  const canRollback = useMemo(() => isSupervisorOrAboveUser(user), [user]);

  const statusTag = useMemo(() => {
    if (status === 'COMPLETED') return <Tag color="default">已完成</Tag>;
    if (status === 'IN_PROGRESS') return <Tag color="success">开发中</Tag>;
    return <Tag>未开始</Tag>;
  }, [status]);

  const startTimeText = useMemo(() => {
    return formatDateTime(patternStartTime);
  }, [patternStartTime]);

  const completedTimeText = useMemo(() => {
    return formatDateTime(patternCompletedTime);
  }, [patternCompletedTime]);

  const hasValidPatternFile = useMemo(() => {
    const list = Array.isArray(patternFiles) ? patternFiles : [];
    return list.some((f) => {
      const name = String((f as Record<string, unknown>)?.fileName || '').toLowerCase();
      const url = String((f as Record<string, unknown>)?.fileUrl || '').toLowerCase();
      return (
        name.endsWith('.dxf') ||
        name.endsWith('.plt') ||
        name.endsWith('.ets') ||
        url.includes('.dxf') ||
        url.includes('.plt') ||
        url.includes('.ets')
      );
    });
  }, [patternFiles]);



  const call = async (url: string, body?: any) => {
    setSaving(true);
    try {
      const res = await api.post(url, body);
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        message.success('操作成功');
        onRefresh();
        return;
      }
      message.error(result.message || '操作失败');
    } catch {
    // Intentionally empty
      // 忽略错误
      message.error('操作失败');
    } finally {
      setSaving(false);
    }
  };

  const openMaintenance = () => {
    let reason = '';
    modal.confirm({
      title: '维护',
      content: (
        <div>
          <div style={{ marginBottom: 12, fontWeight: 600 }}>维护原因</div>
          <Input.TextArea
            placeholder="请输入维护原因"
            autoSize={{ minRows: 3, maxRows: 6 }}
            maxLength={200}
            showCount
            onChange={(e) => {
              reason = String(e?.target?.value || '');
            }}
          />
        </div>
      ),
      okText: '确认维护',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const remark = String(reason || '').trim();
        if (!remark) {
          message.error('请输入维护原因');
          return Promise.reject(new Error('请输入维护原因'));
        }
        await call(`/style/info/${styleId}/pattern/reset`, { reason: remark });
      },
    });
  };

  return (
    <div>
      {/* 状态栏 - 与BOM/工序保持一致的样式 */}
      <div style={{
        marginBottom: 16,
        padding: '12px 16px',
        background: '#f5f5f5',
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#666' }}>纸样状态：</span>
            {statusTag}
          </div>
          <span style={{ color: '#666' }}>
            领取人：<span style={{ color: '#333', fontWeight: 500 }}>{patternAssignee || '-'}</span>
          </span>
          <span style={{ color: '#666' }}>
            开始时间：<span style={{ color: '#333', fontWeight: 500 }}>{startTimeText}</span>
          </span>
          <span style={{ color: '#666' }}>
            完成时间：<span style={{ color: '#333', fontWeight: 500 }}>{completedTimeText}</span>
          </span>
          {/* 纸样齐全检查提示 */}
          {patternCheckResult && !patternCheckResult.complete && (
            <span style={{
              fontSize: '12px',
              color: '#faad14',
              backgroundColor: '#fffbe6',
              border: '1px solid #ffe58f',
              padding: '2px 8px',
              borderRadius: '4px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              ⚠️ 缺少: {patternCheckResult.missingItems.join('、')}
            </span>
          )}
        </div>

        <Space size={8} wrap>
          {locked ? (
            <>
              {canRollback && (
                <Button size="small" danger loading={saving} onClick={openMaintenance}>维护</Button>
              )}
            </>
          ) : (
            <>
              {!patternStartTime && !patternCompletedTime && (
                <Button type="primary" size="small" loading={saving} onClick={() => call(`/style/info/${styleId}/pattern/start`)}>开始纸样开发</Button>
              )}
              {patternStartTime && !patternCompletedTime && (
                <Button
                  size="small"
                  type="primary"
                  loading={saving}
                  disabled={!hasValidPatternFile}
                  onClick={() => {
                    if (!hasValidPatternFile) {
                      message.error('请先上传纸样文件（dxf/plt/ets）');
                      return;
                    }
                    call(`/style/info/${styleId}/pattern/complete`);
                  }}
                >
                  标记完成
                </Button>
              )}
              {canRollback && (
                <Button size="small" danger loading={saving} onClick={openMaintenance}>维护</Button>
              )}
              {!hasValidPatternFile && patternStartTime && (
                <span style={{ color: '#999', fontSize: '12px' }}>
                  需先上传纸样(dxf/plt/ets)
                </span>
              )}
            </>
          )}
        </Space>
      </div>

      {/* 纸样文件上传区域 */}
      <div style={{ marginTop: 16 }}>
        <StyleAttachmentTab
          styleId={styleId}
          bizType="pattern"
          uploadText="上传纸样文件"
          readOnly={childReadOnly}
          onListChange={setPatternFiles}
        />
      </div>
    </div>
  );
};

export default StylePatternTab;
