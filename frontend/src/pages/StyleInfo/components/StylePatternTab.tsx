import React, { useEffect, useMemo, useState } from 'react';
import { Button, Space, Tabs, Tag, message } from 'antd';
import api from '../../../utils/api';
import { useAuth } from '../../../utils/authContext';
import { formatDateTime } from '../../../utils/datetime';
import type { StyleAttachment } from '../../../types/style';
import StyleAttachmentTab from './StyleAttachmentTab';
import StyleSizeTab from './StyleSizeTab';
import StyleProcessTab from './StyleProcessTab';

interface Props {
  styleId: string | number;
  patternStatus?: string;
  patternStartTime?: string;
  patternCompletedTime?: string;
  activeSectionKey?: 'files' | 'size' | 'process';
  onRefresh: () => void;
}

const StylePatternTab: React.FC<Props> = ({
  styleId,
  patternStatus,
  patternStartTime,
  patternCompletedTime,
  activeSectionKey,
  onRefresh,
}) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [sectionKey, setSectionKey] = useState<'files' | 'size' | 'process'>(activeSectionKey || 'files');
  const [patternFiles, setPatternFiles] = useState<StyleAttachment[]>([]);

  useEffect(() => {
    if (!activeSectionKey) return;
    setSectionKey(activeSectionKey);
  }, [activeSectionKey]);

  const status = useMemo(() => String(patternStatus || '').trim().toUpperCase(), [patternStatus]);
  const locked = useMemo(() => status === 'COMPLETED', [status]);

  const canRollback = useMemo(() => {
    const role = String((user as any)?.role || '').trim();
    if (!role) return false;
    if (role === '1') return true;
    const lower = role.toLowerCase();
    return lower.includes('admin') || lower.includes('manager') || lower.includes('supervisor') || role.includes('主管') || role.includes('管理员');
  }, [user]);

  const statusTag = useMemo(() => {
    if (status === 'COMPLETED') return <Tag color="green">已完成</Tag>;
    if (status === 'IN_PROGRESS') return <Tag color="gold">开发中</Tag>;
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
      const name = String((f as any)?.fileName || '').toLowerCase();
      const url = String((f as any)?.fileUrl || '').toLowerCase();
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
      const result = res as any;
      if (result.code === 200) {
        message.success('操作成功');
        onRefresh();
        return;
      }
      message.error(result.message || '操作失败');
    } catch {
      message.error('操作失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
        <Space size="large" wrap>
          <span>纸样状态：</span>
          {statusTag}
          <span>开始时间：{startTimeText}</span>
          <span>完成时间：{completedTimeText}</span>
        </Space>

        <Space size="large" wrap>
          {locked ? (
            <>
              <Tag color="green">已完成</Tag>
              <span style={{ color: 'var(--neutral-text-lighter)' }}>无法操作</span>
              {canRollback ? (
                <Button danger loading={saving} onClick={() => call(`/style/info/${styleId}/pattern/reset`, { reason: '维护' })}>维护</Button>
              ) : null}
            </>
          ) : (
            <>
              <Button loading={saving} onClick={() => call(`/style/info/${styleId}/pattern/start`)}>纸样开发</Button>
              <Button
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
              {canRollback ? (
                <Button danger loading={saving} onClick={() => call(`/style/info/${styleId}/pattern/reset`, { reason: '维护' })}>维护</Button>
              ) : null}
              {!hasValidPatternFile ? <span style={{ color: 'var(--neutral-text-lighter)' }}>需先上传纸样(dxf/plt/ets)</span> : null}
            </>
          )}
        </Space>
      </div>

      <Tabs
        activeKey={sectionKey}
        onChange={(k) => setSectionKey(k as any)}
        items={[
          {
            key: 'files',
            label: '纸样文件',
            children: (
              <StyleAttachmentTab
                styleId={styleId}
                bizType="pattern"
                uploadText="上传纸样文件"
                readOnly={locked}
                onListChange={setPatternFiles}
              />
            ),
          },
          {
            key: 'size',
            label: '尺寸表',
            children: <StyleSizeTab styleId={styleId} readOnly={locked} />,
          },
          {
            key: 'process',
            label: '工序表',
            children: <StyleProcessTab styleId={styleId} readOnly={locked} />,
          },
        ]}
      />
    </div>
  );
};

export default StylePatternTab;
