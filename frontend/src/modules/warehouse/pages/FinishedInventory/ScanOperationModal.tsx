import React, { useState, useRef, useEffect } from 'react';
import { Modal, Form, Input, InputNumber, Select, Button, Space, Card, Row, Col, Tag, message, Descriptions, Divider } from 'antd';
import { ScanOutlined, InboxOutlined, LogoutOutlined, SearchOutlined } from '@ant-design/icons';
import { warehouseOperationApi } from '../../../../services/warehouse/inventoryCheckApi';
import DictAutoComplete from '@/components/common/DictAutoComplete';

interface ScanOperationModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultWarehouseType?: 'finished' | 'material';
}

const ScanOperationModal: React.FC<ScanOperationModalProps> = ({ open, onClose, onSuccess, defaultWarehouseType = 'finished' }) => {
  const [warehouseType, setWarehouseType] = useState<'finished' | 'material'>(defaultWarehouseType);
  const [scanCode, setScanCode] = useState('');
  const [scanResult, setScanResult] = useState<any>(null);
  const [quantity, setQuantity] = useState(1);
  const [warehouseLocation, setWarehouseLocation] = useState('');
  const [operationType, setOperationType] = useState<'inbound' | 'outbound'>('inbound');
  const [sourceType, setSourceType] = useState('scan_inbound');
  const [outstockType, setOutstockType] = useState('scan_outbound');
  const [remark, setRemark] = useState('');
  const [loading, setLoading] = useState(false);
  const [querying, setQuerying] = useState(false);
  const inputRef = useRef<any>(null);

  useEffect(() => {
    if (open) {
      setScanCode('');
      setScanResult(null);
      setQuantity(1);
      setWarehouseLocation('');
      setSourceType('scan_inbound');
      setOutstockType('scan_outbound');
      setRemark('');
      setTimeout(() => inputRef.current?.focus?.(), 100);
    }
  }, [open]);

  const handleScanQuery = async () => {
    if (!scanCode.trim()) {
      message.warning('请输入或扫描编码');
      return;
    }
    setQuerying(true);
    try {
      const res = await warehouseOperationApi.scanQuery(scanCode.trim(), warehouseType);
      const data = res.data?.data || res.data;
      setScanResult(data);
      if (!data.found) {
        message.warning(data.message || '未找到对应记录');
      }
    } catch (e: any) {
      message.error(e.message || '查询失败');
      setScanResult(null);
    } finally {
      setQuerying(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleScanQuery();
    }
  };

  const handleConfirm = async () => {
    if (!scanCode.trim()) {
      message.warning('请输入或扫描编码');
      return;
    }
    if (quantity <= 0) {
      message.warning('数量必须大于0');
      return;
    }
    setLoading(true);
    try {
      if (operationType === 'inbound') {
        await warehouseOperationApi.scanInbound({
          scanCode: scanCode.trim(),
          warehouseType,
          quantity,
          warehouseLocation: warehouseLocation || '默认仓',
          sourceType,
          remark,
        });
        message.success('扫码入库成功');
      } else {
        await warehouseOperationApi.scanOutbound({
          scanCode: scanCode.trim(),
          warehouseType,
          quantity,
          outstockType,
          remark,
        });
        message.success('扫码出库成功');
      }
      onSuccess();
    } catch (e: any) {
      message.error(e.message || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  const dictType = warehouseType === 'finished' ? 'finished_warehouse_location' : 'material_warehouse_location';

  return (
    <Modal
      title={<Space><ScanOutlined />扫码出入库</Space>}
      open={open}
      onCancel={onClose}
      width={640}
      footer={[
        <Button key="cancel" onClick={onClose}>取消</Button>,
        <Button key="ok" type="primary" loading={loading} onClick={handleConfirm}>
          {operationType === 'inbound' ? '确认入库' : '确认出库'}
        </Button>,
      ]}
    >
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <Row gutter={12}>
          <Col span={12}>
            <div style={{ marginBottom: 4, fontSize: 12, color: '#999' }}>仓库类型</div>
            <Select style={{ width: '100%' }} value={warehouseType} onChange={v => { setWarehouseType(v); setScanResult(null); }}>
              <Select.Option value="finished">成品仓库</Select.Option>
              <Select.Option value="material">物料仓库</Select.Option>
            </Select>
          </Col>
          <Col span={12}>
            <div style={{ marginBottom: 4, fontSize: 12, color: '#999' }}>操作类型</div>
            <Select style={{ width: '100%' }} value={operationType} onChange={v => setOperationType(v)}>
              <Select.Option value="inbound"><Space><InboxOutlined />入库</Space></Select.Option>
              <Select.Option value="outbound"><Space><LogoutOutlined />出库</Space></Select.Option>
            </Select>
          </Col>
        </Row>

        <div>
          <div style={{ marginBottom: 4, fontSize: 12, color: '#999' }}>扫码/输入编码</div>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              ref={inputRef}
              value={scanCode}
              onChange={e => setScanCode(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="扫描枪扫码或手动输入SKU/物料编码"
              prefix={<ScanOutlined />}
              size="large"
              allowClear
            />
            <Button type="primary" size="large" icon={<SearchOutlined />} loading={querying} onClick={handleScanQuery}>查询</Button>
          </Space.Compact>
        </div>

        {scanResult?.found && (
          <Card size="small" style={{ background: '#f6f8fa' }}>
            {warehouseType === 'finished' ? (
              <Descriptions size="small" column={3}>
                <Descriptions.Item label="款号">{scanResult.styleNo}</Descriptions.Item>
                <Descriptions.Item label="颜色">{scanResult.color}</Descriptions.Item>
                <Descriptions.Item label="尺码">{scanResult.size}</Descriptions.Item>
                <Descriptions.Item label="当前库存"><Tag color={scanResult.stockQuantity > 0 ? 'green' : 'red'}>{scanResult.stockQuantity} 件</Tag></Descriptions.Item>
                <Descriptions.Item label="销售价">¥{scanResult.salesPrice}</Descriptions.Item>
                <Descriptions.Item label="成本价">¥{scanResult.costPrice}</Descriptions.Item>
              </Descriptions>
            ) : (
              <Descriptions size="small" column={3}>
                <Descriptions.Item label="物料名称">{scanResult.materialName}</Descriptions.Item>
                <Descriptions.Item label="类型">{scanResult.materialType}</Descriptions.Item>
                <Descriptions.Item label="仓位">{scanResult.location}</Descriptions.Item>
                <Descriptions.Item label="当前库存"><Tag color={scanResult.quantity > 0 ? 'green' : 'red'}>{scanResult.quantity} {scanResult.unit}</Tag></Descriptions.Item>
                <Descriptions.Item label="锁定量">{scanResult.lockedQuantity}</Descriptions.Item>
                <Descriptions.Item label="单价">¥{scanResult.unitPrice}</Descriptions.Item>
              </Descriptions>
            )}
          </Card>
        )}

        <Row gutter={12}>
          <Col span={8}>
            <div style={{ marginBottom: 4, fontSize: 12, color: '#999' }}>数量</div>
            <InputNumber style={{ width: '100%' }} min={1} value={quantity} onChange={v => setQuantity(v || 1)} size="large" />
          </Col>
          {operationType === 'inbound' && (
            <>
              <Col span={8}>
                <div style={{ marginBottom: 4, fontSize: 12, color: '#999' }}>入库来源</div>
                <Select style={{ width: '100%' }} value={sourceType} onChange={setSourceType}>
                  <Select.Option value="scan_inbound">扫码入库</Select.Option>
                  <Select.Option value="external_purchase">外采入库</Select.Option>
                  <Select.Option value="transfer_in">调拨入库</Select.Option>
                  <Select.Option value="return_in">退货入库</Select.Option>
                  <Select.Option value="other_in">其他入库</Select.Option>
                </Select>
              </Col>
              <Col span={8}>
                <div style={{ marginBottom: 4, fontSize: 12, color: '#999' }}>仓位</div>
                <DictAutoComplete dictType={dictType} value={warehouseLocation} onChange={setWarehouseLocation} placeholder="默认仓" />
              </Col>
            </>
          )}
          {operationType === 'outbound' && (
            <Col span={8}>
              <div style={{ marginBottom: 4, fontSize: 12, color: '#999' }}>出库类型</div>
              <Select style={{ width: '100%' }} value={outstockType} onChange={setOutstockType}>
                <Select.Option value="scan_outbound">扫码出库</Select.Option>
                <Select.Option value="free_outbound">自由出库</Select.Option>
                <Select.Option value="sample_out">样品出库</Select.Option>
                <Select.Option value="damage_out">报损出库</Select.Option>
                <Select.Option value="transfer_out">调拨出库</Select.Option>
              </Select>
            </Col>
          )}
        </Row>

        <div>
          <div style={{ marginBottom: 4, fontSize: 12, color: '#999' }}>备注</div>
          <Input.TextArea rows={2} value={remark} onChange={e => setRemark(e.target.value)} placeholder="选填" />
        </div>
      </Space>
    </Modal>
  );
};

export default ScanOperationModal;
