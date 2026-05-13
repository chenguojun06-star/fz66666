import React, { useState, useRef, useEffect } from 'react';
import { Input, InputNumber, Select, Button, Space, Card, Row, Col, Tag, message, Descriptions } from 'antd';
import StandardModal from '@/components/common/StandardModal';
import { ScanOutlined, InboxOutlined, LogoutOutlined, SearchOutlined } from '@ant-design/icons';
import { finishedWarehouseApi } from '../../../../services/warehouse/inventoryCheckApi';
import WarehouseLocationAutoComplete from '@/components/common/WarehouseLocationAutoComplete';

interface FinishedScanOperationModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const FinishedScanOperationModal: React.FC<FinishedScanOperationModalProps> = ({ open, onClose, onSuccess }) => {
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
      setScanCode(''); setScanResult(null); setQuantity(1);
      setWarehouseLocation(''); setSourceType('scan_inbound');
      setOutstockType('scan_outbound'); setRemark('');
      setTimeout(() => inputRef.current?.focus?.(), 100);
    }
  }, [open]);

  const handleScanQuery = async () => {
    if (!scanCode.trim()) { message.warning('请输入或扫描SKU编码'); return; }
    setQuerying(true);
    try {
      const res = await finishedWarehouseApi.scanQuery(scanCode.trim());
      const data = res.data?.data || res.data;
      setScanResult(data);
      if (!data.found) message.warning(data.message || 'SKU不存在');
    } catch (e: any) { message.error(e.message || '查询失败'); setScanResult(null); }
    finally { setQuerying(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); handleScanQuery(); } };

  const handleConfirm = async () => {
    if (!scanCode.trim()) { message.warning('请输入或扫描SKU编码'); return; }
    if (quantity <= 0) { message.warning('数量必须大于0'); return; }
    setLoading(true);
    try {
      if (operationType === 'inbound') {
        await finishedWarehouseApi.scanInbound({ scanCode: scanCode.trim(), quantity, warehouseLocation: warehouseLocation || '默认仓', sourceType, remark });
        message.success('成品扫码入库成功');
      } else {
        await finishedWarehouseApi.scanOutbound({ scanCode: scanCode.trim(), quantity, outstockType, remark });
        message.success('成品扫码出库成功');
      }
      onSuccess();
    } catch (e: any) { message.error(e.message || '操作失败'); }
    finally { setLoading(false); }
  };

  return (
    <StandardModal title={<Space><ScanOutlined />成品扫码出入库</Space>} open={open} onCancel={onClose} size="lg"
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
          <div style={{ marginBottom: 4, fontSize: 12, color: '#999' }}>扫码/输入SKU编码</div>
          <Space.Compact style={{ width: '100%' }}>
            <Input ref={inputRef} value={scanCode} onChange={e => setScanCode(e.target.value)} onKeyDown={handleKeyDown} placeholder="扫描枪扫码或手动输入SKU编码" prefix={<ScanOutlined />} size="large" allowClear />
            <Button type="primary" size="large" icon={<SearchOutlined />} loading={querying} onClick={handleScanQuery}>查询</Button>
          </Space.Compact>
        </div>
        {scanResult?.found && (
          <Card style={{ background: '#f6f8fa' }}>
            <Descriptions column={3}>
              <Descriptions.Item label="款号">{scanResult.styleNo}</Descriptions.Item>
              <Descriptions.Item label="颜色">{scanResult.color}</Descriptions.Item>
              <Descriptions.Item label="尺码">{scanResult.size}</Descriptions.Item>
              <Descriptions.Item label="当前库存"><Tag color={scanResult.stockQuantity > 0 ? 'green' : 'red'}>{scanResult.stockQuantity} 件</Tag></Descriptions.Item>
              <Descriptions.Item label="销售价">¥{scanResult.salesPrice}</Descriptions.Item>
              <Descriptions.Item label="成本价">¥{scanResult.costPrice}</Descriptions.Item>
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
                <WarehouseLocationAutoComplete warehouseType="FINISHED" value={warehouseLocation} onChange={setWarehouseLocation} placeholder="默认仓" />
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
    </StandardModal>
  );
};

export default FinishedScanOperationModal;
