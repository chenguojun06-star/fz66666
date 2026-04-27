import React, { useState } from 'react';
import { Card, Steps, Typography, Tag, Alert } from 'antd';
import { ShoppingCartOutlined, KeyOutlined, ApiOutlined, SafetyCertificateOutlined, RocketOutlined } from '@ant-design/icons';
import CopyBlock from './CopyBlock';

const { Title, Paragraph, Text } = Typography;

const IntegrationQuickStart: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);

  return (
    <Card title={<span><RocketOutlined style={{ marginRight: 8, color: 'var(--color-primary)' }} />快速开始 — 3步完成对接</span>} style={{ marginBottom: 24 }}>
      <Steps current={currentStep} onChange={setCurrentStep} orientation="horizontal" items={[
        { title: '购买/试用', content: '应用商店开通', icon: <ShoppingCartOutlined /> },
        { title: '获取密钥', content: '保存appKey和Secret', icon: <KeyOutlined /> },
        { title: '开始调用', content: '按示例代码对接', icon: <ApiOutlined /> },
      ]} />
      <div style={{ marginTop: 24, padding: '16px 24px', background: 'var(--color-bg-container)', borderRadius: 8 }}>
        {currentStep === 0 && (
          <div>
            <Title level={5}>步骤一：在应用商店购买或试用</Title>
            <Paragraph><ol style={{ paddingLeft: 20 }}>
              <li>点击左侧菜单 <Tag color="blue"><ShoppingCartOutlined /> 应用商店</Tag> 进入应用市场</li>
              <li>浏览5款对接应用，选择您需要的模块</li>
              <li>点击 <Tag color="green">免费试用 7 天</Tag> 快速体验（<Text type="secondary">每个应用仅可试用一次</Text>）</li>
              <li>或点击「立即购买」选择月付/年付/买断方案</li>
            </ol></Paragraph>
            <Alert type="info" showIcon title="试用说明" description="试用期7天，功能完整开放，每日API调用上限100次。试用期结束后API凭证自动过期，已有数据不会丢失。" />
          </div>
        )}
        {currentStep === 1 && (
          <div>
            <Title level={5}>步骤二：保存API密钥</Title>
            <Alert type="warning" showIcon icon={<SafetyCertificateOutlined />} title=" 重要提醒" description="开通试用或购买成功后，系统会弹窗显示 appKey 和 appSecret。appSecret 仅此一次显示，请务必立即保存！如遗失可在「应用管理」Tab中重置密钥。" style={{ marginBottom: 16 }} />
            <Paragraph><ol style={{ paddingLeft: 20 }}>
              <li>开通后弹窗会显示：<CopyBlock code={`appKey:   os_a1b2c3d4e5f6  （公开标识）\nappSecret: Kx9mPq2sT7vW...  （签名密钥，仅显示一次！）`} /></li>
              <li>请将密钥保存到安全的位置（如密码管理器、配置文件）</li>
              <li>如需配置<Text strong>Webhook回调</Text>或<Text strong>客户API地址</Text>：进入上方 <Tag><ApiOutlined /> 应用管理</Tag> Tab → 找到对应应用 → 编辑</li>
            </ol></Paragraph>
          </div>
        )}
        {currentStep === 2 && (
          <div>
            <Title level={5}>步骤三：开始API调用</Title>
            <Paragraph>使用appKey和appSecret，按HMAC-SHA256签名算法发起API请求。以下是创建订单的完整示例：</Paragraph>
            <CopyBlock lang="bash" code={`curl -X POST https://your-domain.com/openapi/v1/orders/create \\\n  -H "Content-Type: application/json" \\\n  -H "X-App-Key: os_your_app_key" \\\n  -H "X-Timestamp: $(date +%s000)" \\\n  -H "X-Signature: <计算后的签名>" \\\n  -d '{\n    "externalOrderNo": "ERP-20260211-001",\n    "styleNo": "FZ2024001",\n    "styleName": "春季衬衫A款",\n    "quantity": 500,\n    "colors": ["红", "蓝"],\n    "sizes": ["S", "M", "L"]\n  }'`} />
            <Alert type="success" showIcon title="签名算法详见下方「API认证签名」章节，提供 Java / Python / JavaScript / C# 完整代码示例。" />
          </div>
        )}
      </div>
    </Card>
  );
};

export default IntegrationQuickStart;
