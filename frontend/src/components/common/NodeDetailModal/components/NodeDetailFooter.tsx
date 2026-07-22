import React from 'react';
import { Button, Popconfirm } from 'antd';
import type { NodeType, NodeOperationData } from '../types';

interface NodeDetailFooterProps {
  nodeTypeKey: NodeType;
  currentNodeData: NodeOperationData;
  saving: boolean;
  onClear: () => Promise<void>;
}

const NodeDetailFooter: React.FC<NodeDetailFooterProps> = ({
  nodeTypeKey,
  currentNodeData,
  saving,
  onClear,
}) => {
  const hasSettings = !!(
    currentNodeData.delegateFactoryId ||
    currentNodeData.delegateProcessName ||
    currentNodeData.delegatePrice ||
    currentNodeData.processType ||
    currentNodeData.assignee ||
    currentNodeData.remark
  );

  if (nodeTypeKey === 'procurement') return undefined;

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
      <div>
        {hasSettings && (
          <Popconfirm
            title="确认清空设置？"
            description="清空后可在操作历史中查看记录，但设置内容将被删除"
            onConfirm={onClear}
            okText="确认清空"
            cancelText="取消"
            okButtonProps={{ danger: true, type: 'default' }}
          >
            <Button danger loading={saving}>
              清空设置
            </Button>
          </Popconfirm>
        )}
      </div>
    </div>
  );
};

export default NodeDetailFooter;
