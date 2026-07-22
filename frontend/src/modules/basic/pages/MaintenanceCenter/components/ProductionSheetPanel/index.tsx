import React from 'react';
import { useProductionSheetPanel } from './useProductionSheetPanel';
import { buildColumns } from './columns';
import DirectModeView from './DirectModeView';
import TableModeView from './TableModeView';

interface ProductionSheetPanelProps { styleNo?: string; onSaved?: () => void; }

const ProductionSheetPanel: React.FC<ProductionSheetPanelProps> = ({ styleNo, onSaved }) => {
  const {
    stats,
    queryParams,
    setQueryParams,
    styles,
    total,
    loading,
    editModalVisible,
    setEditModalVisible,
    editingRecord,
    editForm,
    editSaving,
    cancelLocking,
    returnDescVisible,
    setReturnDescVisible,
    returnDescRecord,
    setReturnDescRecord,
    returnDescSaving,
    returnDescForm,
    detailModalVisible,
    setDetailModalVisible,
    detailRecord,
    setDetailRecord,
    canManage,
    directRow,
    directLocked,
    directProcessing,
    fetchStyles,
    openEditModal,
    handleEditSave,
    handleReturnDescSave,
    downloadProductionSheet,
    handleCancelEdit,
  } = useProductionSheetPanel({ styleNo, onSaved });

  const columns = buildColumns({
    canManage,
    openEditModal,
    setReturnDescRecord,
    setReturnDescVisible,
    setDetailRecord,
    setDetailModalVisible,
    downloadProductionSheet,
  });

  if (styleNo) {
    return (
      <DirectModeView
        loading={loading}
        directRow={directRow}
        canManage={canManage}
        directLocked={directLocked}
        directProcessing={directProcessing}
        editForm={editForm}
        editSaving={editSaving}
        cancelLocking={cancelLocking}
        returnDescForm={returnDescForm}
        returnDescSaving={returnDescSaving}
        handleEditSave={handleEditSave}
        handleReturnDescSave={handleReturnDescSave}
        handleCancelEdit={handleCancelEdit}
      />
    );
  }

  return (
    <TableModeView
      stats={stats}
      queryParams={queryParams}
      setQueryParams={setQueryParams}
      styles={styles}
      total={total}
      loading={loading}
      columns={columns}
      fetchStyles={fetchStyles}
      editModalVisible={editModalVisible}
      setEditModalVisible={setEditModalVisible}
      editingRecord={editingRecord}
      editForm={editForm}
      editSaving={editSaving}
      handleEditSave={handleEditSave}
      returnDescVisible={returnDescVisible}
      setReturnDescVisible={setReturnDescVisible}
      returnDescRecord={returnDescRecord}
      returnDescSaving={returnDescSaving}
      returnDescForm={returnDescForm}
      handleReturnDescSave={handleReturnDescSave}
      detailModalVisible={detailModalVisible}
      setDetailModalVisible={setDetailModalVisible}
      detailRecord={detailRecord}
    />
  );
};

export default ProductionSheetPanel;
