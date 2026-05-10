import React, { useState, useRef, useEffect } from 'react';
import { Modal, Input, InputNumber, Select, Button, Space, Card, Row, Col, Tag, message, Descriptions } from 'antd';
import { ScanOutlined, InboxOutlined, LogoutOutlined, SearchOutlined } from '@ant-design/icons';
import { materialWarehouseApi } from '../../../../services/warehouse/inventoryCheckApi';
import WarehouseLocationAutoComplete from '@/components/common/WarehouseLocationAutoComplete';

interface MaterialScanOperationModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const MaterialScanOperationModal: React.FC<MaterialScanOperationModalProps> = ({ open, onClose, onSuccess }) => {
  const [materialCode, setMaterialCode] = useState('');
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
      setMaterialCode(''); setScanResult(null); setQuantity(1);
      setWarehouseLocation(''); setSourceType('scan_inbound');
      setOutstockType('scan_outbound'); setRemark('');
      setTimeout(() => inputRef.current?.focus?.(), 100);
    }
  }, [open]);

  const handleQuery = async () => {
    if (!materialCode.trim()) { message.warning('请输入或扫描物料编码'); return; }
    setQuerying(true);
    try {
      const res = await materialWarehouseApi.scanQuery(materialCode.trim());
      const data = res.data?.data || res.data;
      setScanResult(data);
      if (!data.found) message.warning(data.message || '物料不存在');
    } catch (e: any) { message.error(e.message || '查询失败'); setScanResult(null); }
    finally { setQuerying(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); handleQuery(); } };

  const handleConfirm = async () => {
    if (!materialCode.trim()) { message.warning('请输入或扫描物料编码'); return; }
    if (quantity <= 0) { message.warning('数量必须大于0'); return; }
    setLoading(true);
    try {
      if (operationType === 'inbound') {
        await materialWarehouseApi.scanInbound({ materialCode: materialCode.trim(), quantity, warehouseLocation: warehouseLocation || '默认仓', sourceType, remark });
        message.success('物料扫码入库成功');
      } else {
        await materialWarehouseApi.scanOutbound({ materialCode: materialCode.trim(), quantity, outstockType, remark });
        message.success('物料扫码出库成功');
      }
      onSuccess();
    } catch (e: any) { message.error(e.message || '操作失败'); }
    finally { setLoading(false); }
  };

  return (
    <Modal title={<Space><ScanOutlined />物料扫码出入库</Space>} open={open} onCancel={onClose} width={640}
      footer={[<Button key="cancel" onClick={onClose}>取消</Button>, <Button key="ok" type="primary" loading={loading} onClick={handleConfirm}>{operationType === 'inbound' ? '确认入库' : '确认出库'}</Button>]}>
      <Space orientation="vertical" style={{ width: '100%' }} size={16}>
        <Row gutter={12}>
          <Col span={12}>
            <div style={{ marginBottom: 4, fontSize: 12, color: '#999' }}>操作类型</div>
            <Select style={{ width: '100%' }} value={operationType} onChange={setOperationType}>
              <Select.Option value="inbound"><Space><InboxOutlined />入库</Space></Select.Option>
              <Select.Option value="outbound"><Space><LogoutOutlined />出库</Space></Select.Option>
            </Select>
          </Col>
        </Row>
        <div>
          <div style={{ marginBottom: 4, fontSize: 12, color: '#999' }}>扫码/输入物料编码</div>
          <Space.Compact style={{ width: '100%' }}>
            <Input ref={inputRef} value={materialCode} onChange={e => setMaterialCode(e.target.value)} onKeyDown={handleKeyDown} placeholder="扫描枪扫码或手动输入物料编码" prefix={<ScanOutlined />} size="large" allowClear />
            <Button type="primary" size="large" icon={<SearchOutlined />} loading={querying} onClick={handleQuery}>查询</Button>
          </Space.Compact>
        </div>
        {scanResult?.found && (
          <Card size="small" style={{ background: '#f6f8fa' }}>
            <Descriptions size="small" column={3}>
              <Descriptions.Item label="物料名称">{scanResult.materialName}</Descriptions.Item>
              <Descriptions.Item label="类型">{scanResult.materialType}</Descriptions.Item>
              <Descriptions.Item label="仓位">{scanResult.location}</Descriptions.Item>
              <Descriptions.Item label="当前库存"><Tag color={scanResult.quantity > 0 ? 'green' : 'red'}>{scanResult.quantity} {scanResult.unit}</Tag></Descriptions.Item>
              <Descriptions.Item label="锁定量">{scanResult.lockedQuantity}</Descriptions.Item>
              <Descriptions.Item label="单价">¥{scanResult.unitPrice}</Descriptions.Item>
            </Descriptions>
          </Card>
        )}
        <Row gutter={12}>
          <Col span={8}>
            <div style={{ marginBottom: 4, fontSize: 12, color: '#999' }}>数量</div>
            <InputNumber style={{ width: '100%' }} min={1} value={quantity} onChange={v => setQuantity(v || 1)} size="large" />
          </Col>
          {operationType === 'inbound' ? (
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
                <WarehouseLocationAutoComplete warehouseType="MATERIAL" value={warehouseLocation} onChange={setWarehouseLocation} placeholder="默认仓" />
              </Col>
            </>
          ) : (
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

export default MaterialScanOperationModal;
