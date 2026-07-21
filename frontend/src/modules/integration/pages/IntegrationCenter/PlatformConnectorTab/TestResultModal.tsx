import React from 'react';
import { Alert, Button, Descriptions, List, Space, Spin, Tag, Typography } from 'antd';
import { ShopOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import { message } from '@/utils/antdStatic';
import type { PlatformMeta } from '../PlatformConnectorConstants';
import type { TestResultState, ShopInfo } from './types';

const { Text } = Typography;

interface TestResultModalProps {
  open: boolean;
  testResult: TestResultState | null;
  activePlatform: PlatformMeta | null;
  onCancel: () => void;
  onClose: () => void;
}

const TestResultModal: React.FC<TestResultModalProps> = ({ open, testResult, activePlatform, onCancel, onClose }) => {
  return (
    <ResizableModal open={open} title="连接测试结果" onCancel={onCancel}
      footer={<Button onClick={onClose}>关闭</Button>} width="40vw" destroyOnHidden>
      {testResult ? (
        <div>
          <Alert type={testResult.success ? 'success' : 'error'} showIcon
            title={testResult.success ? '连接成功' : '凭证未配置'}
            description={testResult.message} style={{ marginBottom: 16 }} />
          {testResult.credentialGuide && (
            <Alert type="info" showIcon style={{ marginBottom: 16, borderRadius: 8 }}
              title="如何获取凭证？"
              description={testResult.credentialGuide} />
          )}
          {testResult.webhookUrl && (
            <div style={{ background: '#f0f9ff', border: '1px solid #91caff', borderRadius: 8, padding: '16px', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>✅ 下一步：配置回调地址</div>
              <div style={{ fontSize: 14, marginBottom: 8 }}>复制下方地址，粘贴到 {activePlatform?.name} 平台的 Webhook 设置中：</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <code style={{ flex: 1, background: '#fff', border: '1px solid #d9d9d9', padding: '8px 12px', borderRadius: 4, fontSize: 14, wordBreak: 'break-all' }}>
                  {window.location.origin}{testResult.webhookUrl}
                </code>
                <Button type="primary" size="small" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}${testResult.webhookUrl}`); message.success('已复制到剪贴板'); }}>一键复制</Button>
              </div>
              <div style={{ fontSize: 13, color: '#8c8c8c' }}>配置后，平台订单会自动推送到本系统，无需手动同步</div>
            </div>
          )}
          {testResult.success && testResult.supportedActions && (
            <Descriptions bordered column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="同步能力" span={2}>
                {testResult.supportedActions.map(a => (<Tag key={a} color="blue" style={{ marginBottom: 4 }}>{a}</Tag>))}
              </Descriptions.Item>
            </Descriptions>
          )}
          {testResult.success && testResult.shops && testResult.shops.length > 0 && (
            <div>
              <Text strong style={{ display: 'block', marginBottom: 8 }}><ShopOutlined /> 发现的店铺 ({testResult.shops.length})</Text>
              <List bordered dataSource={testResult.shops}
                renderItem={(shop: ShopInfo) => (
                  <List.Item><Space><Tag color="green">{shop.platform || '-'}</Tag>{shop.shopName}<Tag color={shop.status === 'ACTIVE' || shop.status === 'CONNECTED' ? 'success' : 'default'}>{{ ACTIVE: '已激活', CONNECTED: '已连接', DISCONNECTED: '已断开', INACTIVE: '未激活', PENDING: '待激活' }[shop.status] || shop.status}</Tag></Space></List.Item>
                )}
              />
            </div>
          )}
        </div>
      ) : (<Spin tip="测试中..." />)}
    </ResizableModal>
  );
};

export default TestResultModal;
