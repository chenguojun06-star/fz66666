import React, { useState, useEffect } from 'react';
import {
  Form, Select, InputNumber, Descriptions, Button, Space,
  Alert, Typography, Tag, Divider, message, Timeline, Spin,
} from 'antd';
import {
  SendOutlined, PrinterOutlined, CalculatorOutlined,
  LoadingOutlined, EnvironmentOutlined,
} from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import api from '@/utils/api';

const { Text, Title } = Typography;

const EXPRESS_COMPANIES = [
  { code: 1, name: '顺丰速运', short: 'SF' },
  { code: 2, name: '申通快递', short: 'STO' },
  { code: 3, name: '圆通速递', short: 'YTO' },
  { code: 4, name: '中通快递', short: 'ZTO' },
  { code: 5, name: 'EMS', short: 'EMS' },
  { code: 6, name: '京东物流', short: 'JD' },
  { code: 7, name: '韵达快递', short: 'YD' },
];

interface EcOrder {
  id: number; orderNo: string; platformOrderNo: string;
  receiverName: string; receiverPhone: string; receiverAddress: string;
  productName: string; quantity: number; trackingNo: string; expressCompany: string;
}

interface ExpressOrderModalProps {
  open: boolean;
  order: EcOrder | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface ShipResult {
  expressOrderId: string; trackingNo: string;
  companyName: string; companyCode: string;
  receiverName: string; receiverPhone: string; receiverAddress: string;
}

const ExpressOrderModal: React.FC<ExpressOrderModalProps> = ({ open, order, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [feeMap, setFeeMap] = useState<Record<string, number>>({});
  const [result, setResult] = useState<ShipResult | null>(null);
  const [tracking, setTracking] = useState(false);
  const [trackList, setTrackList] = useState<{ time: string; status: string; desc: string }[]>([]);

  useEffect(() => {
    if (open && order) {
      form.setFieldsValue({
        expressCompany: 1,
        weight: 1.0,
      });
      setResult(null);
      setFeeMap({});
      setTrackList([]);
      setTracking(false);
    }
  }, [open, order, form]);

  const handleEstimateFee = async () => {
    if (!order) return;
    setEstimating(true);
    try {
      const weight = form.getFieldValue('weight') || 1.0;
      const res = await api.post('/express-order/estimate-fee', {
        ecommerceOrderId: String(order.id),
        weight,
      });
      if (res.data) {
        setFeeMap(res.data);
        message.success('运费估算完成');
      }
    } catch {
      message.warning('运费估算失败，请稍后重试');
    } finally {
      setEstimating(false);
    }
  };

  const handleSubmit = async () => {
    if (!order) return;
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      const res = await api.post('/express-order/create', {
        ecommerceOrderId: String(order.id),
        expressCompany: values.expressCompany,
        weight: values.weight,
      });
      if (res.data) {
        setResult(res.data);
        message.success('快递下单成功！');
        onSuccess();
      } else {
        message.error(res.msg || '下单失败');
      }
    } catch (e: any) {
      message.error(e?.response?.data?.msg || '下单失败，请检查物流渠道是否已配置');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = () => {
    if (!result || !order) return;
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) return;
    printWindow.document.write(generateWaybillHtml(result, order));
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  const handleTrack = async () => {
    if (!result) return;
    setTracking(true);
    try {
      const res = await api.get(`/express-order/track/${result.trackingNo}`, {
        params: { companyCode: result.companyCode || 1 },
      });
      if (res.data && Array.isArray(res.data)) {
        setTrackList(res.data);
      } else {
        setTrackList([{ time: new Date().toLocaleString(), status: '已揽收', desc: '运单已创建，等待快递员揽收' }]);
      }
    } catch {
      setTrackList([{ time: new Date().toLocaleString(), status: '已揽收', desc: '运单已创建，物流信息稍后更新' }]);
    } finally {
      setTracking(false);
    }
  };

  const selectedCompany = Form.useWatch('expressCompany', form);
  const _selectedWeight = Form.useWatch('weight', form);
  const companyShort = EXPRESS_COMPANIES.find(c => c.code === selectedCompany)?.short || 'SF';
  const currentFee = feeMap[companyShort] ?? null;

  if (!order) return null;

  const alreadyShipped = order.trackingNo && order.trackingNo.length > 0;

  return (
    <ResizableModal
      title={<span><SendOutlined /> 快递下单</span>}
      open={open}
      onCancel={onClose}
      width="40vw"
      footer={
        result ? [
          <Button key="track" icon={<EnvironmentOutlined />} loading={tracking} onClick={handleTrack}>
            查询物流轨迹
          </Button>,
          <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={handlePrint}>
            打印电子面单
          </Button>,
          <Button key="close" onClick={onClose}>关闭</Button>,
        ] : alreadyShipped ? [
          <Button key="close" onClick={onClose}>关闭</Button>,
        ] : [
          <Button key="cancel" onClick={onClose}>取消</Button>,
          <Button key="submit" type="primary" icon={<SendOutlined />} loading={submitting} onClick={handleSubmit}>
            确认下单
          </Button>,
        ]
      }
    >
      {result ? (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <Title level={4} type="success">快递下单成功！</Title>
          <Descriptions column={1} size="small" style={{ marginTop: 16 }}>
            <Descriptions.Item label="物流公司">{result.companyName}</Descriptions.Item>
            <Descriptions.Item label="运单号">
              <Text copyable strong style={{ fontSize: 18 }}>{result.trackingNo}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="收件人">{result.receiverName}</Descriptions.Item>
            <Descriptions.Item label="收件电话">{result.receiverPhone}</Descriptions.Item>
            <Descriptions.Item label="收件地址">{result.receiverAddress}</Descriptions.Item>
          </Descriptions>
          <Alert
            type="info"
            title="请点击「打印电子面单」按钮打印快递面单，贴到包裹上即可发货"
            style={{ marginTop: 16 }}
          />
          {trackList.length > 0 && (
            <div style={{ marginTop: 16, textAlign: 'left' }}>
              <Divider plain>物流轨迹</Divider>
              <Spin spinning={tracking}>
                <Timeline
                  items={trackList.map((t, i) => ({
                    color: i === 0 ? 'green' : 'blue',
                    children: (
                      <div>
                        <div style={{ fontWeight: 500 }}>{t.status}</div>
                        <div style={{ color: '#999', fontSize: 14 }}>{t.time}</div>
                        <div>{t.desc}</div>
                      </div>
                    ),
                  }))}
                />
              </Spin>
            </div>
          )}
        </div>
      ) : alreadyShipped ? (
        <Alert
          type="warning"
          title="该订单已有物流信息"
          description={`运单号: ${order.trackingNo}，快递公司: ${order.expressCompany}。如需重新下单，请先取消现有运单。`}
          showIcon
        />
      ) : (
        <Form form={form} layout="vertical">
          <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="订单号">{order.orderNo}</Descriptions.Item>
            <Descriptions.Item label="平台单号">{order.platformOrderNo}</Descriptions.Item>
            <Descriptions.Item label="收件人">{order.receiverName}</Descriptions.Item>
            <Descriptions.Item label="联系电话">{order.receiverPhone}</Descriptions.Item>
            <Descriptions.Item label="收件地址" span={2}>{order.receiverAddress}</Descriptions.Item>
            <Descriptions.Item label="商品">{order.productName}</Descriptions.Item>
            <Descriptions.Item label="数量">{order.quantity}件</Descriptions.Item>
          </Descriptions>

          <Divider />

          <Form.Item name="expressCompany" label="物流公司" rules={[{ required: true, message: '请选择物流公司' }]}>
            <Select
              options={EXPRESS_COMPANIES.map(c => ({
                value: c.code,
                label: `${c.name} (${c.short})`,
              }))}
            />
          </Form.Item>

          <Form.Item name="weight" label="包裹重量 (kg)" rules={[{ required: true, message: '请输入包裹重量' }]}>
            <InputNumber min={0.1} max={500} step={0.1} style={{ width: '100%' }} addonAfter="kg" />
          </Form.Item>

          <Space>
            <Button
              icon={estimating ? <LoadingOutlined /> : <CalculatorOutlined />}
              onClick={handleEstimateFee}
              loading={estimating}
            >
              估算运费
            </Button>
            {currentFee !== null && (
              <Tag color="blue">
                {companyShort} 预估: ¥{(currentFee / 100).toFixed(2)}
              </Tag>
            )}
          </Space>
        </Form>
      )}
    </ResizableModal>
  );
};

function generateWaybillHtml(result: ShipResult, order: EcOrder): string {
  const now = new Date().toLocaleString('zh-CN');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>电子面单</title>
<style>
  @page { size: 100mm 180mm; margin: 0; }
  body { font-family: "Microsoft YaHei", sans-serif; font-size: 12px; margin: 0; padding: 5mm; }
  .waybill { border: 1.5px solid #000; padding: 4mm; min-height: 165mm; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #000; padding-bottom: 2mm; margin-bottom: 3mm; }
  .header .logo { font-size: 16px; font-weight: bold; }
  .header .no { font-size: 11px; }
  .barcode { text-align: center; margin: 3mm 0; font-family: "Libre Barcode 128", monospace; font-size: 28px; letter-spacing: 2px; }
  .section { margin-bottom: 3mm; }
  .section-title { font-weight: bold; font-size: 13px; border-bottom: 0.5px solid #999; padding-bottom: 1mm; margin-bottom: 2mm; }
  .row { display: flex; margin-bottom: 1.5mm; }
  .label { width: 28mm; color: #666; flex-shrink: 0; }
  .value { flex: 1; font-weight: bold; }
  .two-col { display: flex; gap: 3mm; }
  .two-col > div { flex: 1; }
  .stamp { text-align: right; margin-top: 5mm; }
  .stamp .box { display: inline-block; border: 1px solid #f00; color: #f00; padding: 2mm 4mm; font-size: 14px; }
  @media print { body { -webkit-print-color-adjust: exact; } }
</style></head><body>
<div class="waybill">
  <div class="header">
    <div class="logo">${result.companyName} 电子面单</div>
    <div class="no">下单时间: ${now}</div>
  </div>
  <div class="barcode">*${result.trackingNo}*</div>
  <div class="section">
    <div class="section-title">运单号: ${result.trackingNo}</div>
  </div>
  <div class="two-col">
    <div>
      <div class="section"><div class="section-title">寄件人</div>
        <div class="row"><span class="label">公司/姓名</span><span class="value">东方制衣厂</span></div>
        <div class="row"><span class="label">电话</span><span class="value">13800000000</span></div>
        <div class="row"><span class="label">地址</span><span class="value">广东省广州市白云区石井街道东方制衣厂</span></div>
      </div>
    </div>
    <div>
      <div class="section"><div class="section-title">收件人</div>
        <div class="row"><span class="label">姓名</span><span class="value">${result.receiverName}</span></div>
        <div class="row"><span class="label">电话</span><span class="value">${result.receiverPhone}</span></div>
        <div class="row"><span class="label">地址</span><span class="value">${result.receiverAddress}</span></div>
      </div>
    </div>
  </div>
  <div class="section"><div class="section-title">货物信息</div>
    <div class="row"><span class="label">品名</span><span class="value">${order.productName}</span></div>
    <div class="row"><span class="label">数量</span><span class="value">${order.quantity} 件</span></div>
    <div class="row"><span class="label">订单号</span><span class="value">${order.orderNo}</span></div>
  </div>
  <div class="stamp"><div class="box">已揽收</div></div>
</div>
</body></html>`;
}

export default ExpressOrderModal;