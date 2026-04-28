import React, { useEffect, useState } from 'react';
import { App, AutoComplete, Button, Input, InputNumber, Space, Spin, Table } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import { productionOrderApi } from '@/services/production/productionApi';

type WorkflowRow = {
  _key: string;
  name: string;
  progressStage: string;
  unitPrice: number;
};

// 系统预设阶段作为输入建议（仅供参考，用户可自由输入任意父节点名称）
const STAGE_SUGGESTIONS = [
  '采购', '裁剪', '二次工艺', '车缝', '尾部', '入库',
].map(v => ({ label: v, value: v }));

let _editorKeyCounter = 0;
const genKey = () => `wf_${Date.now()}_${_editorKeyCounter++}`;

interface CuttingWorkflowEditorModalProps {
  visible: boolean;
  onClose: () => void;
  /** CuttingTask.productionOrderNo */
  orderNo: string;
  onSaved?: () => void;
}

const CuttingWorkflowEditorModal: React.FC<CuttingWorkflowEditorModalProps> = ({
  visible,
  onClose,
  orderNo,
  onSaved,
}) => {
  const { message } = App.useApp();
  const [orderId, setOrderId] = useState('');
  const [rows, setRows] = useState<WorkflowRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !orderNo) {
      setRows([]);
      setOrderId('');
      return;
    }
    void loadWorkflow();
  }, [visible, orderNo]);

  const loadWorkflow = async () => {
    setLoading(true);
    try {
      const res = await productionOrderApi.list({ orderNo, page: 1, pageSize: 1 } as any);
      const order = (res as any)?.data?.records?.[0];
      if (!order) {
        message.error('未找到对应生产订单');
        return;
      }
      setOrderId(String(order.id || ''));
      const json: unknown = order.progressWorkflowJson;
      if (!json) {
        setRows([]);
        return;
      }
      const parsed: unknown = typeof json === 'string' ? JSON.parse(json) : json;
      const nodes: any[] = Array.isArray((parsed as any)?.nodes) ? (parsed as any).nodes : [];
      setRows(
        nodes
          .map(n => {
            const name = String(n?.name || '').trim();
            // 直接保留原始 progressStage，不再强制映射到固定阶段
            const progressStage = String(n?.progressStage || '').trim();
            return {
              _key: genKey(),
              name,
              progressStage,
              unitPrice: Number(n?.unitPrice) || 0,
            };
          })
          .filter(r => r.name),
      );
    } catch {
      message.error('加载工序失败');
    } finally {
      setLoading(false);
    }
  };

  const update = (_key: string, field: keyof Omit<WorkflowRow, '_key'>, value: string | number) => {
    setRows(prev => prev.map(r => r._key === _key ? { ...r, [field]: value } : r));
  };

  const handleAddRow = () => {
    setRows(prev => [...prev, { _key: genKey(), name: '', progressStage: '裁剪', unitPrice: 0 }]);
  };

  const handleSave = async () => {
    if (!orderId) {
      message.warning('订单信息尚未加载，请稍后重试');
      return;
    }
    const invalid = rows.find(r => !r.name.trim());
    if (invalid) {
      message.warning('工序名称不能为空');
      return;
    }
    const nodes = rows.map((r, idx) => {
      // 直接使用用户填写的 progressStage，不再强制映射；为空时用工序名称兜底
      const progressStage = r.progressStage.trim() || r.name.trim();
      return {
        id: r.name.trim(),
        name: r.name.trim(),
        progressStage,
        unitPrice: Number(r.unitPrice) || 0,
        machineType: '',
        standardTime: 0,
        sortOrder: idx,
      };
    });
    const processesByNode: Record<string, typeof nodes> = {};
    nodes.forEach(n => {
      const key = n.progressStage || n.name;
      if (!processesByNode[key]) processesByNode[key] = [];
      processesByNode[key].push(n);
    });
    const progressWorkflowJson = JSON.stringify({ nodes, processesByNode });
    setSaving(true);
    try {
      const res = await productionOrderApi.quickEdit({ id: orderId, progressWorkflowJson } as any);
      if ((res as any)?.code !== 200) {
        message.error((res as any)?.message || '保存失败');
        return;
      }
      message.success('工序已保存');
      onSaved?.();
      onClose();
    } catch {
      message.error('保存工序失败');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: '#',
      width: 44,
      render: (_: any, __: WorkflowRow, idx: number) => (
        <span style={{ color: '#999', fontSize: 12 }}>{idx + 1}</span>
      ),
    },
    {
      title: (
        <span>
          <span style={{ color: '#ff4d4f', marginRight: 2 }}>*</span>工序名称
        </span>
      ),
      key: 'name',
      render: (_: any, record: WorkflowRow) => (
        <Input
          value={record.name}
          placeholder="输入工序名称"
          status={!record.name.trim() ? 'error' : undefined}
          onChange={e => update(record._key, 'name', e.target.value)}
        />
      ),
    },
    {
      title: '所属阶段',
      key: 'progressStage',
      width: 140,
      render: (_: any, record: WorkflowRow) => (
        <AutoComplete
          value={record.progressStage}
          options={STAGE_SUGGESTIONS}
          allowClear
          placeholder="输入或选择阶段"
          onChange={(v: string) => update(record._key, 'progressStage', v || '')}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '单价（元）',
      key: 'unitPrice',
      width: 130,
      render: (_: any, record: WorkflowRow) => (
        <InputNumber
          value={record.unitPrice}
          min={0}
          precision={2}
          onChange={v => update(record._key, 'unitPrice', v ?? 0)}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '',
      key: 'del',
      width: 44,
      render: (_: any, record: WorkflowRow) => (
        <Button
          type="text"
          danger
          size="small"
          icon={<DeleteOutlined />}
          onClick={() => setRows(prev => prev.filter(r => r._key !== record._key))}
        />
      ),
    },
  ];

  return (
    <ResizableModal
      open={visible}
      title={`编辑工序 — ${orderNo || ''}`}
      onCancel={onClose}
      width="40vw"
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={saving} onClick={handleSave}>
            保存工序
          </Button>
        </Space>
      }
    >
      <Spin spinning={loading}>
        <div style={{ marginBottom: 12 }}>
          <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddRow} block>
            新增工序行
          </Button>
        </div>
        <Table<WorkflowRow>
          size="small"
          columns={columns}
          dataSource={rows}
          rowKey="_key"
          pagination={false}
          locale={{ emptyText: '暂无工序，点击上方按钮添加' }}
        />
      </Spin>
    </ResizableModal>
  );
};

export default CuttingWorkflowEditorModal;
