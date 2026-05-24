import React, { useState, useCallback } from 'react';
import { Form, Input, InputNumber, Select, Button, Space, Row, Col, Alert, Switch, App, Divider } from 'antd';
import StandardModal from '@/components/common/StandardModal';
import ResizableTable from '@/components/common/ResizableTable';
import { InboxOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { finishedWarehouseApi } from '../../../../services/warehouse/inventoryCheckApi';
import { useWarehouseAreaOptions, useWarehouseLocationByArea } from '../../../../hooks/useWarehouseAreaOptions';
import { safePrint } from '@/utils/safePrint';
import { formatMoney } from '@/utils/format';

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

interface InboundItem {
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
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [skuInput, setSkuInput] = useState('');
  const [querying, setQuerying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autoCreate, setAutoCreate] = useState(false);
  const [showCreateFields, setShowCreateFields] = useState(false);
  const [selectedAreaId, setSelectedAreaId] = useState<string | undefined>(undefined);
  const [_quickCreating, _setQuickCreating] = useState(false);
  const [items, setItems] = useState<InboundItem[]>([]);


  const sourceType = Form.useWatch('sourceType', form) || 'free_inbound';
  const warehouseType = WAREHOUSE_TYPE_MAP[sourceType] || 'FINISHED';

  const { selectOptions: areaOptions, loading: areaLoading, areas } = useWarehouseAreaOptions(warehouseType as any);
  const { selectOptions: locationOptions, loading: locationLoading } = useWarehouseLocationByArea(warehouseType, selectedAreaId);

  const handleAddSku = async () => {
    if (!skuInput.trim()) {
      message.warning('请输入SKU编码');
      return;
    }
    setQuerying(true);
    try {
      const res = await finishedWarehouseApi.scanQuery(skuInput.trim());
      const data = res.data?.data || res.data;
      if (data.found) {
        const exists = items.find(i => i.skuCode === data.skuCode);
        if (exists) {
          setItems(prev => prev.map(i => i.skuCode === data.skuCode ? { ...i, quantity: i.quantity + 1 } : i));
        } else {
          setItems(prev => [...prev, {
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
        setSkuInput('');
      } else {
        if (data.canAutoCreate) {
          setShowCreateFields(true);
          form.setFieldsValue({
            styleNo: data.suggestedStyleNo,
            styleName: data.suggestedStyleName,
            color: data.suggestedColor,
            size: data.suggestedSize,
          });
          message.info('SKU不存在，可开启自动创建后添加');
        } else {
          message.warning('SKU不存在');
        }
      }
    } catch (e: any) {
      message.error(e.message || '查询失败');
    } finally {
      setQuerying(false);
    }
  };

  const handleAddAutoCreateSku = () => {
    const styleNo = form.getFieldValue('styleNo');
    const styleName = form.getFieldValue('styleName');
    const color = form.getFieldValue('color');
    const size = form.getFieldValue('size');
    if (!styleNo || !color || !size) {
      message.warning('请填写款号、颜色、尺码');
      return;
    }
    const skuCode = `${styleNo}-${color}-${size}`;
    const exists = items.find(i => i.skuCode === skuCode);
    if (exists) {
      setItems(prev => prev.map(i => i.skuCode === skuCode ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setItems(prev => [...prev, {
        key: `auto-${skuCode}-${Date.now()}`,
        skuCode,
        styleNo,
        styleName: styleName || '',
        color,
        size,
        quantity: 1,
        unitPrice: null,
        stockQuantity: 0,
        autoCreate: true,
      } as any]);
    }
    setShowCreateFields(false);
    setAutoCreate(false);
    message.success('已添加到入库列表');
  };

  const _handleQuickCreateArea = async () => {
    message.info('请前往「库位地图」页面创建新仓库');
  };

  const handleAreaChange = useCallback((areaId: string) => {
    setSelectedAreaId(areaId);
    form.setFieldValue('warehouseLocation', undefined);
  }, [form]);

  const handleSubmit = async () => {
    if (items.length === 0) {
      message.warning('请添加入库SKU');
      return;
    }
    const values = form.getFieldsValue();
    setLoading(true);
    try {
      const submitItems = items.map(item => ({
        skuCode: item.skuCode,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        ...(item as any).autoCreate ? { autoCreateSku: true, styleNo: item.styleNo, styleName: item.styleName, color: item.color, size: item.size } : {},
      }));
      if (items.length === 1) {
        const item = items[0];
        const params: any = {
          skuCode: item.skuCode,
          quantity: item.quantity,
          warehouseAreaId: values.warehouseAreaId || undefined,
          warehouseLocation: values.warehouseLocation || '默认仓',
          sourceType: values.sourceType || 'free_inbound',
          remark: values.remark,
          supplierName: values.supplierName,
          unitPrice: item.unitPrice,
        };
        if ((item as any).autoCreate) {
          params.autoCreateSku = true;
          params.styleNo = item.styleNo;
          params.styleName = item.styleName;
          params.color = item.color;
          params.size = item.size;
        }
        const res = await finishedWarehouseApi.freeInbound(params);
        const result = res.data?.data || res.data;
        message.success('入库成功');
        if (result?.qrcode) {
          showQrcodePrint(result);
        }
      } else {
        await finishedWarehouseApi.batchInbound({
          items: submitItems,
          warehouseAreaId: values.warehouseAreaId || undefined,
          warehouseLocation: values.warehouseLocation || '默认仓',
          sourceType: values.sourceType || 'free_inbound',
        });
        message.success(`入库成功，共${items.length}个SKU`);
      }
      setItems([]);
      onSuccess();
    } catch (e: any) {
      if (e.message) message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const showQrcodePrint = (warehousingRecord: any) => {
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>入库标签</title></head><body>
      <div style="text-align:center;padding:20px;font-family:sans-serif;">
        <h3 style="margin:0 0 12px;">入库标签</h3>
        <div style="font-size:14px;margin-bottom:8px;">款号: ${warehousingRecord.styleNo || '-'}</div>
        <div style="font-size:14px;margin-bottom:8px;">SKU: ${warehousingRecord.skuCode || '-'}</div>
        <div style="font-size:14px;margin-bottom:8px;">颜色/尺码: ${warehousingRecord.color || '-'}/${warehousingRecord.size || '-'}</div>
        <div style="font-size:14px;margin-bottom:8px;">数量: ${warehousingRecord.warehousingQuantity || 0} 件</div>
        <div style="font-size:14px;margin-bottom:8px;">仓库: ${warehousingRecord.warehouse || '-'}</div>
        <div style="font-size:14px;margin-bottom:8px;">单号: ${warehousingRecord.warehousingNo || '-'}</div>
        <div style="font-size:13px;color:#999;margin-top:12px;">二维码: ${warehousingRecord.qrcode || '-'}</div>
        <div style="font-size:13px;color:#999;">追踪: ${warehousingRecord.traceId || '-'}</div>
      </div>
    </body></html>`;
    safePrint(html, '入库标签');
  };

  const handleClose = () => {
    form.resetFields();
    setSkuInput('');
    setAutoCreate(false);
    setShowCreateFields(false);
    setSelectedAreaId(undefined);
    setItems([]);
    onClose();
  };

  const selectedArea = areas.find((a) => a.id === selectedAreaId);

  const columns = [
    { title: 'SKU', dataIndex: 'skuCode', key: 'skuCode', width: 160 },
    { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 100 },
    { title: '颜色', dataIndex: 'color', key: 'color', width: 80 },
    { title: '尺码', dataIndex: 'size', key: 'size', width: 60 },
    { title: '库存', dataIndex: 'stockQuantity', key: 'stockQuantity', width: 70, align: 'right' as const },
    {
      title: '入库数量', dataIndex: 'quantity', key: 'quantity', width: 100,
      render: (val: number, record: InboundItem) => (
        <InputNumber min={1} value={val} size="small" style={{ width: 80 }}
          onChange={(v) => setItems(prev => prev.map(i => i.key === record.key ? { ...i, quantity: v || 1 } : i))} />
      ),
    },
    {
      title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 100,
      render: (val: number | null, record: InboundItem) => (
        <InputNumber min={0} precision={2} value={val} size="small" style={{ width: 90 }}
          onChange={(v) => setItems(prev => prev.map(i => i.key === record.key ? { ...i, unitPrice: v } : i))} />
      ),
    },
    {
      title: '', key: 'action', width: 40,
      render: (_: unknown, record: InboundItem) => (
        <Button type="text" danger size="small" icon={<DeleteOutlined />}
          onClick={() => setItems(prev => prev.filter(i => i.key !== record.key))} />
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
        <Button key="ok" type="primary" loading={loading} disabled={items.length === 0} onClick={handleSubmit}>
          确认入库{items.length > 0 ? ` (${items.length}项)` : ''}
        </Button>,
      ]}
    >
      <Space vertical style={{ width: '100%' }} size={16}>
        <div>
          <div style={{ marginBottom: 4, fontSize: 14, color: 'var(--color-text-tertiary)' }}>添加SKU</div>
          <Space.Compact style={{ width: '100%' }}>
            <Input value={skuInput} onChange={e => setSkuInput(e.target.value)} placeholder="输入SKU编码（款号-颜色-尺码），回车添加" onPressEnter={handleAddSku} size="large" allowClear />
            <Button type="primary" size="large" icon={<PlusOutlined />} loading={querying} onClick={handleAddSku}>添加</Button>
          </Space.Compact>
        </div>

        {showCreateFields && (
          <Alert
            type="warning"
            showIcon
            title="SKU不存在"
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
                    <Col span={24} style={{ marginTop: 8 }}><Button type="primary" size="small" onClick={handleAddAutoCreateSku}>添加到列表</Button></Col>
                  </Row>
                )}
              </div>
            }
          />
        )}

        {items.length > 0 && (
          <>
            <ResizableTable columns={columns} dataSource={items} rowKey="key" pagination={false} size="small" />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--color-bg-highlight)', borderRadius: 6 }}>
              <span>共 <b>{items.length}</b> 个SKU</span>
              <span>合计 <b>{items.reduce((s, i) => s + i.quantity, 0)}</b> 件</span>
              <span>总金额 <b>{formatMoney(items.reduce((s, i) => s + (i.quantity * (i.unitPrice || 0)), 0))}</b></span>
            </div>
          </>
        )}

        <Divider style={{ margin: '8px 0' }} />

        <Row gutter={12}>
          <Col span={8}>
            <Form.Item name="sourceType" label="入库来源" initialValue="free_inbound">
              <Select size="large">
                <Select.Option value="external_purchase">外采入库</Select.Option>
                <Select.Option value="free_inbound">无采购单入库</Select.Option>
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
              label="入库仓库"
            >
              <Select placeholder="选择入库到哪个仓库" size="large" allowClear loading={areaLoading} onChange={handleAreaChange} notFoundContent={areaLoading ? '加载中...' : '暂无仓库，请前往库位地图创建'}>
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
          <Alert type="info" showIcon style={{ marginBottom: 16 }} title={<span>入库至 <strong>{selectedArea.areaName || selectedArea.areaCode}</strong></span>} />
        )}

        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={2} placeholder="选填" />
        </Form.Item>
      </Space>
      <div style={{ display: 'none' }} />
    </StandardModal>
  );
};

export default FreeInboundModal;
