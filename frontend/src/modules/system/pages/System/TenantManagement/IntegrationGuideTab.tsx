import React, { useState } from 'react';
import { Card, Steps, Typography, Tag, Alert, Collapse, Tabs, Row, Col, Button, message, Divider } from 'antd';
import {
  ShoppingCartOutlined, KeyOutlined, ApiOutlined, SendOutlined, BookOutlined,
  CheckCircleOutlined, CodeOutlined, SafetyCertificateOutlined, QuestionCircleOutlined,
  CopyOutlined, RocketOutlined, LinkOutlined, ThunderboltOutlined, LockOutlined,
  CloudDownloadOutlined, CloudUploadOutlined, SwapOutlined, TeamOutlined, PlusOutlined,
  DashboardOutlined,
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

// ===== 代码复制按钮 =====
const CopyBlock: React.FC<{ code: string; lang?: string }> = ({ code, lang = '' }) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => message.success('已复制到剪贴板'));
  };
  return (
    <div style={{ position: 'relative', background: 'var(--color-bg-base)', borderRadius: 8, padding: '16px 48px 16px 16px', margin: '12px 0', overflow: 'auto' }}>
      <Button
        icon={<CopyOutlined />}
        size="small"
        type="text"
        style={{ position: 'absolute', top: 8, right: 8, color: '#aaa' }}
        onClick={handleCopy}
      />
      {lang && <Tag style={{ position: 'absolute', top: 8, left: 12, opacity: 0.7 }}>{lang}</Tag>}
      <pre style={{ color: 'var(--color-text-secondary)', margin: lang ? '24px 0 0 0' : 0, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{code}</pre>
    </div>
  );
};

// ===== 流程卡片 =====
const FlowCard: React.FC<{ icon: React.ReactNode; title: string; desc: string; color: string }> = ({ icon, title, desc, color }) => (
  <Card size="small" style={{ borderLeft: `4px solid ${color}`, height: '100%' }} styles={{ body: { padding: '12px 16px' } }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <span style={{ color, fontSize: 20 }}>{icon}</span>
      <Text strong>{title}</Text>
    </div>
    <Text type="secondary" style={{ fontSize: 13 }}>{desc}</Text>
  </Card>
);

// ===== 主组件 =====
const IntegrationGuideTab: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* 标题区 */}
      <div style={{ textAlign: 'center', padding: '24px 0 16px' }}>
        <Title level={3} style={{ marginBottom: 4 }}>
          <BookOutlined style={{ marginRight: 8, color: 'var(--color-primary)' }} />
          API对接使用教程
        </Title>
        <Text type="secondary">一站式了解如何购买、配置和使用API对接功能，与您的系统无缝集成</Text>
      </div>

      {/* ==================== 第一部分：快速开始 ==================== */}
      <Card title={<span><RocketOutlined style={{ marginRight: 8, color: 'var(--color-primary)' }} />快速开始 — 3步完成对接</span>} style={{ marginBottom: 24 }}>
        <Steps
          current={currentStep}
          onChange={setCurrentStep}
          orientation="horizontal"
          items={[
            { title: '购买/试用', content: '应用商店开通', icon: <ShoppingCartOutlined /> },
            { title: '获取密钥', content: '保存appKey和Secret', icon: <KeyOutlined /> },
            { title: '开始调用', content: '按示例代码对接', icon: <ApiOutlined /> },
          ]}
        />
        <div style={{ marginTop: 24, padding: '16px 24px', background: 'var(--color-bg-container)', borderRadius: 8 }}>
          {currentStep === 0 && (
            <div>
              <Title level={5}>步骤一：在应用商店购买或试用</Title>
              <Paragraph>
                <ol style={{ paddingLeft: 20 }}>
                  <li>
                    点击左侧菜单 <Tag color="blue"><ShoppingCartOutlined /> 应用商店</Tag> 进入应用市场
                  </li>
                  <li>浏览5款对接应用，选择您需要的模块</li>
                  <li>
                    点击 <Tag color="green">免费试用 7 天</Tag> 快速体验（<Text type="secondary">每个应用仅可试用一次</Text>）
                  </li>
                  <li>或点击「立即购买」选择月付/年付/买断方案</li>
                </ol>
              </Paragraph>
              <Alert
                type="info"
                showIcon
                title="试用说明"
                description="试用期7天，功能完整开放，每日API调用上限100次。试用期结束后API凭证自动过期，已有数据不会丢失。"
              />
            </div>
          )}
          {currentStep === 1 && (
            <div>
              <Title level={5}>步骤二：保存API密钥</Title>
              <Alert
                type="warning"
                showIcon
                icon={<SafetyCertificateOutlined />}
                title="⚠️ 重要提醒"
                description="开通试用或购买成功后，系统会弹窗显示 appKey 和 appSecret。appSecret 仅此一次显示，请务必立即保存！如遗失可在「应用管理」Tab中重置密钥。"
                style={{ marginBottom: 16 }}
              />
              <Paragraph>
                <ol style={{ paddingLeft: 20 }}>
                  <li>
                    开通后弹窗会显示：
                    <CopyBlock code={`appKey:   os_a1b2c3d4e5f6  （公开标识）\nappSecret: Kx9mPq2sT7vW...  （签名密钥，仅显示一次！）`} />
                  </li>
                  <li>请将密钥保存到安全的位置（如密码管理器、配置文件）</li>
                  <li>
                    如需配置<Text strong>Webhook回调</Text>或<Text strong>客户API地址</Text>：
                    进入上方 <Tag><ApiOutlined /> 应用管理</Tag> Tab → 找到对应应用 → 编辑
                  </li>
                </ol>
              </Paragraph>
            </div>
          )}
          {currentStep === 2 && (
            <div>
              <Title level={5}>步骤三：开始API调用</Title>
              <Paragraph>使用appKey和appSecret，按HMAC-SHA256签名算法发起API请求。以下是创建订单的完整示例：</Paragraph>
              <CopyBlock lang="bash" code={`curl -X POST https://your-domain.com/openapi/v1/orders/create \\
  -H "Content-Type: application/json" \\
  -H "X-App-Key: os_your_app_key" \\
  -H "X-Timestamp: $(date +%s000)" \\
  -H "X-Signature: <计算后的签名>" \\
  -d '{
    "externalOrderNo": "ERP-20260211-001",
    "styleNo": "FZ2024001",
    "styleName": "春季衬衫A款",
    "quantity": 500,
    "colors": ["红", "蓝"],
    "sizes": ["S", "M", "L"]
  }'`} />
              <Alert type="success" showIcon title="签名算法详见下方「API认证签名」章节，提供 Java / Python / JavaScript / C# 完整代码示例。" />
            </div>
          )}
        </div>
      </Card>

      {/* ==================== 第二部分：4大模块说明 ==================== */}
      <Card title={<span><SwapOutlined style={{ marginRight: 8, color: 'var(--color-info)' }} />五大对接模块</span>} style={{ marginBottom: 24 }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12}>
            <FlowCard icon={<SendOutlined />} title="📦 下单对接 (ORDER_SYNC)" desc="客户ERP系统自动推送订单 → 本系统创建生产订单。支持查询订单状态和进度。" color="var(--color-info)" />
          </Col>
          <Col xs={24} sm={12}>
            <FlowCard icon={<CheckCircleOutlined />} title="✅ 质检反馈 (QUALITY_FEEDBACK)" desc="入库质检完成 → 自动Webhook推送质检结果到客户系统。支持API主动查询质检报告。" color="var(--color-success)" />
          </Col>
          <Col xs={24} sm={12}>
            <FlowCard icon={<CloudUploadOutlined />} title="🚚 物流对接 (LOGISTICS_SYNC)" desc="成品出库操作 → 自动推送物流信息（出库单号、物流公司、运单号）到客户系统。" color="#722ed1" />
          </Col>
          <Col xs={24} sm={12}>
            <FlowCard icon={<ThunderboltOutlined />} title="💰 付款对接 (PAYMENT_SYNC)" desc="对账审批通过 → 推送结算通知。客户可通过API确认付款，双向同步对账状态。" color="#fa8c16" />
          </Col>
          <Col xs={24} sm={12}>
            <FlowCard icon={<LinkOutlined />} title="🧵 面辅料供应对接 (MATERIAL_SUPPLY)" desc="向供应商推送采购订单，查询供应商库存。接收供应商订单确认、价格更新、发货通知。" color="#13c2c2" />
          </Col>
        </Row>

        <Divider />

        <Title level={5}>数据流向说明</Title>
        <div style={{ background: '#f6f8fa', padding: 20, borderRadius: 8, fontFamily: 'monospace', fontSize: 13, lineHeight: 2, overflow: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '4px 12px', alignItems: 'center', maxWidth: 700 }}>
            <Text strong>客户ERP系统</Text>
            <Text type="secondary">──推送订单──→</Text>
            <Text strong>本系统（创建生产订单）</Text>

            <Text strong>本系统（质检完成）</Text>
            <Text type="secondary">──Webhook──→</Text>
            <Text strong>客户系统（接收质检结果）</Text>

            <Text strong>本系统（成品出库）</Text>
            <Text type="secondary">──Webhook──→</Text>
            <Text strong>客户系统（接收物流信息）</Text>

            <Text strong>本系统（对账审批）</Text>
            <Text type="secondary">──Webhook──→</Text>
            <Text strong>客户系统（接收结算通知）</Text>

            <Text strong>客户支付系统</Text>
            <Text type="secondary">──确认付款──→</Text>
            <Text strong>本系统（更新对账状态）</Text>

            <Text strong>本系统（采购下单）</Text>
            <Text type="secondary">──推送订单──→</Text>
            <Text strong>供应商系统（接收采购单）</Text>

            <Text strong>供应商系统（确认/发货）</Text>
            <Text type="secondary">──Webhook──→</Text>
            <Text strong>本系统（更新采购状态）</Text>

            <Text strong>客户纸样/制单系统</Text>
            <Text type="secondary">←──Pull拉取──</Text>
            <Text strong>本系统（获取纸样数据）</Text>
          </div>
        </div>
      </Card>

      {/* ==================== 多应用管理（多租户多系统对接）==================== */}
      <Card title={<span><TeamOutlined style={{ marginRight: 8, color: 'var(--color-info)' }} />多应用管理 — 一个账号对接多个ERP系统</span>} style={{ marginBottom: 24 }}>
        <Alert
          type="info"
          showIcon
          title="适用场景"
          description={<div>
            一个服装厂（租户）可能同时对接多个第三方系统：<br/>
            • 国内订单走ERP-A（用友） <br/>
            • 外贸订单走ERP-B（SAP） <br/>
            • 纸样数据从纸样管理系统Pull <br/>
            • 付款确认通知财务系统
          </div>}
          style={{ marginBottom: 16 }}
        />

        <Title level={5}>解决方案：创建多个同类型应用</Title>
        <Paragraph>
          在<Tag color="blue"><ApiOutlined /> 应用管理</Tag> Tab中，可以创建多个<strong>同类型</strong>的应用。
          每个应用有独立的appKey、appSecret和配置，互不干扰。
        </Paragraph>

        <div style={{ background: '#f6f8fa', padding: 20, borderRadius: 8, marginBottom: 16 }}>
          <Text strong style={{ fontSize: 14, marginBottom: 8, display: 'block' }}>示例配置</Text>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#e6f7ff' }}>
                <th style={{ padding: 8, textAlign: 'left', border: '1px solid var(--color-border)' }}>应用名称</th>
                <th style={{ padding: 8, textAlign: 'left', border: '1px solid var(--color-border)' }}>类型</th>
                <th style={{ padding: 8, textAlign: 'left', border: '1px solid var(--color-border)' }}>appKey</th>
                <th style={{ padding: 8, textAlign: 'left', border: '1px solid var(--color-border)' }}>用途</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: 8, border: '1px solid var(--color-border)' }}>国内ERP订单</td>
                <td style={{ padding: 8, border: '1px solid var(--color-border)' }}><Tag color="blue">ORDER_SYNC</Tag></td>
                <td style={{ padding: 8, border: '1px solid var(--color-border)' }}><code>os_1001_erp_a</code></td>
                <td style={{ padding: 8, border: '1px solid var(--color-border)' }}>用友ERP推送国内订单</td>
              </tr>
              <tr>
                <td style={{ padding: 8, border: '1px solid var(--color-border)' }}>外贸ERP订单</td>
                <td style={{ padding: 8, border: '1px solid var(--color-border)' }}><Tag color="blue">ORDER_SYNC</Tag></td>
                <td style={{ padding: 8, border: '1px solid var(--color-border)' }}><code>os_1001_erp_b</code></td>
                <td style={{ padding: 8, border: '1px solid var(--color-border)' }}>SAP推送外贸订单</td>
              </tr>
              <tr>
                <td style={{ padding: 8, border: '1px solid var(--color-border)' }}>纸样系统</td>
                <td style={{ padding: 8, border: '1px solid var(--color-border)' }}><Tag color="blue">ORDER_SYNC</Tag></td>
                <td style={{ padding: 8, border: '1px solid var(--color-border)' }}><code>os_1001_pattern</code></td>
                <td style={{ padding: 8, border: '1px solid var(--color-border)' }}>Pull模式拉取纸样</td>
              </tr>
              <tr>
                <td style={{ padding: 8, border: '1px solid var(--color-border)' }}>付款确认</td>
                <td style={{ padding: 8, border: '1px solid var(--color-border)' }}><Tag color="orange">PAYMENT_SYNC</Tag></td>
                <td style={{ padding: 8, border: '1px solid var(--color-border)' }}><code>os_1001_payment</code></td>
                <td style={{ padding: 8, border: '1px solid var(--color-border)' }}>财务系统推送付款记录</td>
              </tr>
            </tbody>
          </table>
        </div>

        <Title level={5}>数据隔离机制</Title>
        <Paragraph>
          系统通过<code>createdByName</code>字段自动标记数据来源：
        </Paragraph>
        <ul style={{ fontSize: 13, lineHeight: 2 }}>
          <li>ERP-A调用API创建的订单：<code>createdByName = "OpenAPI-国内ERP订单"</code></li>
          <li>ERP-B调用API创建的订单：<code>createdByName = "OpenAPI-外贸ERP订单"</code></li>
          <li>在订单列表中可以通过创建人字段区分订单来源</li>
        </ul>

        <Alert
          type="warning"
          showIcon
          title="重要提示"
          description={<div>
            • 每个应用的密钥独立：一个泄露不影响其他应用<br/>
            • Webhook地址独立：可以推送到不同ERP系统<br/>
            • API调用日志独立：便于故障排查<br/>
            • 可随时在<Tag color="blue"><ApiOutlined /> 应用管理</Tag>中停用单个应用
          </div>}
          style={{ marginTop: 16 }}
        />

        <Divider />

        <Title level={5}>创建流程</Title>
        <ol style={{ fontSize: 13, lineHeight: 2 }}>
          <li>切换到上方<Tag color="blue"><ApiOutlined /> 应用管理</Tag> Tab</li>
          <li>点击<Button size="small" type="primary" icon={<PlusOutlined />} style={{ margin: '0 4px' }}>创建应用</Button></li>
          <li>填写应用名称（如"国内ERP订单"）</li>
          <li>选择应用类型（如ORDER_SYNC）</li>
          <li>填写Webhook地址（可选）</li>
          <li>点击创建，保存appKey和appSecret</li>
          <li>重复步骤2-6创建其他应用（可以选择相同类型）</li>
        </ol>

        <div style={{ background: 'rgba(234, 179, 8, 0.15)', padding: 16, borderRadius: 8, borderLeft: '4px solid var(--color-warning)', marginTop: 16 }}>
          <Text strong style={{ color: 'var(--color-warning)' }}>💡 最佳实践</Text>
          <ul style={{ margin: '8px 0 0 0', fontSize: 13, lineHeight: 2 }}>
            <li>为每个ERP系统创建独立应用，避免混用</li>
            <li>应用名称使用有意义的标识（如"国内ERP"、"外贸ERP"）</li>
            <li>定期在<Tag color="green"><DashboardOutlined /> 集成总览</Tag>中查看各应用调用情况</li>
            <li>为重要应用配置Webhook回调地址，实时接收系统通知</li>
            <li>建议每6个月轮换一次密钥（在应用管理中重置密钥）</li>
          </ul>
        </div>
      </Card>

      {/* ==================== 第三部分：API端点列表 ==================== */}
      <Card title={<span><CodeOutlined style={{ marginRight: 8, color: '#eb2f96' }} />API端点列表</span>} style={{ marginBottom: 24 }}>
        <Collapse accordion defaultActiveKey="order" items={[
          {
            key: 'order',
            label: <span>📦 下单对接 — 3个端点</span>,
            children: (
              <div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--color-bg-container)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>方法</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>路径</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td style={{ padding: '8px 12px' }}><Tag color="green">POST</Tag></td><td><code>/openapi/v1/orders/create</code></td><td>创建生产订单</td></tr>
                    <tr><td style={{ padding: '8px 12px' }}><Tag color="blue">GET</Tag></td><td><code>/openapi/v1/orders/{'{orderNo}'}</code></td><td>查询订单状态与进度</td></tr>
                    <tr><td style={{ padding: '8px 12px' }}><Tag color="green">POST</Tag></td><td><code>/openapi/v1/orders/list</code></td><td>查询本应用创建的所有订单</td></tr>
                  </tbody>
                </table>
              </div>
            )
          },
          {
            key: 'quality',
            label: <span>✅ 质检反馈 — 1个端点 + Webhook推送</span>,
            children: (
              <div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ background: 'var(--color-bg-container)' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>方法</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>路径</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>说明</th>
                  </tr></thead>
                  <tbody>
                    <tr><td style={{ padding: '8px 12px' }}><Tag color="blue">GET</Tag></td><td><code>/openapi/v1/quality/{'{orderNo}'}</code></td><td>查询质检报告</td></tr>
                    <tr><td style={{ padding: '8px 12px' }}><Tag color="orange">PUSH</Tag></td><td>Webhook回调</td><td>入库质检完成时自动推送</td></tr>
                  </tbody>
                </table>
              </div>
            )
          },
          {
            key: 'logistics',
            label: <span>🚚 物流对接 — 1个端点 + Webhook推送</span>,
            children: (
              <div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ background: 'var(--color-bg-container)' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>方法</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>路径</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>说明</th>
                  </tr></thead>
                  <tbody>
                    <tr><td style={{ padding: '8px 12px' }}><Tag color="blue">GET</Tag></td><td><code>/openapi/v1/logistics/{'{orderNo}'}</code></td><td>查询物流信息</td></tr>
                    <tr><td style={{ padding: '8px 12px' }}><Tag color="orange">PUSH</Tag></td><td>Webhook回调</td><td>成品出库时自动推送</td></tr>
                  </tbody>
                </table>
              </div>
            )
          },
          {
            key: 'payment',
            label: <span>💰 付款对接 — 2个端点 + Webhook推送</span>,
            children: (
              <div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ background: 'var(--color-bg-container)' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>方法</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>路径</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>说明</th>
                  </tr></thead>
                  <tbody>
                    <tr><td style={{ padding: '8px 12px' }}><Tag color="green">POST</Tag></td><td><code>/openapi/v1/payment/confirm</code></td><td>确认付款</td></tr>
                    <tr><td style={{ padding: '8px 12px' }}><Tag color="blue">GET</Tag></td><td><code>/openapi/v1/payment/{'{reconciliationNo}'}</code></td><td>查询对账信息</td></tr>
                    <tr><td style={{ padding: '8px 12px' }}><Tag color="orange">PUSH</Tag></td><td>Webhook回调</td><td>对账审批通过时自动推送</td></tr>
                  </tbody>
                </table>
              </div>
            )
          },
          {
            key: 'material',
            label: <span>🧵 面辅料供应对接 — 2个主动端点 + 3个Webhook</span>,
            children: (
              <div>
                <Title level={5} style={{ marginTop: 0, marginBottom: 8 }}>主动调用端点</Title>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ background: 'var(--color-bg-container)' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>方法</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>路径</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>说明</th>
                  </tr></thead>
                  <tbody>
                    <tr><td style={{ padding: '8px 12px' }}><Tag color="green">POST</Tag></td><td><code>/openapi/v1/material/purchase-order</code></td><td>向供应商推送采购订单</td></tr>
                    <tr><td style={{ padding: '8px 12px' }}><Tag color="green">POST</Tag></td><td><code>/openapi/v1/material/inventory/query</code></td><td>查询供应商面辅料库存</td></tr>
                  </tbody>
                </table>
                <Title level={5} style={{ marginTop: 16, marginBottom: 8 }}>Webhook回调端点（供应商回调）</Title>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ background: 'var(--color-bg-container)' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>方法</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>路径</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>说明</th>
                  </tr></thead>
                  <tbody>
                    <tr><td style={{ padding: '8px 12px' }}><Tag color="orange">PUSH</Tag></td><td><code>/openapi/v1/webhook/material/order-confirm</code></td><td>供应商确认采购订单</td></tr>
                    <tr><td style={{ padding: '8px 12px' }}><Tag color="orange">PUSH</Tag></td><td><code>/openapi/v1/webhook/material/price-update</code></td><td>供应商更新面辅料价格</td></tr>
                    <tr><td style={{ padding: '8px 12px' }}><Tag color="orange">PUSH</Tag></td><td><code>/openapi/v1/webhook/material/shipping-update</code></td><td>供应商更新发货物流信息</td></tr>
                  </tbody>
                </table>
                <Alert
                  type="info"
                  showIcon
                  style={{ marginTop: 12 }}
                  title="主动端点需先在「应用管理」中配置供应商API地址（externalApiUrl）。Webhook端点由供应商系统调用，用于接收供应商的订单确认、价格变更和发货通知。"
                />
              </div>
            )
          },
          {
            key: 'pull',
            label: <span>📥 数据拉取 — 从客户系统拉取纸样/制单</span>,
            children: (
              <div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ background: 'var(--color-bg-container)' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>方法</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>路径</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>说明</th>
                  </tr></thead>
                  <tbody>
                    <tr><td style={{ padding: '8px 12px' }}><Tag color="green">POST</Tag></td><td><code>/openapi/v1/pull/pattern-order</code></td><td>拉取纸样/制单数据</td></tr>
                  </tbody>
                </table>
                <Alert
                  type="info"
                  showIcon
                  style={{ marginTop: 12 }}
                  title="Pull拉取需要先在「应用管理」中配置客户系统API地址（externalApiUrl），系统会转发请求并返回结果。"
                />
              </div>
            )
          }
        ]} />
      </Card>

      {/* ==================== 第四部分：签名认证 ==================== */}
      <Card title={<span><LockOutlined style={{ marginRight: 8, color: '#fa541c' }} />API认证签名（HMAC-SHA256）</span>} style={{ marginBottom: 24 }}>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title="每个API请求必须携带3个Header：X-App-Key（应用标识）、X-Timestamp（毫秒时间戳）、X-Signature（HMAC签名）"
        />

        <Title level={5}>签名算法</Title>
        <div style={{ background: '#f6f8fa', padding: 16, borderRadius: 8, marginBottom: 16 }}>
          <Text code>签名原文 = appKey + timestamp + requestBody</Text>
          <br />
          <Text code>签名结果 = HmacSHA256(签名原文, appSecret)</Text>
          <br /><br />
          <Text type="secondary">※ GET请求的body视为空字符串；时间戳有效期 ±5 分钟</Text>
        </div>

        <Tabs items={[
          {
            key: 'java',
            label: 'Java',
            children: (
              <CopyBlock lang="Java" code={`import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.util.HexFormat;

public class OpenApiSigner {
    public static String sign(String appKey, String appSecret, long timestamp, String body) {
        String message = appKey + timestamp + (body != null ? body : "");
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(appSecret.getBytes(), "HmacSHA256"));
            byte[] hash = mac.doFinal(message.getBytes());
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            throw new RuntimeException("签名失败", e);
        }
    }
}

// 使用示例
String appKey = "os_your_app_key";
String appSecret = "your_secret";
long timestamp = System.currentTimeMillis();
String body = "{\\"styleNo\\":\\"FZ2024001\\",\\"quantity\\":500}";
String signature = OpenApiSigner.sign(appKey, appSecret, timestamp, body);`} />
            )
          },
          {
            key: 'python',
            label: 'Python',
            children: (
              <CopyBlock lang="Python" code={`import hmac, hashlib, time, requests, json

APP_KEY = "os_your_app_key"
APP_SECRET = "your_app_secret"
BASE_URL = "https://your-domain.com"

def call_api(method, path, body=None):
    timestamp = str(int(time.time() * 1000))
    body_str = json.dumps(body, separators=(',', ':')) if body else ""

    message = APP_KEY + timestamp + body_str
    signature = hmac.new(
        APP_SECRET.encode(), message.encode(), hashlib.sha256
    ).hexdigest()

    headers = {
        "Content-Type": "application/json",
        "X-App-Key": APP_KEY,
        "X-Timestamp": timestamp,
        "X-Signature": signature,
    }

    url = BASE_URL + path
    if method == "GET":
        return requests.get(url, headers=headers)
    return requests.post(url, headers=headers, data=body_str)

# 示例：创建订单
resp = call_api("POST", "/openapi/v1/orders/create", {
    "externalOrderNo": "ERP-001",
    "styleNo": "FZ2024001",
    "quantity": 500,
    "colors": ["红", "蓝"],
    "sizes": ["S", "M", "L"],
})
print(resp.json())`} />
            )
          },
          {
            key: 'javascript',
            label: 'JavaScript',
            children: (
              <CopyBlock lang="JavaScript" code={`const crypto = require('crypto');
const axios = require('axios');

const APP_KEY = 'os_your_app_key';
const APP_SECRET = 'your_app_secret';
const BASE_URL = 'https://your-domain.com';

async function callApi(method, path, body = null) {
  const timestamp = Date.now().toString();
  const bodyStr = body ? JSON.stringify(body) : '';
  const message = APP_KEY + timestamp + bodyStr;

  const signature = crypto
    .createHmac('sha256', APP_SECRET)
    .update(message)
    .digest('hex');

  const headers = {
    'Content-Type': 'application/json',
    'X-App-Key': APP_KEY,
    'X-Timestamp': timestamp,
    'X-Signature': signature,
  };

  const url = BASE_URL + path;
  if (method === 'GET') return axios.get(url, { headers });
  return axios.post(url, body, { headers });
}

// 示例：创建订单
const res = await callApi('POST', '/openapi/v1/orders/create', {
  externalOrderNo: 'ERP-001',
  styleNo: 'FZ2024001',
  quantity: 500,
  colors: ['红', '蓝'],
  sizes: ['S', 'M', 'L'],
});
console.log(res.data);`} />
            )
          },
          {
            key: 'csharp',
            label: 'C#',
            children: (
              <CopyBlock lang="C#" code={`using System.Security.Cryptography;
using System.Text;

public class OpenApiClient {
    private string _appKey, _appSecret, _baseUrl;
    private HttpClient _http = new();

    public OpenApiClient(string appKey, string appSecret, string baseUrl) {
        _appKey = appKey; _appSecret = appSecret; _baseUrl = baseUrl;
    }

    public async Task<string> CallApiAsync(string method, string path, string body = "") {
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString();
        var message = _appKey + timestamp + body;

        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(_appSecret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(message));
        var signature = BitConverter.ToString(hash).Replace("-", "").ToLower();

        var request = new HttpRequestMessage(
            method == "GET" ? HttpMethod.Get : HttpMethod.Post,
            _baseUrl + path
        );
        request.Headers.Add("X-App-Key", _appKey);
        request.Headers.Add("X-Timestamp", timestamp);
        request.Headers.Add("X-Signature", signature);

        if (!string.IsNullOrEmpty(body))
            request.Content = new StringContent(body, Encoding.UTF8, "application/json");

        var response = await _http.SendAsync(request);
        return await response.Content.ReadAsStringAsync();
    }
}`} />
            )
          },
        ]} />
      </Card>

      {/* ==================== 第五部分：Webhook配置 ==================== */}
      <Card title={<span><CloudUploadOutlined style={{ marginRight: 8, color: 'var(--color-success)' }} />Webhook推送配置</span>} style={{ marginBottom: 24 }}>
        <Title level={5}>什么是Webhook？</Title>
        <Paragraph>
          当本系统发生特定业务事件时（如出库、完工、对账审批），系统会<Text strong>自动推送</Text>数据到您配置的回调URL，
          无需您轮询查询。这是<Text strong>实时</Text>获取数据变更的最高效方式。
        </Paragraph>

        <Title level={5} style={{ marginTop: 16 }}>自动推送的4类场景</Title>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" style={{ background: 'rgba(45, 127, 249, 0.08)', borderColor: '#adc6ff' }}>
              <Text strong>🚚 成品出库</Text>
              <br /><Text type="secondary" style={{ fontSize: 12 }}>推送物流信息（出库单号、物流公司、运单号）</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" style={{ background: 'rgba(34, 197, 94, 0.15)', borderColor: '#b7eb8f' }}>
              <Text strong>✅ 生产完工</Text>
              <br /><Text type="secondary" style={{ fontSize: 12 }}>推送订单状态变更为已完成</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" style={{ background: 'rgba(250, 140, 22, 0.1)', borderColor: '#ffd591' }}>
              <Text strong>💰 对账审批</Text>
              <br /><Text type="secondary" style={{ fontSize: 12 }}>推送结算审批通过通知</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" style={{ background: 'rgba(19, 194, 194, 0.1)', borderColor: '#87e8de' }}>
              <Text strong>🧵 供应商回调</Text>
              <br /><Text type="secondary" style={{ fontSize: 12 }}>接收供应商订单确认、价格更新、发货通知</Text>
            </Card>
          </Col>
        </Row>

        <Title level={5} style={{ marginTop: 20 }}>如何配置Webhook</Title>
        <Paragraph>
          <ol style={{ paddingLeft: 20, lineHeight: 2.2 }}>
            <li>进入上方 <Tag><ApiOutlined /> 应用管理</Tag> Tab</li>
            <li>找到需要接收推送的应用 → 点击「编辑」</li>
            <li>在「回调URL」字段填入您的接收地址，如：<Text code>https://your-erp.com/webhook/fashion</Text></li>
            <li>保存后系统会自动生成「回调签名密钥」用于验签</li>
          </ol>
        </Paragraph>

        <Title level={5}>Webhook数据格式</Title>
        <CopyBlock lang="JSON" code={`{
  "event": "ORDER_STATUS",
  "timestamp": "2026-02-11T14:30:00",
  "data": {
    "orderNo": "PO20260211001",
    "status": "completed",
    "message": "生产订单已完成"
  }
}`} />

        <Title level={5}>您的系统如何验证Webhook签名</Title>
        <CopyBlock lang="Python" code={`# Webhook请求头包含：X-Webhook-Signature 和 X-Webhook-Timestamp
# 验签逻辑：
import hmac, hashlib

def verify_webhook(callback_secret, timestamp, body, received_signature):
    message = timestamp + body  # 时间戳 + 请求体原文
    expected = hmac.new(
        callback_secret.encode(), message.encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, received_signature)`} />
      </Card>

      {/* ==================== 第六部分：Pull拉取纸样 ==================== */}
      <Card title={<span><CloudDownloadOutlined style={{ marginRight: 8, color: '#2f54eb' }} />拉取第三方数据（纸样/制单）</span>} style={{ marginBottom: 24 }}>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title="Pull机制用于从客户系统主动拉取数据（如纸样列表、制单数据），需要客户系统提供一个HTTP API接口。"
        />

        <Title level={5}>使用前提</Title>
        <Paragraph>
          <ol style={{ paddingLeft: 20, lineHeight: 2.2 }}>
            <li>在 <Tag><ApiOutlined /> 应用管理</Tag> Tab 中编辑应用</li>
            <li>在「客户系统API地址」中填入您的API接口，如：<Text code>https://your-erp.com/api/v1</Text></li>
            <li>保存后即可通过Pull端点拉取数据</li>
          </ol>
        </Paragraph>

        <Title level={5}>两种模式</Title>

        <Collapse items={[
          {
            key: 'forward',
            label: '模式一：转发查询（查询纸样/制单列表）',
            children: (
              <>
                <Paragraph>
                  发送 <Text code>action: "list_patterns"</Text> 等，系统会将您的请求<Text strong>转发</Text>到客户系统API，
                  返回客户系统的原始响应数据。
                </Paragraph>
                <CopyBlock lang="JSON - 请求" code={`POST /openapi/v1/pull/pattern-order
{
  "action": "list_patterns",
  "params": {
    "status": "ready",
    "page": 1,
    "size": 20
  }
}`} />
                <Text type="secondary">支持的action值：list_patterns / list_orders / get_pattern / get_order</Text>
              </>
            )
          },
          {
            key: 'import',
            label: '模式二：直接导入订单',
            children: (
              <>
                <Paragraph>
                  发送 <Text code>action: "import_order"</Text>，系统直接在本地创建一个生产订单。等同于通过下单API创建订单，但带有外部标记。
                </Paragraph>
                <CopyBlock lang="JSON - 请求" code={`POST /openapi/v1/pull/pattern-order
{
  "action": "import_order",
  "externalOrderNo": "PAPER-2026-001",
  "styleNo": "FZ2024001",
  "styleName": "春季衬衫",
  "quantity": 500,
  "colors": ["红", "蓝"],
  "sizes": ["S", "M", "L"],
  "factoryId": 1
}`} />
              </>
            )
          }
        ]} />
      </Card>

      {/* ==================== 第七部分：多租户隔离 ==================== */}
      <Card title={<span><TeamOutlined style={{ marginRight: 8, color: 'var(--color-info)' }} />多租户数据安全</span>} style={{ marginBottom: 24 }}>
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
          title="每个租户的数据完全隔离，不同租户间无法查看或操作对方的数据。"
        />
        <Row gutter={[16, 16]}>
          <Col span={8}>
            <Card size="small" style={{ background: '#e6fffb' }}>
              <LockOutlined style={{ color: 'var(--color-info)', fontSize: 20, marginBottom: 8, display: 'block' }} />
              <Text strong>身份隔离</Text>
              <br /><Text type="secondary" style={{ fontSize: 12 }}>每个appKey绑定唯一租户，API请求自动按租户过滤</Text>
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" style={{ background: '#e6fffb' }}>
              <SafetyCertificateOutlined style={{ color: 'var(--color-info)', fontSize: 20, marginBottom: 8, display: 'block' }} />
              <Text strong>签名防篡改</Text>
              <br /><Text type="secondary" style={{ fontSize: 12 }}>HMAC-SHA256签名 + 5分钟时间窗口防重放攻击</Text>
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" style={{ background: '#e6fffb' }}>
              <ThunderboltOutlined style={{ color: 'var(--color-info)', fontSize: 20, marginBottom: 8, display: 'block' }} />
              <Text strong>配额保护</Text>
              <br /><Text type="secondary" style={{ fontSize: 12 }}>每日API调用限额（试用100次/日），防止滥用</Text>
            </Card>
          </Col>
        </Row>

        <div style={{ marginTop: 16, padding: 16, background: '#f6f8fa', borderRadius: 8 }}>
          <Title level={5} style={{ margin: 0, marginBottom: 8 }}>隔离机制详解</Title>
          <ul style={{ paddingLeft: 20, lineHeight: 2.2, margin: 0 }}>
            <li><Text strong>购买/试用</Text>：按当前登录租户的tenantId隔离订阅记录</li>
            <li><Text strong>API凭证</Text>：每个TenantApp绑定tenantId，只能操作本租户数据</li>
            <li><Text strong>订单查询</Text>：通过API创建的订单标记为 <Text code>OpenAPI-应用名</Text>，查询时只返回本应用的数据</li>
            <li><Text strong>质检/物流/对账</Text>：查询前先验证订单归属，跨租户请求直接拒绝</li>
            <li><Text strong>密钥重置</Text>：新密钥生成后旧密钥立即失效</li>
          </ul>
        </div>
      </Card>

      {/* ==================== 第八部分：常见问题 ==================== */}
      <Card title={<span><QuestionCircleOutlined style={{ marginRight: 8, color: 'var(--color-warning)' }} />常见问题</span>}>
        <Collapse items={[
          {
            key: 'q1',
            label: 'appSecret 丢失了怎么办？',
            children: <Paragraph>进入「应用管理」Tab → 找到对应应用 → 点击「重置密钥」按钮，系统会生成新的密钥对。注意旧密钥会立即失效。</Paragraph>
          },
          {
            key: 'q2',
            label: 'API返回 401 签名验证失败？',
            children: (
              <Paragraph>
                <ol style={{ paddingLeft: 20 }}>
                  <li>检查时间戳是否在 ±5 分钟内（毫秒级 Unix 时间戳）</li>
                  <li>检查签名拼接顺序：<Text code>appKey + timestamp + body</Text>（GET请求body为空字符串）</li>
                  <li>确保body是紧凑JSON（无多余空格），与实际发送的body一致</li>
                  <li>确认使用的是正确的appSecret</li>
                </ol>
              </Paragraph>
            )
          },
          {
            key: 'q3',
            label: '试用到期后数据还在吗？',
            children: <Paragraph>在。试用期结束后API凭证会过期无法调用，但<Text strong>已创建的订单、质检记录等数据永久保留</Text>。升级为正式订阅后可继续使用。</Paragraph>
          },
          {
            key: 'q4',
            label: '一个租户可以有多个同类型应用吗？',
            children: <Paragraph>可以。例如大客户有多个ERP系统，可以分别创建独立的 ORDER_SYNC 应用，各自持有独立密钥。</Paragraph>
          },
          {
            key: 'q5',
            label: 'Webhook推送失败会影响主业务吗？',
            children: <Paragraph>不会。Webhook推送是<Text strong>异步执行</Text>，即使回调URL不可达，也不影响出库/完工/审批等主业务操作。建议配置高可用的回调地址。</Paragraph>
          },
          {
            key: 'q6',
            label: 'Pull拉取报「未配置客户API地址」？',
            children: <Paragraph>在「应用管理」Tab → 编辑应用 → 填写「客户系统API地址」字段后保存即可。系统会将Pull请求转发到这个地址。</Paragraph>
          },
          {
            key: 'q7',
            label: '不同租户的API地址一样吗？',
            children: <Paragraph>是的。所有租户共享同一个API网关 <Text code>/openapi/v1/*</Text>，通过不同appKey区分身份。系统自动按tenantId隔离数据。</Paragraph>
          },
          {
            key: 'q8',
            label: '日调用配额用完怎么办？',
            children: <Paragraph>每日配额在 UTC 00:00 自动重置。如需提高配额，在「应用管理」中编辑应用的「日调用上限」字段（0 = 不限制）。</Paragraph>
          },
        ]} />
      </Card>
    </div>
  );
};

export default IntegrationGuideTab;
