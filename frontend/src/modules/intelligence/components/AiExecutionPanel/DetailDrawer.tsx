/**
 * AI 智能执行面板 - 命令详情抽屉
 */
import { Button, Drawer, Space, Tag } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import type { PendingCommand } from './types';
import { EXPECTED_IMPACTS } from './helpers';

interface DetailDrawerProps {
  selectedCommand: PendingCommand | null;
  open: boolean;
  executing: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}

export default function DetailDrawer({
  selectedCommand,
  open,
  executing,
  onClose,
  onApprove,
  onReject
}: DetailDrawerProps) {
  return (
    <Drawer
      title={`命令详情 - ${selectedCommand?.action}`}
      placement="right"
      onClose={onClose}
      open={open}
      size={500}
    >
      {selectedCommand && (
        <div style={{ paddingTop: '16px' }}>
          {/* 命令基本信息 */}
          <div className="command-detail-section">
            <h4>命令信息</h4>
            <div className="detail-row">
              <span className="label">命令ID:</span>
              <span>{selectedCommand.commandId}</span>
            </div>
            <div className="detail-row">
              <span className="label">命令类型:</span>
              <Tag color="blue">{selectedCommand.action}</Tag>
            </div>
            <div className="detail-row">
              <span className="label">目标:</span>
              <strong>{selectedCommand.targetId}</strong>
            </div>
            <div className="detail-row">
              <span className="label">风险等级:</span>
              <Tag color={(selectedCommand.riskLevel ?? 0) > 3 ? 'red' : 'orange'}>
                {selectedCommand.riskLevel}/5
              </Tag>
            </div>
            <div className="detail-row">
              <span className="label">需要审批:</span>
              <Tag color="green">是</Tag>
            </div>
          </div>

          {/* AI 建议 */}
          <div className="command-detail-section">
            <h4>AI 建议</h4>
            <div style={{
              padding: '12px',
              background: 'var(--color-bg-subtle)',
              borderRadius: '4px',
              marginBottom: '16px'
            }}>
              {selectedCommand.reason}
            </div>
          </div>

          {/* 需要审批的角色 */}
          <div className="command-detail-section">
            <h4>需要以下角色审批</h4>
            <Space wrap>
              {selectedCommand.waitingFor?.map((role: string) => (
                <Tag key={role} color="geekblue" style={{ fontSize: '13px' }}>
                  • {role}
                </Tag>
              ))}
            </Space>
          </div>

          {/* 命令参数 */}
          {selectedCommand.params && (
            <div className="command-detail-section">
              <h4>命令参数</h4>
              <pre style={{
                fontSize: '12px',
                background: 'var(--color-bg-subtle)',
                padding: '8px',
                borderRadius: '4px',
                overflow: 'auto'
              }}>
                {JSON.stringify(selectedCommand.params, null, 2)}
              </pre>
            </div>
          )}

          {/* 预期影响 */}
          <div className="command-detail-section">
            <h4>预期影响</h4>
            <ul>
              {EXPECTED_IMPACTS.map((impact) => (
                <li key={impact}>{impact}</li>
              ))}
            </ul>
          </div>

          {/* 操作按钮 */}
          <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--color-border-light)' }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button
                type="primary"
                danger
                onClick={onReject}
                disabled={executing}
              >
                拒绝
              </Button>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={onApprove}
                loading={executing}
              >
                批准并执行
              </Button>
            </Space>
          </div>
        </div>
      )}
    </Drawer>
  );
}
