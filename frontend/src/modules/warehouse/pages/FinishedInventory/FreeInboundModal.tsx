import React, { useState, useCallback } from 'react';
import { Modal, Form, Input, InputNumber, Select, Button, Space, Card, Row, Col, Tag, Descriptions, Alert, Switch, App } from 'antd';
import { InboxOutlined, SearchOutlined, PlusOutlined } from '@ant-design/icons';
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
      await finishedWarehouseApi.freeInbound(params);
      message.success('入库成功');
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

  const handleClose = () => {
    form.resetFields();
    setSkuCode('');
    setSkuInfo(null);
    setAutoCreate(false);
    setShowCreateFields(false);
    setSelectedAreaId(undefined);
    onClose();
  };

  const selectedArea = areas.find((a) => a.id === selectedAreaId);

  return (
    <Modal
      title={<Space><InboxOutlined />自由入库</Space>}
      open={open}
      onCancel={handleClose}
      width={680}
      footer={[
        <Button key="cancel" onClick={handleClose}>取消</Button>,
        <Button key="ok" type="primary" loading={loading} onClick={() => form.submit()}>确认入库</Button>,
      ]}
    >
      <Space orientation="vertical" style={{ width: '100%' }} size={16}>
        <div>
          <div style={{ marginBottom: 4, fontSize: 12, color: '#999' }}>SKU编码</div>
          <Space.Compact style={{ width: '100%' }}>
            <Input value={skuCode} onChange={e => setSkuCode(e.target.value)} placeholder="输入SKU编码（款号-颜色-尺码）" onPressEnter={handleQuerySku} size="large" allowClear />
            <Button type="primary" size="large" icon={<SearchOutlined />} loading={querying} onClick={handleQuerySku}>查询</Button>
          </Space.Compact>
        </div>

        {skuInfo && (
          <Card size="small" style={{ background: '#f6f8fa' }}>
            <Descriptions size="small" column={3}>
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
            title="SKU不存在"
            description={
              <div style={{ marginTop: 8 }}>
                <div style={{ marginBottom: 8 }}>
                  <Switch checked={autoCreate} onChange={setAutoCreate} size="small" />
                  <span style={{ marginLeft: 8 }}>自动创建款号和SKU后入库</span>
                </div>
                {autoCreate && (
                  <Row gutter={8}>
                    <Col span={6}><Input size="small" placeholder="款号" value={form.getFieldValue('styleNo')} onChange={e => form.setFieldValue('styleNo', e.target.value)} /></Col>
                    <Col span={6}><Input size="small" placeholder="款名" value={form.getFieldValue('styleName')} onChange={e => form.setFieldValue('styleName', e.target.value)} /></Col>
                    <Col span={6}><Input size="small" placeholder="颜色" value={form.getFieldValue('color')} onChange={e => form.setFieldValue('color', e.target.value)} /></Col>
                    <Col span={6}><Input size="small" placeholder="尺码" value={form.getFieldValue('size')} onChange={e => form.setFieldValue('size', e.target.value)} /></Col>
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
                    <Button
                      type="link"
                      size="small"
                      icon={<PlusOutlined />}
                      loading={quickCreating}
                      onClick={handleQuickCreateArea}
                      style={{ padding: 0, height: 'auto', fontSize: 12 }}
                    >
                      新建仓库
                    </Button>
                  </Space>
                }
              >
                <Select
                  placeholder="选择入库到哪个仓库"
                  size="large"
                  allowClear
                  loading={areaLoading}
                  onChange={handleAreaChange}
                  notFoundContent={areaLoading ? '加载中...' : '暂无仓库，请先新建'}
                >
                  {areaOptions.map((opt) => (
                    <Select.Option key={opt.value} value={opt.value}>
                      {opt.area.areaName || opt.area.areaCode}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="warehouseLocation" label="库位">
                <Select
                  placeholder={selectedAreaId ? '选择库位' : '请先选择仓库'}
                  size="large"
                  allowClear
                  showSearch
                  loading={locationLoading}
                  disabled={!selectedAreaId && locationOptions.length === 0}
                  notFoundContent={locationLoading ? '加载中...' : selectedAreaId ? '该仓库暂无库位' : '请先选择仓库'}
                  filterOption={(input, option) =>
                    (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase()) ?? false
                  }
                >
                  {locationOptions.map((opt) => (
                    <Select.Option key={opt.value} value={opt.value}>
                      {opt.location.locationName || opt.location.locationCode}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {selectedArea && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              title={
                <span>入库至 <strong>{selectedArea.areaName || selectedArea.areaCode}</strong></span>
              }
            />
          )}

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="unitPrice" label="单价（选填）">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="入库单价" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="选填" />
          </Form.Item>
        </Form>
      </Space>
    </Modal>
  );
};

export default FreeInboundModal;
