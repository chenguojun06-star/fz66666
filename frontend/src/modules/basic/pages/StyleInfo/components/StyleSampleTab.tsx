import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Modal, Space, Tag, message } from 'antd';
import { CheckCircleOutlined, PlayCircleOutlined, ToolOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal, {
  ResizableModalFlex,
  ResizableModalFlexFill,
  useResizableModalTableScrollY,
} from '@/components/common/ResizableModal';
import RowActions from '@/components/common/RowActions';
import api from '@/utils/api';
import type { StyleAttachment, StyleBom } from '@/types/style';
import { isSupervisorOrAboveUser, useAuth } from '@/utils/authContext';
import { formatDateTime } from '@/utils/datetime';
import { useViewport } from '@/utils/useViewport';

interface Props {
  styleId: string | number;
  styleNo?: string;
  color?: string;
  sampleStatus?: string;
  sampleCompletedTime?: string;
  onRefresh: () => void;
}

type OperationLog = {
  id: string;
  styleId: number;
  bizType: string;
  action: string;
  operator?: string;
  remark?: string;
  createTime?: string;
};

const StyleSampleTab: React.FC<Props> = ({
  styleId,
  styleNo,
  color,
  sampleStatus,
  sampleCompletedTime,
  onRefresh,
}) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [bomList, setBomList] = useState<StyleBom[]>([]);
  const [patternAttachments, setPatternAttachments] = useState<StyleAttachment[]>([]);
  const [logs, setLogs] = useState<OperationLog[]>([]);

  const [bomDetailOpen, setBomDetailOpen] = useState(false);

  const bomDetailTableWrapRef = useRef<HTMLDivElement | null>(null);
  const bomDetailTableScrollY = useResizableModalTableScrollY({ open: bomDetailOpen, ref: bomDetailTableWrapRef });

  const { modalWidth } = useViewport();
  const modalInitialHeight = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800;

  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [bomRes, fileRes, logRes] = await Promise.all([
        api.get('/style/bom/list', { params: { styleId } }),
        api.get('/style/attachment/list', { params: { styleId, bizType: 'pattern' } }),
        api.get('/style/operation-log/list', { params: { styleId, bizType: 'sample' } }),
      ]);

      const bomResult = bomRes as Record<string, unknown>;
      if (bomResult?.code === 200 && Array.isArray(bomResult?.data)) {
        setBomList(bomResult.data as StyleBom[]);
      } else {
        setBomList([]);
      }

      const fileResult = fileRes as Record<string, unknown>;
      if (fileResult?.code === 200 && Array.isArray(fileResult?.data)) {
        setPatternAttachments(fileResult.data as StyleAttachment[]);
      } else {
        setPatternAttachments([]);
      }

      const logResult = logRes as Record<string, unknown>;
      if (logResult?.code === 200 && Array.isArray(logResult?.data)) {
        setLogs(logResult.data as OperationLog[]);
      } else {
        setLogs([]);
      }
    } catch {
    // Intentionally empty
      // 忽略错误
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  }, [styleId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll, refreshKey]);

  const post = async (url: string, body?: any) => {
    setSaving(true);
    try {
      const res = await api.post(url, body);
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        message.success('操作成功');
        onRefresh();
        setRefreshKey((v) => v + 1);
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
    Modal.confirm({
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
        await post(`/style/info/${styleId}/sample/reset`, { reason: remark });
      },
    });
  };

  const timeText = useCallback((raw?: string) => {
    return formatDateTime(raw);
  }, []);

  const startTime = useMemo(() => {
    const hit = logs.find((l) => String(l?.action || '').trim().toUpperCase() === 'RECEIVE_START');
    return hit?.createTime;
  }, [logs]);

  const completeTime = useMemo(() => {
    const hit = logs.find((l) => String(l?.action || '').trim().toUpperCase() === 'SAMPLE_COMPLETED');
    return hit?.createTime;
  }, [logs]);

  const status = useMemo(() => String(sampleStatus || '').trim().toUpperCase(), [sampleStatus]);
  const locked = useMemo(() => status === 'COMPLETED', [status]);

  const canRollback = useMemo(() => isSupervisorOrAboveUser(user), [user]);

  const statusTag = useMemo(() => {
    if (status === 'COMPLETED') return <Tag color="green">已完成</Tag>;
    if (status === 'IN_PROGRESS') return <Tag color="gold">制作中</Tag>;
    return <Tag>未开始</Tag>;
  }, [status]);

  const completedTimeText = useMemo(() => timeText(sampleCompletedTime || completeTime), [completeTime, sampleCompletedTime, timeText]);

  const bomSummary = useMemo(() => {
    const count = Array.isArray(bomList) ? bomList.length : 0;
    const total = (bomList || []).reduce((sum, it) => {
      const n = typeof it?.totalPrice === 'number' ? it.totalPrice : Number(it?.totalPrice);
      return Number.isFinite(n) ? sum + n : sum;
    }, 0);
    return { count, total };
  }, [bomList]);

  const bomMaterialTypeLabel = (v: unknown) => {
    const type = String(v || '').trim();
    if (!type) return '-';
    if (type === 'fabric') return '面料';
    if (type === 'lining') return '里料';
    if (type === 'accessory') return '辅料';
    if (type.startsWith('fabric')) return `面料${type.replace('fabric', '')}`;
    if (type.startsWith('lining')) return `里料${type.replace('lining', '')}`;
    if (type.startsWith('accessory')) return `辅料${type.replace('accessory', '')}`;
    return type;
  };

  const bomDetailColumns = useMemo(() => {
    return [
      {
        title: '类型',
        dataIndex: 'materialType',
        key: 'materialType',
        width: 110,
        render: (v: unknown) => bomMaterialTypeLabel(v),
      },
      { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 120 },
      { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 160, ellipsis: true },
      { title: '颜色', dataIndex: 'color', key: 'color', width: 90 },
      { title: '规格', dataIndex: 'specification', key: 'specification', width: 140, ellipsis: true },
      { title: '尺码', dataIndex: 'size', key: 'size', width: 90 },
      { title: '单位', dataIndex: 'unit', key: 'unit', width: 90 },
      {
        title: '单件用量',
        dataIndex: 'usageAmount',
        key: 'usageAmount',
        width: 110,
        align: 'right' as const,
        render: (v: unknown) => {
          const n = typeof v === 'number' ? v : Number(v);
          return Number.isFinite(n) ? n : '-';
        },
      },
      {
        title: '损耗率(%)',
        dataIndex: 'lossRate',
        key: 'lossRate',
        width: 110,
        align: 'right' as const,
        render: (v: unknown) => {
          const n = typeof v === 'number' ? v : Number(v);
          return Number.isFinite(n) ? n : '-';
        },
      },
      {
        title: '单价',
        dataIndex: 'unitPrice',
        key: 'unitPrice',
        width: 100,
        align: 'right' as const,
        render: (v: unknown) => {
          const n = typeof v === 'number' ? v : Number(v);
          return Number.isFinite(n) ? n.toFixed(2) : '-';
        },
      },
      {
        title: '总价',
        dataIndex: 'totalPrice',
        key: 'totalPrice',
        width: 100,
        align: 'right' as const,
        render: (v: unknown) => {
          const n = typeof v === 'number' ? v : Number(v);
          return Number.isFinite(n) ? n.toFixed(2) : '-';
        },
      },
      { title: '供应商', dataIndex: 'supplier', key: 'supplier', width: 160, ellipsis: true },
      { title: '备注', dataIndex: 'remark', key: 'remark', width: 160, ellipsis: true },
    ];
  }, []);

  const columns = useMemo(() => {
    return [
      { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 200 },
      { title: '颜色', dataIndex: 'color', key: 'color', width: 120 },
      {
        title: 'BOM资料',
        dataIndex: 'bom',
        key: 'bom',
        render: () => {
          const totalText = `¥${bomSummary.total.toFixed(2)}`;
          return (
            <Space size={8} wrap>
              <span>{`${bomSummary.count}条 / ${totalText}`}</span>
              <Button type="link" size="small" disabled={!bomSummary.count} onClick={() => setBomDetailOpen(true)}>
                查看明细
              </Button>
            </Space>
          );
        },
      },
      {
        title: '纸样附件',
        dataIndex: 'patternFiles',
        key: 'patternFiles',
        render: () => {
          if (!patternAttachments.length) return '-';
          return (
            <Space wrap>
              {patternAttachments.slice(0, 5).map((f) => (
                <a key={String(f.id)} href={f.fileUrl} target="_blank" rel="noopener noreferrer">
                  {f.fileName}
                </a>
              ))}
              {patternAttachments.length > 5 ? <span>等{patternAttachments.length}个</span> : null}
            </Space>
          );
        },
      },
      { title: '领取开始时间', dataIndex: 'startTime', key: 'startTime', width: 190 },
      { title: '样板完成时间', dataIndex: 'completeTime', key: 'completeTime', width: 190 },
      {
        title: '操作',
        key: 'action',
        width: 220,
        render: () => {
          const actions = locked
            ? (canRollback
              ? [
                {
                  key: 'maintenance',
                  label: '维护',
                  title: '维护',
                  icon: <ToolOutlined />,
                  danger: true,
                  disabled: saving,
                  onClick: openMaintenance,
                  primary: true,
                },
              ]
              : [])
            : [
              {
                key: 'start',
                label: '领取开始',
                title: '领取开始',
                icon: <PlayCircleOutlined />,
                disabled: saving,
                onClick: () => post(`/style/info/${styleId}/sample/start`),
                primary: true,
              },
              {
                key: 'complete',
                label: '样板完成',
                title: '样板完成',
                icon: <CheckCircleOutlined />,
                disabled: saving,
                onClick: () => post(`/style/info/${styleId}/sample/complete`),
                primary: true,
              },
              ...(canRollback
                ? [
                  {
                    key: 'maintenance',
                    label: '维护',
                    title: '维护',
                    icon: <ToolOutlined />,
                    danger: true,
                    disabled: saving,
                    onClick: openMaintenance,
                  },
                ]
                : []),
            ];

          return <RowActions maxInline={3} actions={actions as Record<string, unknown>} />;
        },
      },
    ];
  }, [bomSummary, canRollback, locked, patternAttachments, post, saving, styleId]);

  return (
    <div>
      <Space style={{ marginBottom: 12 }} wrap>
        <span>样衣状态：</span>
        {statusTag}
        <span style={{ marginLeft: 12 }}>完成时间：{completedTimeText}</span>
      </Space>

      <ResizableModal
        title="BOM详细资料"
        open={bomDetailOpen}
        centered
        onCancel={() => setBomDetailOpen(false)}
        footer={
          <div className="modal-footer-actions">
            <Button onClick={() => setBomDetailOpen(false)}>关闭</Button>
          </div>
        }
        width={modalWidth}
        initialHeight={modalInitialHeight}
        scaleWithViewport
        destroyOnHidden
      >
        <ResizableModalFlex>
          <ResizableModalFlexFill ref={bomDetailTableWrapRef}>
            <ResizableTable
              rowKey={(r: Record<string, unknown>) =>
                String(r?.id ?? `${r?.materialType || ''}-${r?.materialCode || ''}-${r?.color || ''}-${r?.size || ''}`)
              }
              columns={bomDetailColumns as Record<string, unknown>}
              dataSource={bomList}
              pagination={false}
              scroll={{ x: 'max-content', y: bomDetailTableScrollY }}
              size="small"
            />
          </ResizableModalFlexFill>
        </ResizableModalFlex>
      </ResizableModal>

      <ResizableTable
        columns={columns as Record<string, unknown>}
        dataSource={[
          {
            key: String(styleId),
            styleNo: String(styleNo || '').trim() || '-',
            color: String(color || '').trim() || '-',
            startTime: timeText(startTime),
            completeTime: completedTimeText,
          },
        ]}
        loading={loading}
        pagination={false}
      />
    </div>
  );
};

export default StyleSampleTab;
