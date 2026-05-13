import React from 'react';
import { Card, Typography, Alert, Collapse, Tabs, Row, Col, Divider } from 'antd';
import {
  SendOutlined,
  CheckCircleOutlined,
  BookOutlined,
  CodeOutlined,
  QuestionCircleOutlined,
  LinkOutlined,
  ThunderboltOutlined,
  CloudUploadOutlined,
  SwapOutlined,
  LockOutlined,
} from '@ant-design/icons';
import CopyBlock from './components/CopyBlock';
import IntegrationQuickStart from './components/IntegrationQuickStart';

const { Title, Text, Paragraph } = Typography;

const FlowCard: React.FC<{ icon: React.ReactNode; title: string; desc: string; color: string }> = ({ icon, title, desc, color }) => (
  <Card style={{ borderLeft: `4px solid ${color}`, height: '100%' }} styles={{ body: { padding: '12px 16px' } }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <span style={{ color, fontSize: 20 }}>{icon}</span>
      <Text strong>{title}</Text>
    </div>
    <Text type="secondary" style={{ fontSize: 13 }}>{desc}</Text>
  </Card>
);

const IntegrationGuideTab: React.FC = () => (
  <div style={{ maxWidth: 1100, margin: '0 auto' }}>
    <div style={{ textAlign: 'center', padding: '24px 0 16px' }}>
      <Title level={3} style={{ marginBottom: 4 }}><BookOutlined style={{ marginRight: 8, color: 'var(--color-primary)' }} />API对接使用教程</Title>
      <Text type="secondary">一站式了解如何购买、配置和使用API对接功能，与您的系统无缝集成</Text>
    </div>

    <IntegrationQuickStart />

    <Card title={<span><SwapOutlined style={{ marginRight: 8, color: 'var(--color-info)' }} />五大对接模块</span>} style={{ marginBottom: 24 }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12}><FlowCard icon={<SendOutlined />} title=" 下单对接 (ORDER_SYNC)" desc="客户ERP系统自动推送订单 → 本系统创建生产订单。支持查询订单状态和进度。" color="var(--color-info)" /></Col>
        <Col xs={24} sm={12}><FlowCard icon={<CheckCircleOutlined />} title=" 质检反馈 (QUALITY_FEEDBACK)" desc="入库质检完成 → 自动Webhook推送质检结果到客户系统。支持API主动查询质检报告。" color="var(--color-success)" /></Col>
        <Col xs={24} sm={12}><FlowCard icon={<CloudUploadOutlined />} title=" 物流对接 (LOGISTICS_SYNC)" desc="成品出库操作 → 自动推送物流信息（出库单号、物流公司、运单号）到客户系统。" color="#722ed1" /></Col>
        <Col xs={24} sm={12}><FlowCard icon={<ThunderboltOutlined />} title=" 付款对接 (PAYMENT_SYNC)" desc="对账审批通过 → 推送结算通知。客户可通过API确认付款，双向同步对账状态。" color="#fa8c16" /></Col>
        <Col xs={24} sm={12}><FlowCard icon={<LinkOutlined />} title=" 面辅料供应对接 (MATERIAL_SUPPLY)" desc="向供应商推送采购订单，查询供应商库存。接收供应商订单确认、价格更新、发货通知。" color="#13c2c2" /></Col>
      </Row>
      <Divider />
      <Title level={5}>数据流向说明</Title>
      <div style={{ background: '#f6f8fa', padding: 20, borderRadius: 8, fontFamily: 'monospace', fontSize: 13, lineHeight: 2, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '4px 12px', alignItems: 'center', maxWidth: 700 }}>
          <Text strong>客户ERP系统</Text><Text type="secondary">──推送订单──→</Text><Text strong>本系统（创建生产订单）</Text>
          <Text strong>本系统（质检完成）</Text><Text type="secondary">──Webhook──→</Text><Text strong>客户系统（接收质检结果）</Text>
          <Text strong>本系统（成品出库）</Text><Text type="secondary">──Webhook──→</Text><Text strong>客户系统（接收物流信息）</Text>
          <Text strong>本系统（对账审批）</Text><Text type="secondary">──Webhook──→</Text><Text strong>客户系统（接收结算通知）</Text>
          <Text strong>客户系统</Text><Text type="secondary">──API确认──→</Text><Text strong>本系统（更新付款状态）</Text>
        </div>
      </div>
    </Card>

    <Card title={<span><LockOutlined style={{ marginRight: 8, color: 'var(--color-warning)' }} />API认证签名</span>} style={{ marginBottom: 24 }}>
      <Alert type="info" showIcon title="所有API请求必须携带签名，签名算法为 HMAC-SHA256，使用 appSecret 作为密钥。" style={{ marginBottom: 16 }} />
      <Collapse items={[
        { key: 'sign-algo', label: '签名算法说明', children: (<div><Paragraph>签名流程：</Paragraph><ol style={{ paddingLeft: 20 }}><li>将请求参数按key字母序排列</li><li>拼接为 key1=value1&key2=value2 格式</li><li>加上 timestamp 参数</li><li>使用 appSecret 对拼接串做 HMAC-SHA256 签名</li><li>将签名结果 Base64 编码后放入 X-Signature 请求头</li></ol><CopyBlock lang="text" code={`待签名字符串 = HTTP_METHOD + "\\n" + PATH + "\\n" + SORTED_QUERY_PARAMS + "\\n" + TIMESTAMP\n签名 = Base64(HMAC-SHA256(appSecret, 待签名字符串))\n\n请求头：\n  X-App-Key: os_your_app_key\n  X-Timestamp: 1700000000000\n  X-Signature: 计算后的签名`} /></div>) },
        { key: 'java', label: 'Java 示例', children: <CopyBlock lang="java" code={`import javax.crypto.Mac;\nimport javax.crypto.spec.SecretKeySpec;\nimport java.util.Base64;\n\npublic class SignUtil {\n  public static String sign(String secret, String message) throws Exception {\n    Mac mac = Mac.getInstance("HmacSHA256");\n    mac.init(new SecretKeySpec(secret.getBytes(), "HmacSHA256"));\n    return Base64.getEncoder().encodeToString(mac.doFinal(message.getBytes()));\n  }\n}`} /> },
        { key: 'python', label: 'Python 示例', children: <CopyBlock lang="python" code={`import hmac, hashlib, base64\n\ndef sign(secret: str, message: str) -> str:\n    return base64.b64encode(\n        hmac.new(secret.encode(), message.encode(), hashlib.sha256).digest()\n    ).decode()`} /> },
        { key: 'js', label: 'JavaScript 示例', children: <CopyBlock lang="javascript" code={`import { createHmac } from 'crypto';\n\nfunction sign(secret, message) {\n  return createHmac('sha256', secret).update(message).digest('base64');\n}`} /> },
        { key: 'csharp', label: 'C# 示例', children: <CopyBlock lang="csharp" code={`using System.Security.Cryptography;\nusing System.Text;\n\npublic static string Sign(string secret, string message) {\n  using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));\n  return Convert.ToBase64String(hmac.ComputeHash(Encoding.UTF8.GetBytes(message)));\n}`} /> },
      ]} />
    </Card>

    <Card title={<span><CodeOutlined style={{ marginRight: 8, color: 'var(--color-success)' }} />API接口参考</span>} style={{ marginBottom: 24 }}>
      <Tabs items={[
        { key: 'order', label: '下单对接', children: (<div><Title level={5}>POST /openapi/v1/orders/create — 创建订单</Title><CopyBlock lang="json" code={`{\n  "externalOrderNo": "ERP-20260211-001",\n  "styleNo": "FZ2024001",\n  "styleName": "春季衬衫A款",\n  "quantity": 500,\n  "colors": ["红", "蓝"],\n  "sizes": ["S", "M", "L"],\n  "plannedDeliveryDate": "2026-03-15"\n}`} /><Title level={5} style={{ marginTop: 16 }}>GET /openapi/v1/orders/&#123;orderNo&#125; — 查询订单状态</Title><CopyBlock lang="json" code={`{\n  "orderNo": "PO20260211001",\n  "status": "in_production",\n  "progress": 65,\n  "currentStage": "车缝",\n  "estimatedCompletion": "2026-03-10"\n}`} /></div>) },
        { key: 'quality', label: '质检反馈', children: (<div><Title level={5}>Webhook: quality_feedback</Title><CopyBlock lang="json" code={`{\n  "event": "quality_feedback",\n  "orderNo": "PO20260211001",\n  "result": "qualified",\n  "quantity": 480,\n  "defectQuantity": 20,\n  "defectDescription": "少量线头",\n  "timestamp": "2026-03-10T14:30:00Z"\n}`} /><Title level={5} style={{ marginTop: 16 }}>GET /openapi/v1/quality/&#123;orderNo&#125; — 查询质检报告</Title></div>) },
        { key: 'logistics', label: '物流对接', children: (<div><Title level={5}>Webhook: logistics_sync</Title><CopyBlock lang="json" code={`{\n  "event": "logistics_sync",\n  "orderNo": "PO20260211001",\n  "shipmentNo": "SH20260310001",\n  "carrier": "顺丰速运",\n  "trackingNo": "SF1234567890",\n  "timestamp": "2026-03-10T16:00:00Z"\n}`} /></div>) },
        { key: 'payment', label: '付款对接', children: (<div><Title level={5}>Webhook: payment_sync</Title><CopyBlock lang="json" code={`{\n  "event": "payment_sync",\n  "reconciliationNo": "MR20260310001",\n  "amount": 15000.00,\n  "status": "approved",\n  "timestamp": "2026-03-10T17:00:00Z"\n}`} /><Title level={5} style={{ marginTop: 16 }}>POST /openapi/v1/payment/confirm — 确认付款</Title></div>) },
        { key: 'material', label: '面辅料供应', children: (<div><Title level={5}>POST /openapi/v1/material/purchase-order — 推送采购订单</Title><Title level={5} style={{ marginTop: 16 }}>GET /openapi/v1/material/stock — 查询供应商库存</Title><Title level={5} style={{ marginTop: 16 }}>Webhook: material_supply_update</Title></div>) },
      ]} />
    </Card>

    <Card title={<span><QuestionCircleOutlined style={{ marginRight: 8, color: 'var(--color-warning)' }} />常见问题</span>} style={{ marginBottom: 24 }}>
      <Collapse items={[
        { key: 'q1', label: '试用期结束后数据会丢失吗？', children: <Paragraph>不会。试用期结束后API凭证自动过期，但已创建的订单、对账等数据会永久保留。续费或购买后即可继续调用API。</Paragraph> },
        { key: 'q2', label: '如何重置appSecret？', children: <Paragraph>进入「应用管理」Tab → 找到对应应用 → 点击「重置密钥」。重置后旧密钥立即失效，请及时更新您的系统配置。</Paragraph> },
        { key: 'q3', label: 'API调用有频率限制吗？', children: <Paragraph>试用期间每日上限100次调用。正式购买后根据套餐不同，标准版1000次/日，专业版5000次/日，企业版不限。</Paragraph> },
        { key: 'q4', label: 'Webhook推送失败怎么办？', children: <Paragraph>系统会自动重试3次（间隔1/5/15分钟）。如仍失败，可在「应用管理」中查看推送日志并手动重发。同时建议配置备用回调地址。</Paragraph> },
        { key: 'q5', label: '如何测试API对接？', children: <Paragraph>开通试用后，可在「应用管理」Tab中找到「API调试工具」，提供在线发送测试请求的功能，无需搭建本地环境。</Paragraph> },
      ]} />
    </Card>
  </div>
);

export default IntegrationGuideTab;
