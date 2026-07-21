import React from 'react';
import { App, Form } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import StyleStageControlBar from './StyleStageControlBar';
import { useStyleBomTabData } from './hooks/useStyleBomTabData';
import StyleBomMaterialModal from './styleBom/StyleBomMaterialModal';
import StyleBomSizeColorSummary from './styleBom/StyleBomSizeColorSummary';
import StyleBomToolbar from './styleBom/StyleBomToolbar';

interface Props {
  styleId: string | number;
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
  readOnly,
  bomAssignee,
  bomStartTime,
  bomCompletedTime,
  onRefresh,
  onCartAdded,
  sizeColorConfig,
}) => {
  const { message } = App.useApp();
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
    columns,
    onBeforeComplete,
  } = useStyleBomTabData({
    styleId,
    readOnly,
    onCartAdded,
    sizeColorConfig,
  });

  return (
    <div>
      {/* 统一状态控制栏 */}
      <StyleStageControlBar
        stageName="BOM清单"
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
            暂无BOM数据，请点击"添加物料"开始配置
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
            exportFilename="款式BOM.xlsx"
          />
        )}
      </Form>
    </div>
  );
};

export default StyleBomTab;
