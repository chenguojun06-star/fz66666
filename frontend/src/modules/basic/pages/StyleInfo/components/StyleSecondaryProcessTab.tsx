import React from 'react';
import { Alert, Button, Form, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import StyleStageControlBar from './StyleStageControlBar';
import { useSecondaryProcessActions } from './useSecondaryProcessActions';
import { useSecondaryProcessColumns } from './useSecondaryProcessColumns';

interface Props {
  styleId: number | string;
  styleNo?: string;
  readOnly?: boolean;
  secondaryAssignee?: string;
  secondaryStartTime?: string;
  secondaryCompletedTime?: string;
  sampleQuantity?: number;
  onRefresh?: () => void;
  simpleView?: boolean;
}

const StyleSecondaryProcessTab: React.FC<Props> = ({
  styleId,
  styleNo,
  readOnly = false,
  secondaryAssignee,
  secondaryStartTime,
  secondaryCompletedTime,
  sampleQuantity = 0,
  onRefresh,
  simpleView = false,
}) => {
  const {
    dataSource, loading, editingKey, editingExtraValues, setEditingExtraValues,
    form, isEditing, notStarted,
    handleSkipSecondary, handleAdd, handleEdit, handleCancel,
    handleDelete, handleSave, calculateTotalPrice,
  } = useSecondaryProcessActions(
    styleId, styleNo, readOnly, secondaryAssignee, secondaryStartTime,
    secondaryCompletedTime, sampleQuantity, onRefresh,
  );

  const columns = useSecondaryProcessColumns({
    isEditing,
    editingExtraValues,
    setEditingExtraValues,
    handleSave,
    handleCancel,
    handleEdit,
    handleDelete,
    calculateTotalPrice,
    form,
    readOnly,
  });

  return (
    <div style={{ padding: '0 4px' }}>
      {!simpleView && (
        <StyleStageControlBar
          stageName="二次工艺"
          styleId={styleId}
          apiPath="secondary"
          styleNo={styleNo}
          status={secondaryCompletedTime ? 'COMPLETED' : secondaryStartTime ? 'IN_PROGRESS' : 'NOT_STARTED'}
          assignee={secondaryAssignee}
          startTime={secondaryStartTime}
          completedTime={secondaryCompletedTime}
          readOnly={readOnly}
          onRefresh={onRefresh || (() => {})}
        />
      )}

      {!readOnly && !simpleView && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div />
          <Space>
            {!secondaryCompletedTime && (
              <Button
                onClick={handleSkipSecondary}
                disabled={notStarted}
                title={notStarted ? '请先点击「开始二次工艺」再操作' : undefined}
              >
                无二次工艺
              </Button>
            )}
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAdd}
              disabled={notStarted || !!editingKey}
              title={
                notStarted ? '请先点击「开始二次工艺」再操作'
                  : editingKey ? '请先保存或取消当前编辑'
                    : undefined
              }
            >
              新建工艺
            </Button>
          </Space>
        </div>
      )}

      {simpleView && dataSource.length === 0 && (
        <Alert title="无二次工艺记录" type="info" showIcon style={{ marginBottom: 16 }} />
      )}

      <Form form={form} component={false}>
        <ResizableTable
          storageKey="style-secondary-process"
          columns={columns as any}
          dataSource={dataSource}
          rowKey="id"
          loading={loading}
          pagination={false}
          scroll={{ x: 1540 }}
          size="middle"
        />
      </Form>
    </div>
  );
};

export default StyleSecondaryProcessTab;
