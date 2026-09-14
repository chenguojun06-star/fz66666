import React from 'react';
import { Alert, Button, Descriptions, List, Space, Spin, Tag, Typography } from 'antd';
import { ShopOutlined, CheckCircleOutlined } from '@ant-design/icons';
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
            description={testResult.message} className="u-mb-16" />
          {testResult.credentialGuide && (
            <Alert type="info" showIcon className="u-mb-16 u-br-8"
              title="如何获取凭证？"
              description={testResult.credentialGuide} />
          )}
          {testResult.webhookUrl && (
            <div className="u-br-8 u-mb-16" style={{ background: 'var(--color-slate-50)', border: '1px solid var(--status-processing-border)', padding: '16px' }}>
              <div className="u-fs-16 u-fw-600 u-mb-8"><CheckCircleOutlined /> 下一步：配置回调地址</div>
              <div className="u-fs-14 u-mb-8">复制下方地址，粘贴到 {activePlatform?.name} 平台的 Webhook 设置中：</div>
              <div className="u-d-flex u-gap-8 u-mb-8">
                <code className="u-flex-1 u-p-8px12px u-br-4 u-fs-14" style={{ background: 'var(--color-bg-base)', border: '1px solid var(--color-border-antd)', wordBreak: 'break-all' }}>
                  {window.location.origin}{testResult.webhookUrl}
                </code>
                <Button type="primary" size="small" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}${testResult.webhookUrl}`); message.success('已复制到剪贴板'); }}>一键复制</Button>
              </div>
              <div className="u-fs-13" style={{ color: 'var(--color-text-muted)' }}>配置后，平台订单会自动推送到本系统，无需手动同步</div>
            </div>
          )}
          {testResult.success && testResult.supportedActions && (
            <Descriptions bordered column={2} className="u-mb-16">
              <Descriptions.Item label="同步能力" span={2}>
                {testResult.supportedActions.map(a => (<Tag key={a} color="blue" className="u-mb-4">{a}</Tag>))}
              </Descriptions.Item>
            </Descriptions>
          )}
          {testResult.success && testResult.shops && testResult.shops.length > 0 && (
            <div>
              <Text strong className="u-d-block u-mb-8"><ShopOutlined /> 发现的店铺 ({testResult.shops.length})</Text>
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
