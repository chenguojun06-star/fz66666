import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Table,
  Tag,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  message,
  Popconfirm,
  Tooltip,
} from 'antd';
import { PlusOutlined, PlayCircleOutlined, CheckCircleOutlined, StopOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  selectionBatchList,
  selectionBatchSave,
  selectionBatchUpdate,
  selectionBatchStageAction,
  selectionBatchDelete,
} from '@/services/selection/selectionApi';
import { paths } from '@/routeConfig';

interface Batch {
  id: number;
  batchNo: string;
  batchName: string;
  season: string;
  year: number;
  theme: string;
  status: string;
  targetQty: number;
  finalizedQty: number;
  createdByName: string;
  approvedByName: string;
  approvedTime: string;
  createTime: string;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'default',
  REVIEWING: 'processing',
  APPROVED: 'success',
  CLOSED: 'error',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  REVIEWING: '评审中',
  APPROVED: '已通过',
  CLOSED: '已关闭',
};

const SEASON_OPTIONS = ['春夏', '秋冬', 'SS', 'AW', '全年'];
const CURRENT_YEAR = new Date().getFullYear();

export default function SelectionBatchList() {
  const navigate = useNavigate();
  const [data, setData] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await selectionBatchList({ page: 1, pageSize: 100 });
      setData(res?.data?.records ?? res?.data ?? []);
    } catch {
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditId(null);
    form.resetFields();
    form.setFieldsValue({ year: CURRENT_YEAR });
    setModalOpen(true);
  };

  const openEdit = (record: Batch) => {
    setEditId(record.id);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      if (editId) {
        await selectionBatchUpdate(editId, values);
        message.success('更新成功');
      } else {
        await selectionBatchSave(values);
        message.success('创建成功');
      }
      setModalOpen(false);
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err?.response?.data?.message ?? '操作失败');
    }
  };

  const handleAction = async (id: number, action: string, label: string) => {
    try {
      await selectionBatchStageAction(id, action);
      message.success(`${label}成功`);
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err?.response?.data?.message ?? `${label}失败`);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await selectionBatchDelete(id);
      message.success('删除成功');
      load();
    } catch {
      message.error('删除失败');
    }
  };

  const columns: ColumnsType<Batch> = [
    { title: '批次号', dataIndex: 'batchNo', width: 160, fixed: 'left' },
    { title: '批次名称', dataIndex: 'batchName', width: 160,
      render: (v, r) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => navigate(`${paths.selectionBatch}?tab=candidates&batchId=${r.id}&batchName=${encodeURIComponent(r.batchName)}`)}>
          {v}
        </Button>
      ),
    },
    { title: '季节', dataIndex: 'season', width: 80 },
    { title: '年份', dataIndex: 'year', width: 80 },
    {
      title: '状态', dataIndex: 'status', width: 100,
      render: (v) => <Tag color={STATUS_COLORS[v] ?? 'default'}>{STATUS_LABELS[v] ?? v}</Tag>,
    },
    {
      title: '目标款数 / 已确认',
      width: 130,
      render: (_, r) => `${r.finalizedQty ?? 0} / ${r.targetQty ?? 0}`,
    },
    { title: '创建人', dataIndex: 'createdByName', width: 90 },
    { title: '审批人', dataIndex: 'approvedByName', width: 90 },
    { title: '创建时间', dataIndex: 'createTime', width: 160 },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      fixed: 'right',
      render: (_, record) => {
        const { id, status } = record;
        return (
          <Space size={4}>
            {status === 'DRAFT' && (
              <>
                <Button size="small" onClick={() => openEdit(record)}>编辑</Button>
                <Tooltip title="提交评审">
                  <Button size="small" icon={<PlayCircleOutlined />} type="primary" onClick={() => handleAction(id, 'submit', '提交')}>提交</Button>
                </Tooltip>
              </>
            )}
            {status === 'REVIEWING' && (
              <Tooltip title="批准批次">
                <Button size="small" icon={<CheckCircleOutlined />} type="primary" onClick={() => handleAction(id, 'approve', '批准')}>批准</Button>
              </Tooltip>
            )}
            {status === 'APPROVED' && (
              <Tooltip title="关闭批次">
                <Button size="small" icon={<StopOutlined />} danger onClick={() => handleAction(id, 'close', '关闭')}>关闭</Button>
              </Tooltip>
            )}
            {status === 'CLOSED' && (
              <Tooltip title="重新开放">
                <Button size="small" icon={<ReloadOutlined />} onClick={() => handleAction(id, 'reopen', '重开')}>重开</Button>
              </Tooltip>
            )}
            {status === 'DRAFT' && (
              <Popconfirm title="确认删除？" onConfirm={() => handleDelete(id)}>
                <Button size="small" danger>删除</Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>选品批次</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建批次</Button>
      </div>

      <Table<Batch>
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1200 }}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        size="small"
      />

      <Modal
        title={editId ? '编辑批次' : '新建选品批次'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width="40vw"
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="batchName" label="批次名称" rules={[{ required: true }]}>
            <Input placeholder="如：2026秋冬主推款" />
          </Form.Item>
          <Form.Item name="season" label="季节">
            <Select options={SEASON_OPTIONS.map(s => ({ label: s, value: s }))} placeholder="选择季节" />
          </Form.Item>
          <Form.Item name="year" label="年份" rules={[{ required: true }]}>
            <InputNumber min={2020} max={2030} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="theme" label="主题">
            <Input placeholder="如：复古工装、极简都市" />
          </Form.Item>
          <Form.Item name="targetQty" label="目标款数">
            <InputNumber min={1} style={{ width: '100%' }} placeholder="期望最终选定款数" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
