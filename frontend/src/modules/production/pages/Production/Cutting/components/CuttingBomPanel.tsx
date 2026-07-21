import React from 'react';
import { Button, Card, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import type { CuttingBomRow } from '../hooks/useCuttingBom';
import { useMaterialPicker } from './useMaterialPicker';
import { buildCuttingBomColumns } from './cuttingBomColumns';
import CuttingBomMaterialModal from './CuttingBomMaterialModal';

interface CuttingBomPanelProps {
  bomList: CuttingBomRow[];
  bomLoading: boolean;
  bomEditing: boolean;
  bomSaving: boolean;
  canEdit: boolean;
  isBundled: boolean;
  materialModalOpen: boolean;
  onSetEditing: (v: boolean) => void;
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
  onUpdateRow: (id: string, field: string, value: any) => void;
  onSave: () => void;
  onDelete: (id: string) => void;
  onOpenMaterialModal: (rowId: string) => void;
  onUseMaterial: (record: Record<string, unknown>) => Promise<void> | void;
  onCreateMaterial: (values: Record<string, unknown>) => Promise<void> | void;
  onSetMaterialModalOpen: (v: boolean) => void;
}

const CuttingBomPanel: React.FC<CuttingBomPanelProps> = ({
  bomList,
  bomLoading,
  bomEditing,
  bomSaving,
  canEdit,
  isBundled,
  materialModalOpen,
  onSetEditing,
  onAddRow,
  onRemoveRow: _onRemoveRow,
  onUpdateRow,
  onSave,
  onDelete,
  onOpenMaterialModal,
  onUseMaterial,
  onCreateMaterial,
  onSetMaterialModalOpen,
}) => {
  const {
    materialTab,
    setMaterialTab,
    materialKeyword,
    setMaterialKeyword,
    materialLoading,
    materialList,
    materialTotal,
    materialPage,
    setMaterialPage,
    materialPageSize,
    setMaterialPageSize,
    materialCreateForm,
    handleSearchMaterial,
  } = useMaterialPicker(materialModalOpen);

  const columns = buildCuttingBomColumns({
    bomEditing,
    canEdit,
    onUpdateRow,
    onOpenMaterialModal,
    onSetEditing,
    onDelete,
  });

  return (
    <Card

      title="面辅料信息"
      className="cutting-entry-purchase-card"
      style={{ marginTop: 12 }}
      loading={bomLoading}
      extra={
        canEdit ? (
          <Space>
            {bomEditing ? (
              <>
                <Button type="dashed" icon={<PlusOutlined />} onClick={onAddRow}>
                  添加物料
                </Button>
                <Button type="primary" loading={bomSaving} onClick={onSave}>
                  保存
                </Button>
                <Button onClick={() => onSetEditing(false)}>
                  取消
                </Button>
              </>
            ) : (
              <Button type="primary" onClick={() => onSetEditing(true)}>
                编辑
              </Button>
            )}
          </Space>
        ) : isBundled ? (
          <span style={{ color: 'var(--color-text-quaternary)', fontSize: 14 }}>裁剪已完成，不可修改</span>
        ) : null
      }
    >
      {bomList.length === 0 && !bomEditing ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--color-text-quaternary)' }}>
          暂无面辅料信息
          {canEdit && (
            <Button type="link" onClick={() => { onAddRow(); onSetEditing(true); }}>
              添加面辅料
            </Button>
          )}
        </div>
      ) : (
        <ResizableTable
          storageKey="cutting-bom-table"
          columns={columns as any}
          dataSource={bomList}
          rowKey={(r: CuttingBomRow) => r.id || `${r.materialCode}-${r.materialName}`}
          pagination={false}
          emptyDescription="暂无物料数据"
          scroll={{ x: 'max-content' }}
        />
      )}

      <CuttingBomMaterialModal
        open={materialModalOpen}
        materialTab={materialTab}
        onTabChange={setMaterialTab}
        materialKeyword={materialKeyword}
        onKeywordChange={setMaterialKeyword}
        onSearch={handleSearchMaterial}
        materialLoading={materialLoading}
        materialList={materialList}
        materialTotal={materialTotal}
        materialPage={materialPage}
        materialPageSize={materialPageSize}
        onPageChange={(page, pageSize) => { setMaterialPage(page); setMaterialPageSize(pageSize); }}
        materialCreateForm={materialCreateForm}
        onUseMaterial={onUseMaterial}
        onCreateMaterial={onCreateMaterial}
        onClose={() => onSetMaterialModalOpen(false)}
      />
    </Card>
  );
};

export default CuttingBomPanel;
