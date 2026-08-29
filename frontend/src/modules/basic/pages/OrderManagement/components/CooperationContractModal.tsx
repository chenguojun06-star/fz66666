import React, { useEffect, useMemo, useState } from 'react';
import { Button, DatePicker, Divider, Form, Input, Modal, Space, Typography } from 'antd';
import { PrinterOutlined, RedoOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

/**
 * D-212：合作合同模块（下单管理）
 * 标准《服装购销加工合同》模板，字段自动填充订单数据，条款内容可编辑，A4 打印。
 * 打印走独立窗口（与报价单打印同范式：独立窗口内联样式，不依赖页面 CSS 变量）。
 */

const { Text } = Typography;

export interface CooperationContractModalProps {
  open: boolean;
  onClose: () => void;
  /** 订单数据（颜色/数量/交期/客户/工厂等） */
  order: Record<string, any> | null;
}

const DEFAULT_CLAUSES = `一、产品质量：乙方按甲方提供的样衣、工艺单及确认的质量标准生产，未经甲方书面同意不得变更面料、辅料及工艺。
二、交货方式：乙方按本合同约定的交期将货物送至甲方指定仓库，运费由乙方承担；逾期交付的，每逾期一日按合同总金额的 0.5% 支付违约金。
三、验收标准：甲方收货后 7 日内验收，质量异议应在验收期内书面提出；乙方负责返修、返换。
四、结算方式：甲方凭乙方开具的增值税发票及签收单结算，月结 30 天。
五、知识产权：乙方不得将甲方的样衣、纸样、工艺资料转借第三方或用于其他用途。
六、本合同一式两份，甲乙双方各执一份，自双方签字盖章之日起生效。`;

const CooperationContractModal: React.FC<CooperationContractModalProps> = ({ open, onClose, order }) => {
  const [form] = Form.useForm();
  const [clauses, setClauses] = useState(DEFAULT_CLAUSES);

  const defaults = useMemo(() => {
    const qty = Number(order?.orderQuantity || order?.totalQuantity || 0);
    const price = Number(order?.unitPrice || 0);
    return {
      contractNo: `HT-${String(order?.orderNo || '').replace(/^PO/i, '') || dayjs().format('YYYYMMDDHHmm')}`,
      partyA: String(order?.customerName || ''),
      partyB: String(order?.factoryName || ''),
      signDate: dayjs(),
      styleName: String(order?.styleName || order?.styleNo || ''),
      quantity: qty > 0 ? String(qty) : '',
      unitPrice: price > 0 ? price.toFixed(2) : '',
      total: qty > 0 && price > 0 ? (qty * price).toFixed(2) : '',
      delivery: order?.plannedEndDate || order?.deliveryDate || '',
    };
  }, [order]);

  useEffect(() => {
    if (open) {
      form.setFieldsValue(defaults);
      setClauses(DEFAULT_CLAUSES);
    }
  }, [open, defaults, form]);

  const handlePrint = () => {
    const v = form.getFieldsValue();
    const esc = (t: any) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>合作合同 ${esc(v.contractNo)}</title>
<style>
  body { font-family: 'SimSun','Songti SC',serif; font-size: 14px; line-height: 1.9; color:#000; margin: 0; padding: 48px 56px; }
  h1 { text-align: center; font-size: 22px; letter-spacing: 6px; margin: 0 0 8px; }
  .no { text-align: center; font-size: 12px; color: #444; margin-bottom: 24px; }
  table.info { width: 100%; border-collapse: collapse; margin: 12px 0 20px; }
  table.info td { border: 1px solid #000; padding: 8px 10px; font-size: 13px; }
  .clauses { white-space: pre-wrap; text-align: justify; }
  .sign { display: flex; justify-content: space-between; margin-top: 48px; font-size: 13px; }
  @media print { body { padding: 24px 32px; } }
</style></head><body>
<h1>服装购销加工合同</h1>
<div class="no">合同编号：${esc(v.contractNo)}</div>
<table class="info">
  <tr><td style="width:50%">甲方（订购方）：${esc(v.partyA)}</td><td>乙方（加工方）：${esc(v.partyB)}</td></tr>
  <tr><td>款号 / 款名：${esc(order?.styleNo || '')} ${esc(v.styleName)}</td><td>签订日期：${esc(v.signDate)}</td></tr>
  <tr><td>数量：${esc(v.quantity)} 件</td><td>单价：¥${esc(v.unitPrice)} 元/件</td></tr>
  <tr><td>合同总金额：¥${esc(v.total)} 元</td><td>交货日期：${esc(v.delivery)}</td></tr>
</table>
<div class="clauses">经甲乙双方友好协商，就服装加工购销事宜达成如下协议：
${esc(clauses)}</div>
<div class="sign">
  <div>甲方（盖章）：${esc(v.partyA)}<br/><br/>代表签字：＿＿＿＿＿＿<br/><br/>日期：＿＿＿＿＿＿</div>
  <div>乙方（盖章）：${esc(v.partyB)}<br/><br/>代表签字：＿＿＿＿＿＿<br/><br/>日期：＿＿＿＿＿＿</div>
</div>
</body></html>`;
    const w = window.open('', '_blank', 'width=1000,height=800');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  const fieldStyle = { width: '100%' };

  return (
    <Modal
      title="合作合同"
      open={open}
      onCancel={onClose}
      width="72vw"
      footer={
        <Space>
          <Button onClick={() => { form.setFieldsValue(defaults); setClauses(DEFAULT_CLAUSES); }} icon={<RedoOutlined />}>重置</Button>
          <Button type="primary" icon={<PrinterOutlined />} onClick={handlePrint}>打印合同</Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" size="middle">
        <Divider plain>合同信息（自动填充订单数据，可修改）</Divider>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Form.Item label="合同编号" name="contractNo" style={{ marginBottom: 12 }}>
            <Input style={fieldStyle} />
          </Form.Item>
          <Form.Item label="甲方（订购方）" name="partyA" style={{ marginBottom: 12 }}>
            <Input style={fieldStyle} placeholder="客户名称" />
          </Form.Item>
          <Form.Item label="乙方（加工方）" name="partyB" style={{ marginBottom: 12 }}>
            <Input style={fieldStyle} placeholder="加工工厂" />
          </Form.Item>
          <Form.Item label="数量（件）" name="quantity" style={{ marginBottom: 12 }}>
            <Input style={fieldStyle} />
          </Form.Item>
          <Form.Item label="单价（元/件）" name="unitPrice" style={{ marginBottom: 12 }}>
            <Input style={fieldStyle} />
          </Form.Item>
          <Form.Item label="合同总金额（元）" name="total" style={{ marginBottom: 12 }}>
            <Input style={fieldStyle} />
          </Form.Item>
          <Form.Item label="交货日期" name="delivery" style={{ marginBottom: 12 }}>
            <Input style={fieldStyle} />
          </Form.Item>
          <Form.Item label="签订日期" name="signDate" style={{ marginBottom: 12 }}>
            <DatePicker style={fieldStyle} />
          </Form.Item>
        </div>
        <Divider plain>合同条款（可编辑）</Divider>
        <Input.TextArea
          value={clauses}
          onChange={(e) => setClauses(e.target.value)}
          autoSize={{ minRows: 10, maxRows: 20 }}
          style={{ fontSize: 13, lineHeight: 1.9 }}
        />
        <div style={{ marginTop: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            打印为 A4 版式（宋体、编号居中、信息表格 + 条款 + 双方签章栏）；修改条款后直接打印即可。
          </Text>
        </div>
      </Form>
    </Modal>
  );
};

export default CooperationContractModal;
