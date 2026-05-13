import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Table, Tag, Space, Modal, Form, InputNumber, Select, Input, message, Statistic, Row, Col, Descriptions, Popconfirm, Tooltip } from 'antd';
import StandardModal from '@/components/common/StandardModal';
import { PlusOutlined, AuditOutlined, CheckCircleOutlined, CloseCircleOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import { inventoryCheckApi } from '../../../../services/warehouse/inventoryCheckApi';
import ResizableTable from '../../../../components/common/ResizableTable';

const CHECK_TYPE_MAP: Record<string, { label: string; color: string }> = {
  MATERIAL: { label: '物料盘点', color: 'blue' },
  FINISHED: { label: '成品盘点', color: 'green' },
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: '待盘点', color: 'orange' },
  confirmed: { label: '已确认', color: 'green' },
  cancelled: { label: '已取消', color: 'default' },
};

const DIFF_TYPE_MAP: Record<string, { label: string; color: string }> = {
  PROFIT: { label: '盘盈', color: 'red' },
  LOSS: { label: '盘亏', color: 'blue' },
  EQUAL: { label: '持平', color: 'green' },
};

const InventoryCheck: React.FC = () => {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<any>({});
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [currentCheck, setCurrentCheck] = useState<any>(null);
  const [currentItems, setCurrentItems] = useState<any[]>([]);
  const [fillModalVisible, setFillModalVisible] = useState(false);
  const [createForm] = Form.useForm();
  const [filterType, setFilterType] = useState<string | undefined>();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventoryCheckApi.list({
        page, pageSize,
        checkType: filterType,
        status: filterStatus,
      });
      const data = res.data?.data || res.data;
      if (data?.records) {
        setList(data.records);
        setTotal(data.total || 0);
      } else if (Array.isArray(data)) {
        setList(data);
        setTotal(data.length);
      }
    } catch (e: any) {
      message.error(e.message || '查询失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filterType, filterStatus]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await inventoryCheckApi.summary();
      setSummary(res.data?.data || res.data || {});
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      await inventoryCheckApi.create(values);
      message.success('盘点单创建成功');
      setCreateModalVisible(false);
      createForm.resetFields();
      fetchList();
      fetchSummary();
    } catch (e: any) {
      if (e.message) message.error(e.message);
    }
  };

  const handleViewDetail = async (record: any) => {
    try {
      const res = await inventoryCheckApi.detail(record.id);
      const data = res.data?.data || res.data;
      setCurrentCheck(data);
      setCurrentItems(data?.items || []);
      setDetailModalVisible(true);
    } catch (e: any) {
      message.error(e.message || '查询详情失败');
    }
  };

  const handleOpenFill = (record: any) => {
    setCurrentCheck(record);
    setCurrentItems((record.items || []).map((it: any) => ({ ...it })));
    setFillModalVisible(true);
  };

  const handleFillActual = async () => {
    try {
      const items = currentItems
        .filter(it => it.actualQuantity !== undefined && it.actualQuantity !== null)
        .map(it => ({ itemId: it.id, actualQuantity: it.actualQuantity }));
      if (items.length === 0) {
        message.warning('请至少填写一项实盘数量');
        return;
      }
      await inventoryCheckApi.fillActual({ checkId: currentCheck.id, items });
      message.success('实盘数量已保存');
      setFillModalVisible(false);
      fetchList();
    } catch (e: any) {
      message.error(e.message || '保存失败');
    }
  };

  const handleConfirm = async (checkId: string) => {
    try {
      await inventoryCheckApi.confirm(checkId);
      message.success('盘点已确认，库存已调整');
      fetchList();
      fetchSummary();
    } catch (e: any) {
      message.error(e.message || '确认失败');
    }
  };

  const handleCancel = async (checkId: string) => {
    try {
      await inventoryCheckApi.cancel(checkId);
      message.success('盘点已取消');
      fetchList();
      fetchSummary();
    } catch (e: any) {
      message.error(e.message || '取消失败');
    }
  };

  const columns = [
    { title: '盘点单号', dataIndex: 'checkNo', key: 'checkNo', width: 180, ellipsis: true },
    {
      title: '盘点类型', dataIndex: 'checkType', key: 'checkType', width: 100,
      render: (v: string) => {
        const m = CHECK_TYPE_MAP[v] || { label: v, color: 'default' };
        return <Tag color={m.color}>{m.label}</Tag>;
      },
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 90,
      render: (v: string) => {
        const m = STATUS_MAP[v] || { label: '未知', color: 'default' };
        return <Tag color={m.color}>{m.label}</Tag>;
      },
    },
    { title: '盘点项数', dataIndex: 'totalItems', key: 'totalItems', width: 90, align: 'center' as const },
    { title: '差异数', dataIndex: 'diffItems', key: 'diffItems', width: 80, align: 'center' as const },
    { title: '账面总量', dataIndex: 'totalBookQty', key: 'totalBookQty', width: 100, align: 'right' as const },
    { title: '实盘总量', dataIndex: 'totalActualQty', key: 'totalActualQty', width: 100, align: 'right' as const },
    {
      title: '差异数量', dataIndex: 'totalDiffQty', key: 'totalDiffQty', width: 100, align: 'right' as const,
      render: (v: number) => v ? <span style={{ color: v > 0 ? '#cf1322' : '#1890ff' }}>{v > 0 ? `+${v}` : v}</span> : '-',
    },
    { title: '仓位', dataIndex: 'warehouseLocation', key: 'warehouseLocation', width: 100, ellipsis: true },
    { title: '创建人', dataIndex: 'createdByName', key: 'createdByName', width: 90 },
    { title: '创建时间', dataIndex: 'createTime', key: 'createTime', width: 160 },
    {
      title: '操作', key: 'action', width: 240, fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space size={4}>
          <Tooltip title="查看详情"><Button type="link" icon={<EyeOutlined />} onClick={() => handleViewDetail(record)} /></Tooltip>
          {record.status === 'draft' && (
            <>
              <Button type="link" onClick={() => handleOpenFill(record)}>填写实盘</Button>
              <Popconfirm title="确认盘点？确认后将自动调整库存" onConfirm={() => handleConfirm(record.id)}>
                <Button type="link" icon={<CheckCircleOutlined />} style={{ color: '#52c41a' }}>确认</Button>
              </Popconfirm>
              <Popconfirm title="确定取消此盘点单？" onConfirm={() => handleCancel(record.id)}>
                <Button type="link" danger icon={<CloseCircleOutlined />}>取消</Button>
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ];

  const itemColumns = [
    { title: '物料/SKU', dataIndex: 'materialCode', key: 'materialCode', width: 140, render: (v: string, r: any) => v || r.skuCode || '-' },
    { title: '名称', dataIndex: 'materialName', key: 'materialName', width: 140, ellipsis: true },
    { title: '颜色', dataIndex: 'color', key: 'color', width: 70 },
    { title: '尺码', dataIndex: 'size', key: 'size', width: 70 },
    { title: '账面数量', dataIndex: 'bookQuantity', key: 'bookQuantity', width: 90, align: 'right' as const },
    {
      title: '实盘数量', dataIndex: 'actualQuantity', key: 'actualQuantity', width: 110,
      render: (v: number, r: any, idx: number) => (
        <InputNumber
          min={0} value={v}
          onChange={val => {
            const newItems = [...currentItems];
            newItems[idx] = { ...newItems[idx], actualQuantity: val ?? 0 };
            setCurrentItems(newItems);
          }}
        />
      ),
    },
    {
      title: '差异', dataIndex: 'diffQuantity', key: 'diffQuantity', width: 80, align: 'right' as const,
      render: (v: number) => v ? <span style={{ color: v > 0 ? '#cf1322' : '#1890ff' }}>{v > 0 ? `+${v}` : v}</span> : '-',
    },
    {
      title: '差异类型', dataIndex: 'diffType', key: 'diffType', width: 80,
      render: (v: string) => { const m = DIFF_TYPE_MAP[v] || { label: v || '-', color: 'default' }; return <Tag color={m.color}>{m.label}</Tag>; },
    },
  ];

  const detailItemColumns = [
    { title: '物料/SKU', dataIndex: 'materialCode', key: 'materialCode', width: 140, render: (v: string, r: any) => v || r.skuCode || '-' },
    { title: '名称', dataIndex: 'materialName', key: 'materialName', width: 140, ellipsis: true },
    { title: '颜色', dataIndex: 'color', key: 'color', width: 70 },
    { title: '尺码', dataIndex: 'size', key: 'size', width: 70 },
    { title: '账面数量', dataIndex: 'bookQuantity', key: 'bookQuantity', width: 90, align: 'right' as const },
    { title: '实盘数量', dataIndex: 'actualQuantity', key: 'actualQuantity', width: 90, align: 'right' as const },
    {
      title: '差异', dataIndex: 'diffQuantity', key: 'diffQuantity', width: 80, align: 'right' as const,
      render: (v: number) => v ? <span style={{ color: v > 0 ? '#cf1322' : '#1890ff' }}>{v > 0 ? `+${v}` : v}</span> : '-',
    },
    {
      title: '差异类型', dataIndex: 'diffType', key: 'diffType', width: 80,
      render: (v: string) => { const m = DIFF_TYPE_MAP[v] || { label: v || '-', color: 'default' }; return <Tag color={m.color}>{m.label}</Tag>; },
    },
    { title: '差异金额', dataIndex: 'diffAmount', key: 'diffAmount', width: 100, align: 'right' as const, render: (v: number) => v ? `¥${v.toFixed(2)}` : '-' },
  ];

  return (
    <div style={{ padding: 16 }}>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card><Statistic title="物料库存品种" value={summary.materialVarietyCount ?? '-'} /></Card></Col>
        <Col span={6}><Card><Statistic title="成品库存SKU" value={summary.finishedSkuCount ?? '-'} /></Card></Col>
        <Col span={6}><Card><Statistic title="待处理盘点" value={summary.pendingCheckCount ?? 0} valueStyle={{ color: summary.pendingCheckCount > 0 ? '#faad14' : undefined }} /></Card></Col>
        <Col span={6}><Card><Statistic title="差异总金额" value={summary.totalDiffAmount ?? 0} prefix="¥" precision={2} valueStyle={{ color: (summary.totalDiffAmount ?? 0) > 0 ? '#cf1322' : undefined }} /></Card></Col>
      </Row>

      <Card
        title={<Space><AuditOutlined />盘点管理</Space>}
        extra={
          <Space>
            <Select placeholder="盘点类型" allowClear style={{ width: 120 }} value={filterType} onChange={setFilterType}>
              <Select.Option value="MATERIAL">物料盘点</Select.Option>
              <Select.Option value="FINISHED">成品盘点</Select.Option>
            </Select>
            <Select placeholder="状态" allowClear style={{ width: 100 }} value={filterStatus} onChange={setFilterStatus}>
              <Select.Option value="draft">待盘点</Select.Option>
              <Select.Option value="confirmed">已确认</Select.Option>
              <Select.Option value="cancelled">已取消</Select.Option>
            </Select>
            <Button icon={<ReloadOutlined />} onClick={() => { fetchList(); fetchSummary(); }}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>新建盘点</Button>
          </Space>
        }
      >
        <ResizableTable
          size="small"
          rowKey="id"
          columns={columns}
          dataSource={list}
          loading={loading}
          pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: t => `共 ${t} 条`, onChange: (p, ps) => { setPage(p); setPageSize(ps); } }}
          scroll={{ x: 1500 }}
         
        />
      </Card>

      <Modal title="新建盘点单" open={createModalVisible} onOk={handleCreate} onCancel={() => { setCreateModalVisible(false); createForm.resetFields(); }} width={480} maskClosable={false}>
        <Form form={createForm} layout="vertical">
          <Form.Item name="checkType" label="盘点类型" rules={[{ required: true, message: '请选择盘点类型' }]}>
            <Select placeholder="选择盘点类型">
              <Select.Option value="MATERIAL">物料盘点</Select.Option>
              <Select.Option value="FINISHED">成品盘点</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="warehouseLocation" label="仓位（可选）">
            <Input placeholder="不填则盘点所有仓位" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="盘点备注" />
          </Form.Item>
        </Form>
      </Modal>

      <StandardModal title={`盘点详情 - ${currentCheck?.checkNo || ''}`} open={detailModalVisible} onCancel={() => setDetailModalVisible(false)} size="lg" footer={null}>
        {currentCheck && (
          <>
            <Descriptions bordered column={3} style={{ marginBottom: 12 }}>
              <Descriptions.Item label="盘点单号">{currentCheck.checkNo}</Descriptions.Item>
              <Descriptions.Item label="类型"><Tag color={CHECK_TYPE_MAP[currentCheck.checkType]?.color}>{CHECK_TYPE_MAP[currentCheck.checkType]?.label}</Tag></Descriptions.Item>
              <Descriptions.Item label="状态"><Tag color={STATUS_MAP[currentCheck.status]?.color}>{STATUS_MAP[currentCheck.status]?.label}</Tag></Descriptions.Item>
              <Descriptions.Item label="账面总量">{currentCheck.totalBookQty ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="实盘总量">{currentCheck.totalActualQty ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="差异数量">{currentCheck.totalDiffQty ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="创建人">{currentCheck.createdByName}</Descriptions.Item>
              <Descriptions.Item label="确认人">{currentCheck.confirmedName || '-'}</Descriptions.Item>
              <Descriptions.Item label="确认时间">{currentCheck.confirmedTime || '-'}</Descriptions.Item>
            </Descriptions>
            <Table rowKey="id" columns={detailItemColumns} dataSource={currentItems} pagination={false} scroll={{ y: 400 }} />
          </>
        )}
      </StandardModal>

      <StandardModal title={`填写实盘数量 - ${currentCheck?.checkNo || ''}`} open={fillModalVisible} onOk={handleFillActual} onCancel={() => setFillModalVisible(false)} size="lg">
        <Table rowKey="id" size="small" columns={itemColumns} dataSource={currentItems} pagination={false} scroll={{ y: 400 }} />
      </StandardModal>
    </div>
  );
};

export default InventoryCheck;
