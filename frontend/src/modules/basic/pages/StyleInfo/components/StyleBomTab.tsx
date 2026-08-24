import React from 'react';
import { App, Form } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import StyleStageControlBar from './StyleStageControlBar';
import { useStyleBomTabData } from './hooks/useStyleBomTabData';
import StyleBomMaterialModal from './styleBom/StyleBomMaterialModal';
import StyleBomSizeColorSummary from './styleBom/StyleBomSizeColorSummary';
import StyleBomToolbar from './styleBom/StyleBomToolbar';
import MaterialPickupModal, { type MaterialPickupRecord } from '@/components/common/MaterialPickupModal';
import type { StyleBom } from '@/types/style';

interface Props {
  styleId: string | number;
  /** 款号：领料单归属锚点（后端 /picking/pending 校验必传，缺失会 400） */
  styleNo?: string;
  readOnly?: boolean;
  bomAssignee?: string;
  bomStartTime?: string;
  bomCompletedTime?: string;
  onRefresh?: () => void | Promise<void>;
  onCartAdded?: () => void;
  sizeColorConfig?: {
    sizes?: string[];
    colors?: string[];
    matrixRows?: Array<{ color: string; quantities: number[]; imageUrl?: string }>;
  };
}

const StyleBomTab: React.FC<Props> = ({
  styleId,
  styleNo,
  readOnly,
  bomAssignee,
  bomStartTime,
  bomCompletedTime,
  onRefresh,
  onCartAdded,
  sizeColorConfig,
}) => {
  const { message } = App.useApp();
  const [pickupRecord, setPickupRecord] = React.useState<MaterialPickupRecord | null>(null);

  const handleApplyPickup = React.useCallback((record: StyleBom) => {
    setPickupRecord({
      materialId: record.materialId,
      materialCode: record.materialCode,
      materialName: record.materialName,
      color: record.color,
      size: '',
      unit: record.unit,
      defaultQuantity: record.devUsageAmount ?? record.usageAmount,
      availableStock: record.availableStock,
      stockStatus: record.stockStatus,
    });
  }, []);

  const {
    activeSizes,
    activeColors,
    locked,
    editingKey,
    tableEditable,
    bomTemplateId,
    checkingStock,
    form,
    data,
    loading,
    bomTemplates,
    templateLoading,
    materialCreateForm,
    materialModalOpen,
    materialTab,
    materialKeyword,
    materialLoading,
    materialList,
    materialTotal,
    materialPage,
    materialPageSize,
    setMaterialModalOpen,
    setMaterialTab,
    setMaterialKeyword,
    setBomTemplateId,
    fetchBom,
    fetchBomTemplates,
    fetchMaterials,
    handleMaterialPageChange,
    handleUseMaterial,
    handleCreateMaterial,
    enterTableEdit,
    exitTableEdit,
    saveAll,
    handleAddRows,
    applyBomTemplate,
    handleGeneratePurchase,
    handleCheckStock,
    handleAddCartWithCallback,
    handleBomRecognized,
    purchaseStatus,
    columns,
    onBeforeComplete,
  } = useStyleBomTabData({
    styleId,
    readOnly,
    onCartAdded,
    onApplyPickup: handleApplyPickup,
    sizeColorConfig,
  });

  return (
    <div>
      {/* 统一状态控制栏 */}
      <StyleStageControlBar
        stageName="物料清单"
        styleId={styleId}
        apiPath="bom"
        status={bomCompletedTime ? 'COMPLETED' : bomStartTime ? 'IN_PROGRESS' : 'NOT_STARTED'}
        assignee={bomAssignee}
        startTime={bomStartTime}
        completedTime={bomCompletedTime}
        readOnly={readOnly}
        onRefresh={onRefresh ?? (() => {})}
        onBeforeComplete={onBeforeComplete}
      />
      <StyleBomSizeColorSummary sizes={activeSizes} colors={activeColors} />
      <StyleBomToolbar
        dataLength={data.length}
        locked={locked}
        loading={loading}
        checkingStock={checkingStock}
        tableEditable={tableEditable}
        templateLoading={templateLoading}
        editingKey={editingKey}
        bomTemplateId={bomTemplateId}
        bomTemplates={bomTemplates}
        styleId={styleId}
        purchaseStatus={purchaseStatus}
        onBomRecognized={handleBomRecognized}
        onBomTemplateIdChange={setBomTemplateId}
        onTemplateOpenChange={(open) => {
          if (open && !bomTemplates.length) fetchBomTemplates('');
        }}
        onApplyTemplate={(mode) => {
          if (editingKey) {
            message.error('请先完成当前编辑再导入模板');
            return;
          }
          if (tableEditable) {
            message.error('请先保存或取消编辑后再导入模板');
            return;
          }
          if (!bomTemplateId) {
            message.error('请选择模板');
            return;
          }
          void applyBomTemplate(mode);
        }}
        onCheckStock={handleCheckStock}
        onGeneratePurchase={handleGeneratePurchase}
        onAddToPurchaseCart={handleAddCartWithCallback}
        onToggleEdit={() => {
          if (tableEditable) {
            void saveAll();
            return;
          }
          enterTableEdit();
        }}
        onCancelEdit={exitTableEdit}
        onAddRows={handleAddRows}
      />

      <StyleBomMaterialModal
        open={materialModalOpen}
        modalWidth={'98vw'}
        materialTab={materialTab}
        materialKeyword={materialKeyword}
        materialLoading={materialLoading}
        materialList={materialList}
        materialTotal={materialTotal}
        materialPage={materialPage}
        materialPageSize={materialPageSize}
        materialCreateForm={materialCreateForm}
        onTabChange={setMaterialTab}
        onKeywordChange={setMaterialKeyword}
        onSearch={() => {
          void fetchMaterials(1, materialKeyword);
        }}
        onPageChange={handleMaterialPageChange}
        onClose={() => setMaterialModalOpen(false)}
        onUseMaterial={handleUseMaterial}
        onCreateMaterial={handleCreateMaterial}
      />
      <Form form={form} component={false}>
        {data.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-secondary)' }}>
            暂无物料清单数据，请点击"添加物料"开始配置
          </div>
        ) : (
          <ResizableTable
            components={{
              body: {
                cell: ({ children, ...restProps }: any) => <td {...restProps}>{children}</td>,
              },
            }}
            bordered
            dataSource={data}
            columns={columns}
            rowClassName="editable-row"
            pagination={false}
            loading={loading}
            emptyDescription="暂无物料数据"
            rowKey="id"
            scroll={{ x: 'max-content' }}
            showIndex
            storageKey={`style-bom-v2-${String(styleId)}`}
            showExport={true}
            exportFilename="款式物料清单.xlsx"
          />
        )}
      </Form>
      <MaterialPickupModal
        open={pickupRecord !== null}
        record={pickupRecord}
        usageType="SAMPLE"
        styleId={styleId}
        styleNo={styleNo}
        onCancel={() => setPickupRecord(null)}
        onSuccess={() => {
          // D-108 领取后实时刷新库存显示（后端列表已改为按 t_material_stock 实时重算）
          void fetchBom();
        }}
      />
    </div>
  );
};

export default StyleBomTab;
