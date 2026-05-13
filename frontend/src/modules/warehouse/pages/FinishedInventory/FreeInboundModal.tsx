import React, { useState, useCallback, useRef } from 'react';
import { Form, Input, InputNumber, Select, Button, Space, Card, Row, Col, Tag, Descriptions, Alert, Switch, App, Tabs, Table, Tooltip, Divider } from 'antd';
import StandardModal from '@/components/common/StandardModal';
import { InboxOutlined, SearchOutlined, PlusOutlined, PrinterOutlined, DeleteOutlined } from '@ant-design/icons';
import { finishedWarehouseApi } from '../../../../services/warehouse/inventoryCheckApi';
import { useWarehouseAreaOptions, useWarehouseLocationByArea } from '../../../../hooks/useWarehouseAreaOptions';
import { warehouseAreaApi } from '../../../../services/warehouse/warehouseAreaApi';

interface FreeInboundModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const WAREHOUSE_TYPE_MAP: Record<string, string> = {
  external_purchase: 'FINISHED',
  free_inbound: 'FINISHED',
  transfer_in: 'FINISHED',
  return_in: 'FINISHED',
  other_in: 'FINISHED',
};

interface BatchItem {
  key: string;
  skuCode: string;
  styleNo: string;
  styleName: string;
  color: string;
  size: string;
  quantity: number;
  unitPrice: number | null;
  stockQuantity: number;
}

const FreeInboundModal: React.FC<FreeInboundModalProps> = ({ open, onClose, onSuccess }) => {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const [skuCode, setSkuCode] = useState('');
  const [skuInfo, setSkuInfo] = useState<any>(null);
  const [querying, setQuerying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autoCreate, setAutoCreate] = useState(false);
  const [showCreateFields, setShowCreateFields] = useState(false);
  const [selectedAreaId, setSelectedAreaId] = useState<string | undefined>(undefined);
  const [quickCreating, setQuickCreating] = useState(false);
  const [activeTab, setActiveTab] = useState('single');
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchSkuInput, setBatchSkuInput] = useState('');
  const printRef = useRef<HTMLDivElement>(null);

  const sourceType = Form.useWatch('sourceType', form) || 'free_inbound';
  const warehouseType = WAREHOUSE_TYPE_MAP[sourceType] || 'FINISHED';

  const { selectOptions: areaOptions, loading: areaLoading, areas } = useWarehouseAreaOptions(warehouseType as any);
  const { selectOptions: locationOptions, loading: locationLoading } = useWarehouseLocationByArea(warehouseType, selectedAreaId);

  const handleQuerySku = async () => {
    if (!skuCode.trim()) {
      message.warning('请输入SKU编码');
      return;
    }
    setQuerying(true);
    try {
      const res = await finishedWarehouseApi.scanQuery(skuCode.trim());
      const data = res.data?.data || res.data;
      if (data.found) {
        setSkuInfo(data);
        setShowCreateFields(false);
      } else {
        setSkuInfo(null);
        if (data.canAutoCreate) {
          setShowCreateFields(true);
          form.setFieldsValue({
            styleNo: data.suggestedStyleNo,
            styleName: data.suggestedStyleName,
            color: data.suggestedColor,
            size: data.suggestedSize,
          });
          message.info('SKU不存在，可开启自动创建后入库');
        } else {
          message.warning('SKU不存在');
        }
      }
    } catch (e: any) {
      message.error(e.message || '查询失败');
      setSkuInfo(null);
    } finally {
      setQuerying(false);
    }
  };

  const handleBatchQuerySku = async () => {
    if (!batchSkuInput.trim()) {
      message.warning('请输入SKU编码');
      return;
    }
    try {
      const res = await finishedWarehouseApi.scanQuery(batchSkuInput.trim());
      const data = res.data?.data || res.data;
      if (data.found) {
        const exists = batchItems.find(i => i.skuCode === data.skuCode);
        if (exists) {
          setBatchItems(prev => prev.map(i => i.skuCode === data.skuCode ? { ...i, quantity: i.quantity + 1 } : i));
        } else {
          setBatchItems(prev => [...prev, {
            key: data.skuCode,
            skuCode: data.skuCode,
            styleNo: data.styleNo || '',
            styleName: data.styleName || '',
            color: data.color || '',
            size: data.size || '',
            quantity: 1,
            unitPrice: data.costPrice || null,
            stockQuantity: data.stockQuantity || 0,
          }]);
        }
        setBatchSkuInput('');
      } else {
        message.warning(`SKU不存在: ${batchSkuInput}`);
      }
    } catch (e: any) {
      message.error(e.message || '查询失败');
    }
  };

  const handleQuickCreateArea = async () => {
    const name = await new Promise<string | null>((resolve) => {
      let inputValue = '';
      modal.confirm({
        title: '快速创建仓库区域',
        content: (
          <Input
            placeholder="输入仓库名称，如：广州成品仓3"
            onChange={(e) => { inputValue = e.target.value; }}
            autoFocus
          />
        ),
        okText: '创建',
        cancelText: '取消',
        onOk: () => resolve(inputValue.trim() || null),
        onCancel: () => resolve(null),
      });
    });
    if (!name) return;
    setQuickCreating(true);
    try {
      const res = await warehouseAreaApi.quickCreate(name, warehouseType);
      const data = (res as any)?.data?.data || (res as any)?.data;
      if (data?.id) {
        message.success(`仓库区域「${name}」创建成功`);
        setSelectedAreaId(data.id);
        form.setFieldValue('warehouseAreaId', data.id);
      }
    } catch (e: any) {
      message.error(e.message || '创建失败');
    } finally {
      setQuickCreating(false);
    }
  };

  const handleAreaChange = useCallback((areaId: string) => {
    setSelectedAreaId(areaId);
    form.setFieldValue('warehouseLocation', undefined);
  }, [form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (!skuCode.trim()) {
        message.warning('请输入SKU编码');
        return;
      }
      setLoading(true);
      const params: any = {
        skuCode: skuCode.trim(),
        quantity: values.quantity,
        warehouseAreaId: values.warehouseAreaId || undefined,
        warehouseLocation: values.warehouseLocation || '默认仓',
        sourceType: values.sourceType,
        remark: values.remark,
        supplierName: values.supplierName,
        unitPrice: values.unitPrice,
      };
      if (autoCreate && showCreateFields) {
        params.autoCreateSku = true;
        params.styleNo = values.styleNo;
        params.styleName = values.styleName;
        params.color = values.color;
        params.size = values.size;
      }
      const res = await finishedWarehouseApi.freeInbound(params);
      const result = res.data?.data || res.data;
      message.success('入库成功');
      if (result?.qrcode) {
        showQrcodePrint(result);
      }
      onSuccess();
      form.resetFields();
      setSkuCode('');
      setSkuInfo(null);
      setAutoCreate(false);
      setShowCreateFields(false);
      setSelectedAreaId(undefined);
    } catch (e: any) {
      if (e.message) message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBatchSubmit = async () => {
    if (batchItems.length === 0) {
      message.warning('请添加入库SKU');
      return;
    }
    const values = form.getFieldsValue();
    setLoading(true);
    try {
      const items = batchItems.map(item => ({
        skuCode: item.skuCode,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      }));
      await finishedWarehouseApi.batchInbound({
        items,
        warehouseAreaId: values.warehouseAreaId || undefined,
        warehouseLocation: values.warehouseLocation || '默认仓',
        sourceType: values.sourceType || 'free_inbound',
      });
      message.success(`批量入库成功，共${batchItems.length}个SKU`);
      setBatchItems([]);
      onSuccess();
    } catch (e: any) {
      if (e.message) message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const showQrcodePrint = (warehousingRecord: any) => {
    const printContent = printRef.current;
    if (!printContent) return;
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) return;
    printContent.style.display = 'block';
    printContent.innerHTML = `
      <div style="text-align:center;padding:20px;font-family:sans-serif;">
        <h3 style="margin:0 0 12px;">入库标签</h3>
        <div style="font-size:14px;margin-bottom:8px;">款号: ${warehousingRecord.styleNo || '-'}</div>
        <div style="font-size:14px;margin-bottom:8px;">SKU: ${warehousingRecord.skuCode || '-'}</div>
        <div style="font-size:14px;margin-bottom:8px;">颜色/尺码: ${warehousingRecord.color || '-'}/${warehousingRecord.size || '-'}</div>
        <div style="font-size:14px;margin-bottom:8px;">数量: ${warehousingRecord.warehousingQuantity || 0} 件</div>
        <div style="font-size:14px;margin-bottom:8px;">仓库: ${warehousingRecord.warehouse || '-'}</div>
        <div style="font-size:14px;margin-bottom:8px;">单号: ${warehousingRecord.warehousingNo || '-'}</div>
        <div style="font-size:11px;color:#999;margin-top:12px;">二维码: ${warehousingRecord.qrcode || '-'}</div>
        <div style="font-size:11px;color:#999;">追踪: ${warehousingRecord.traceId || '-'}</div>
      </div>
    `;
    printWindow.document.write(`<html><head><title>入库标签</title></head><body>${printContent.innerHTML}</body></html>`);
    printWindow.document.close();
    printWindow.print();
    printContent.style.display = 'none';
  };

  const handleClose = () => {
    form.resetFields();
    setSkuCode('');
    setSkuInfo(null);
    setAutoCreate(false);
    setShowCreateFields(false);
    setSelectedAreaId(undefined);
    setBatchItems([]);
    setBatchSkuInput('');
    onClose();
  };

  const selectedArea = areas.find((a) => a.id === selectedAreaId);

  const batchColumns = [
    { title: 'SKU', dataIndex: 'skuCode', key: 'skuCode', width: 160 },
    { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 100 },
    { title: '颜色', dataIndex: 'color', key: 'color', width: 80 },
    { title: '尺码', dataIndex: 'size', key: 'size', width: 60 },
    { title: '库存', dataIndex: 'stockQuantity', key: 'stockQuantity', width: 70, align: 'right' as const },
    {
      title: '入库数量', dataIndex: 'quantity', key: 'quantity', width: 100,
      render: (val: number, record: BatchItem) => (
        <InputNumber min={1} value={val} size="small" style={{ width: 80 }}
          onChange={(v) => setBatchItems(prev => prev.map(i => i.key === record.key ? { ...i, quantity: v || 1 } : i))} />
      ),
    },
    {
      title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 100,
      render: (val: number | null, record: BatchItem) => (
        <InputNumber min={0} precision={2} value={val} size="small" style={{ width: 90} }
          onChange={(v) => setBatchItems(prev => prev.map(i => i.key === record.key ? { ...i, unitPrice: v } : i))} />
      ),
    },
    {
      title: '', key: 'action', width: 40,
      render: (_: unknown, record: BatchItem) => (
        <Button type="text" danger size="small" icon={<DeleteOutlined />}
          onClick={() => setBatchItems(prev => prev.filter(i => i.key !== record.key))} />
      ),
    },
  ];

  return (
    <StandardModal
      title={<Space><InboxOutlined />成品入库</Space>}
      open={open}
      onCancel={handleClose}
      size="lg"
      footer={[
        <Button key="cancel" onClick={handleClose}>取消</Button>,
        activeTab === 'batch'
          ? <Button key="batch" type="primary" loading={loading} onClick={handleBatchSubmit}>批量入库 ({batchItems.length}项)</Button>
          : <Button key="ok" type="primary" loading={loading} onClick={() => form.submit()}>确认入库</Button>,
      ]}
    >
      <Tabs activeKey={activeTab} onChange={setActiveTab} size="small" items={[
        {
          key: 'single',
          label: '单件入库',
          children: (
            <Space direction="vertical" style={{ width: '100%' }} size={16}>
              <div>
                <div style={{ marginBottom: 4, fontSize: 12, color: 'var(--color-text-tertiary)' }}>SKU编码</div>
                <Space.Compact style={{ width: '100%' }}>
                  <Input value={skuCode} onChange={e => setSkuCode(e.target.value)} placeholder="输入SKU编码（款号-颜色-尺码）" onPressEnter={handleQuerySku} size="large" allowClear />
                  <Button type="primary" size="large" icon={<SearchOutlined />} loading={querying} onClick={handleQuerySku}>查询</Button>
                </Space.Compact>
              </div>

              {skuInfo && (
                <Card style={{ background: 'var(--color-bg-highlight)' }}>
                  <Descriptions column={3} size="small">
                    <Descriptions.Item label="款号">{skuInfo.styleNo}</Descriptions.Item>
                    <Descriptions.Item label="款名">{skuInfo.styleName}</Descriptions.Item>
                    <Descriptions.Item label="当前库存"><Tag color={skuInfo.stockQuantity > 0 ? 'green' : 'red'}>{skuInfo.stockQuantity} 件</Tag></Descriptions.Item>
                    <Descriptions.Item label="颜色">{skuInfo.color}</Descriptions.Item>
                    <Descriptions.Item label="尺码">{skuInfo.size}</Descriptions.Item>
                    <Descriptions.Item label="成本价">¥{skuInfo.costPrice}</Descriptions.Item>
                  </Descriptions>
                </Card>
              )}

              {showCreateFields && !skuInfo && (
                <Alert
                  type="warning"
                  showIcon
                  message="SKU不存在"
                  description={
                    <div style={{ marginTop: 8 }}>
                      <div style={{ marginBottom: 8 }}>
                        <Switch checked={autoCreate} onChange={setAutoCreate} />
                        <span style={{ marginLeft: 8 }}>自动创建款号和SKU后入库</span>
                      </div>
                      {autoCreate && (
                        <Row gutter={8}>
                          <Col span={6}><Input placeholder="款号" value={form.getFieldValue('styleNo')} onChange={e => form.setFieldValue('styleNo', e.target.value)} /></Col>
                          <Col span={6}><Input placeholder="款名" value={form.getFieldValue('styleName')} onChange={e => form.setFieldValue('styleName', e.target.value)} /></Col>
                          <Col span={6}><Input placeholder="颜色" value={form.getFieldValue('color')} onChange={e => form.setFieldValue('color', e.target.value)} /></Col>
                          <Col span={6}><Input placeholder="尺码" value={form.getFieldValue('size')} onChange={e => form.setFieldValue('size', e.target.value)} /></Col>
                        </Row>
                      )}
                    </div>
                  }
                />
              )}

              <Form form={form} layout="vertical" onFinish={handleSubmit}>
                <Row gutter={12}>
                  <Col span={8}>
                    <Form.Item name="quantity" label="入库数量" rules={[{ required: true, message: '请输入数量' }]}>
                      <InputNumber style={{ width: '100%' }} min={1} placeholder="数量" size="large" />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item name="sourceType" label="入库来源" initialValue="free_inbound">
                      <Select size="large">
                        <Select.Option value="external_purchase">外采入库</Select.Option>
                        <Select.Option value="free_inbound">自由入库</Select.Option>
                        <Select.Option value="transfer_in">调拨入库</Select.Option>
                        <Select.Option value="return_in">退货入库</Select.Option>
                        <Select.Option value="other_in">其他入库</Select.Option>
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item name="supplierName" label="供应商（选填）">
                      <Input placeholder="外采时填写供应商" />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item
                      name="warehouseAreaId"
                      label={
                        <Space size={4}>
                          <span>入库仓库</span>
                          <Button type="link" icon={<PlusOutlined />} loading={quickCreating} onClick={handleQuickCreateArea} style={{ padding: 0, height: 'auto', fontSize: 12 }}>新建仓库</Button>
                        </Space>
                      }
                    >
                      <Select placeholder="选择入库到哪个仓库" size="large" allowClear loading={areaLoading} onChange={handleAreaChange} notFoundContent={areaLoading ? '加载中...' : '暂无仓库，请先新建'}>
                        {areaOptions.map((opt) => (
                          <Select.Option key={opt.value} value={opt.value}>{opt.area.areaName || opt.area.areaCode}</Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="warehouseLocation" label="库位">
                      <Select placeholder={selectedAreaId ? '选择库位' : '请先选择仓库'} size="large" allowClear showSearch loading={locationLoading} disabled={!selectedAreaId && locationOptions.length === 0} notFoundContent={locationLoading ? '加载中...' : selectedAreaId ? '该仓库暂无库位' : '请先选择仓库'} filterOption={(input, option) => (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase()) ?? false}>
                        {locationOptions.map((opt) => (
                          <Select.Option key={opt.value} value={opt.value}>{opt.location.locationName || opt.location.locationCode}</Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>

                {selectedArea && (
                  <Alert type="info" showIcon style={{ marginBottom: 16 }} message={<span>入库至 <strong>{selectedArea.areaName || selectedArea.areaCode}</strong></span>} />
                )}

                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item name="unitPrice" label="入库单价">
                      <InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="入库单价（必填）" />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item name="remark" label="备注">
                  <Input.TextArea rows={2} placeholder="选填" />
                </Form.Item>
              </Form>
            </Space>
          ),
        },
        {
          key: 'batch',
          label: '批量入库',
          children: (
            <Space direction="vertical" style={{ width: '100%' }} size={16}>
              <div>
                <div style={{ marginBottom: 4, fontSize: 12, color: 'var(--color-text-tertiary)' }}>添加SKU</div>
                <Space.Compact style={{ width: '100%' }}>
                  <Input value={batchSkuInput} onChange={e => setBatchSkuInput(e.target.value)} placeholder="输入SKU编码，回车添加" onPressEnter={handleBatchQuerySku} size="large" allowClear />
                  <Button type="primary" size="large" icon={<PlusOutlined />} onClick={handleBatchQuerySku}>添加</Button>
                </Space.Compact>
              </div>

              {batchItems.length > 0 && (
                <>
                  <Table columns={batchColumns} dataSource={batchItems} rowKey="key" pagination={false} size="small" />
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--color-bg-highlight)', borderRadius: 6 }}>
                    <span>共 <b>{batchItems.length}</b> 个SKU</span>
                    <span>合计 <b>{batchItems.reduce((s, i) => s + i.quantity, 0)}</b> 件</span>
                    <span>总金额 <b>¥{batchItems.reduce((s, i) => s + (i.quantity * (i.unitPrice || 0)), 0).toFixed(2)}</b></span>
                  </div>
                </>
              )}

              <Divider style={{ margin: '8px 0' }} />

              <Row gutter={12}>
                <Col span={8}>
                  <div style={{ marginBottom: 4, fontSize: 12, color: 'var(--color-text-tertiary)' }}>入库来源</div>
                  <Select size="large" value={form.getFieldValue('sourceType') || 'free_inbound'} onChange={v => form.setFieldValue('sourceType', v)}>
                    <Select.Option value="external_purchase">外采入库</Select.Option>
                    <Select.Option value="free_inbound">自由入库</Select.Option>
                    <Select.Option value="transfer_in">调拨入库</Select.Option>
                    <Select.Option value="return_in">退货入库</Select.Option>
                  </Select>
                </Col>
                <Col span={8}>
                  <div style={{ marginBottom: 4, fontSize: 12, color: 'var(--color-text-tertiary)' }}>入库仓库</div>
                  <Select placeholder="选择仓库" size="large" allowClear loading={areaLoading} onChange={(v) => { handleAreaChange(v); form.setFieldValue('warehouseAreaId', v); }} value={form.getFieldValue('warehouseAreaId')}>
                    {areaOptions.map((opt) => (
                      <Select.Option key={opt.value} value={opt.value}>{opt.area.areaName || opt.area.areaCode}</Select.Option>
                    ))}
                  </Select>
                </Col>
                <Col span={8}>
                  <div style={{ marginBottom: 4, fontSize: 12, color: 'var(--color-text-tertiary)' }}>库位</div>
                  <Select placeholder="选择库位" size="large" allowClear loading={locationLoading} disabled={!selectedAreaId && locationOptions.length === 0} value={form.getFieldValue('warehouseLocation')} onChange={v => form.setFieldValue('warehouseLocation', v)}>
                    {locationOptions.map((opt) => (
                      <Select.Option key={opt.value} value={opt.value}>{opt.location.locationName || opt.location.locationCode}</Select.Option>
                    ))}
                  </Select>
                </Col>
              </Row>
            </Space>
          ),
        },
      ]} />
      <div ref={printRef} style={{ display: 'none' }} />
    </StandardModal>
  );
};

export default FreeInboundModal;
