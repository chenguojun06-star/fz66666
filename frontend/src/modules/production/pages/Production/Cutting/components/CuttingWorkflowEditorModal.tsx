import React, { useEffect, useState } from 'react';
import { App, Button, InputNumber, Select, Space, Spin } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import { productionOrderApi } from '@/services/production/productionApi';

type WorkflowRow = {
  _key: string;
  name: string;
  progressStage: string;
  unitPrice: number;
  machineType: string;
  difficulty: string;
  standardTime: number;
};

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
              machineType: String(n?.machineType || '').trim(),
              difficulty: String(n?.difficulty || '').trim(),
              standardTime: Number(n?.standardTime) || 0,
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
    setRows(prev => [...prev, { _key: genKey(), name: '', progressStage: '裁剪', unitPrice: 0, machineType: '', difficulty: '', standardTime: 0 }]);
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
      const progressStage = r.progressStage.trim() || r.name.trim();
      return {
        id: r.name.trim(),
        name: r.name.trim(),
        progressStage,
        unitPrice: Number(r.unitPrice) || 0,
        machineType: r.machineType || '',
        difficulty: r.difficulty || '',
        standardTime: r.standardTime || 0,
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
      title: '排序',
      dataIndex: '_key',
      key: 'sortOrder',
      width: 60,
      render: (_: any, __: WorkflowRow, idx: number) => idx + 1,
    },
    {
      title: '工序编号',
      dataIndex: '_key',
      key: 'processCode',
      width: 80,
      render: (_: any, __: WorkflowRow, idx: number) => String(idx + 1).padStart(2, '0'),
    },
    {
      title: '工序名称',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      render: (v: string, row: WorkflowRow) => (
        <DictAutoComplete dictType="process_name" autoCollect value={v} placeholder="请选择或输入工序名称" style={{ width: '100%' }} onChange={(val) => update(row._key, 'name', val)} />
      ),
    },
    {
      title: '进度节点',
      dataIndex: 'progressStage',
      key: 'progressStage',
      width: 120,
      render: (v: string, row: WorkflowRow) => (
        <Select value={v || undefined} allowClear placeholder="选择" style={{ width: '100%' }} onChange={(val) => update(row._key, 'progressStage', val || '')}
          options={['采购', '裁剪', '二次工艺', '车缝', '尾部', '入库'].map(s => ({ value: s, label: s }))}
        />
      ),
    },
    {
      title: '机器类型',
      dataIndex: 'machineType',
      key: 'machineType',
      width: 120,
      render: (v: string, row: WorkflowRow) => (
        <DictAutoComplete dictType="machine_type" autoCollect value={v || ''} placeholder="请选择或输入" style={{ width: '100%' }} onChange={(val) => update(row._key, 'machineType', val)} />
      ),
    },
    {
      title: '工序难度',
      dataIndex: 'difficulty',
      key: 'difficulty',
      width: 90,
      render: (v: string, row: WorkflowRow) => (
        <Select value={v || undefined} allowClear placeholder="选择" style={{ width: '100%' }} onChange={(val) => update(row._key, 'difficulty', val || '')}
          options={[{ value: '易', label: '易' }, { value: '中', label: '中' }, { value: '难', label: '难' }]}
        />
      ),
    },
    {
      title: '工时(秒)',
      dataIndex: 'standardTime',
      key: 'standardTime',
      width: 90,
      render: (v: number, row: WorkflowRow) => (
        <InputNumber value={v || 0} style={{ width: '100%' }} min={0} onChange={(val) => update(row._key, 'standardTime', typeof val === 'number' ? val : 0)} />
      ),
    },
    {
      title: '工价(元)',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 100,
      render: (v: number, row: WorkflowRow) => (
        <InputNumber value={v} style={{ width: '100%' }} min={0} precision={2} step={0.01} prefix="¥" onChange={(val) => update(row._key, 'unitPrice', typeof val === 'number' ? val : 0)} />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 50,
      render: (_: any, row: WorkflowRow) => (
        <Button type="text" danger icon={<DeleteOutlined />} disabled={rows.length <= 1} onClick={() => setRows(prev => prev.filter(r => r._key !== row._key))} />
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
        <ResizableTable<WorkflowRow>
          storageKey="cutting-workflow-table"
         
          columns={columns}
          dataSource={rows}
          rowKey="_key"
          pagination={false}
          scroll={{ x: 700 }}
          locale={{ emptyText: '暂无工序，点击上方按钮添加' }}
        />
      </Spin>
    </ResizableModal>
  );
};

export default CuttingWorkflowEditorModal;
