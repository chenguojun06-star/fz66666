import React from 'react';
import { Card, Form } from 'antd';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import EditTemplateModal from '../../../TemplateCenter/components/EditTemplateModal';
import { useSizeTablePanel } from './useSizeTablePanel';
import { buildColumns } from './columns';
import DirectModeView from './DirectModeView';
import TableModeView from './TableModeView';

interface SizeTablePanelProps { styleNo?: string; onSaved?: () => void; }

const SizeTablePanel: React.FC<SizeTablePanelProps> = ({ styleNo, onSaved }) => {
  const {
    queryForm,
    directRollbackForm,
    editModalRef,
    styleNoOptions,
    styleNoLoading,
    hydratingTemplate,
    loading,
    data,
    page,
    pageSize,
    total,
    rollbackTarget,
    rollbackLoading,
    pendingDeleteTemplate,
    deleteTemplateLoading,
    isFactoryUser,
    modalWidth,
    directRow,
    isLocked,
    isProcessing,
    handleRollback,
    handleRollbackConfirm,
    handleRollbackCancel,
    handleDelete,
    handleDeleteConfirm,
    handleDeleteCancel,
    fetchList,
    fetchStyleNoOptions,
    scheduleFetchStyleNos,
    handleDirectRollback,
    handleCancelEdit,
  } = useSizeTablePanel({ styleNo, onSaved });

  const columns = buildColumns({
    isFactoryUser,
    isLocked,
    handleRollback,
    handleDelete,
    editModalRef,
  });

  return (
    <Card styles={{ body: { padding: '8px 12px' } }}>
      <Form form={queryForm} component={false} />
      {styleNo ? (
        <div>
          <DirectModeView
            loading={loading}
            hydratingTemplate={hydratingTemplate}
            directRow={directRow}
            isLocked={isLocked}
            isProcessing={isProcessing}
            directRollbackForm={directRollbackForm}
            rollbackLoading={rollbackLoading}
            handleDirectRollback={handleDirectRollback}
            handleCancelEdit={handleCancelEdit}
            fetchList={fetchList}
          />
        </div>
      ) : (
        <TableModeView
          queryForm={queryForm}
          styleNoOptions={styleNoOptions}
          styleNoLoading={styleNoLoading}
          loading={loading}
          data={data}
          page={page}
          pageSize={pageSize}
          total={total}
          columns={columns}
          fetchList={fetchList}
          scheduleFetchStyleNos={scheduleFetchStyleNos}
          fetchStyleNoOptions={fetchStyleNoOptions}
        />
      )}

      <EditTemplateModal
        ref={editModalRef}
        styleNoOptions={styleNoOptions}
        styleNoLoading={styleNoLoading}
        modalWidth={modalWidth}
        onFetchList={() => fetchList({})}
        onStyleNoSearch={scheduleFetchStyleNos}
        onStyleNoDropdownOpen={() => fetchStyleNoOptions('')}
      />
      <RejectReasonModal
        open={rollbackTarget !== null}
        title="退回该模板为可编辑？"
        description={rollbackTarget?.templateName}
        loading={rollbackLoading}
        onOk={handleRollbackConfirm}
        onCancel={handleRollbackCancel}
      />

      <RejectReasonModal
        open={pendingDeleteTemplate !== null}
        title="确认删除该模板？"
        description={pendingDeleteTemplate?.templateName}
        fieldLabel="删除原因"
        okText="删除"
        loading={deleteTemplateLoading}
        onOk={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </Card>
  );
};

export default SizeTablePanel;
