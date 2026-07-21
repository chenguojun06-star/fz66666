/**
 * AI 智能执行面板 - 执行结果模态框
 */
import { Alert, Space, Tag } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import type { ExecuteResult } from './types';

interface ResultModalProps {
  executeResult: ExecuteResult | null;
  open: boolean;
  onClose: () => void;
}

export default function ResultModal({ executeResult, open, onClose }: ResultModalProps) {
  return (
    <ResizableModal
      title={executeResult?.success ? ' 执行成功' : ' 执行失败'}
      open={open}
      onOk={onClose}
      onCancel={onClose}
      okText="关闭"
      cancelButtonProps={{ style: { display: 'none' } }}
      width="40vw"
    >
      <div className="result-content">
        {executeResult?.success ? (
          <>
            <Alert
              title={executeResult.message}
              type="success"
              style={{ marginBottom: '16px' }}
            />

            {(executeResult.cascadedTasks ?? 0) > 0 && (
              <Alert
                title={`已触发 ${executeResult.cascadedTasks} 个级联任务`}
                type="info"
                style={{ marginBottom: '16px' }}
              />
            )}

            {executeResult.notifiedRecipients && (
              <div>
                <h4>已通知团队:</h4>
                <Space wrap>
                  {executeResult.notifiedRecipients.map((recipient: string) => (
                    <Tag key={recipient} color="green">
                      {recipient}
                    </Tag>
                  ))}
                </Space>
              </div>
            )}

            <div style={{ marginTop: '16px', padding: '12px', background: '#f6f8f9', borderRadius: '4px' }}>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                命令已成功执行，相关团队将在3分钟内看到影响。
              </p>
            </div>
          </>
        ) : (
          <Alert
            title={executeResult?.message || '未知错误'}
            type="error"
            showIcon
          />
        )}
      </div>
    </ResizableModal>
  );
}
