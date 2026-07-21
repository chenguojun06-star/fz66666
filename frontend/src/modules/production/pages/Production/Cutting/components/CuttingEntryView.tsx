import React from 'react';
import { Button, Form, Segmented, Space, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

import ResizableTable from '@/components/common/ResizableTable';
import { ProductionOrderHeader } from '@/components/StyleAssets';
import StyleCoverGallery from '@/components/common/StyleCoverGallery';
import { formatDateTime } from '@/utils/datetime';
import type { CuttingTask } from '@/types/production';

import {
  useCuttingTasks,
  useCuttingBundles,
  useCuttingBom,
  useCuttingPrint,
} from '../hooks';
import type { CuttingBundleRow } from '../hooks';
import CuttingFreeBundlePanel from './CuttingFreeBundlePanel';
import CuttingPrintPreviewModal from './CuttingPrintPreviewModal';
import CuttingRatioPanel from './CuttingRatioPanel';
import CuttingBomPanel from './CuttingBomPanel';

type TasksState = ReturnType<typeof useCuttingTasks>;
type BundlesState = ReturnType<typeof useCuttingBundles>;
type BomState = ReturnType<typeof useCuttingBom>;
type PrintState = ReturnType<typeof useCuttingPrint>;

interface CuttingEntryViewProps {
  activeTask: CuttingTask;
  tasks: TasksState;
  bundles: BundlesState;
  bom: BomState;
  print: PrintState;
  bundleMode: 'auto' | 'free';
  setBundleMode: (mode: 'auto' | 'free') => void;
  existingCutQtyByKey: Record<string, number>;
  columns: any[];
  modalWidth: string;
  message: any;
  onOpenCuttingSheetPrint: () => void;
  onRollbackActive: (task: CuttingTask) => void;
}

/**
 * 裁剪明细（entry page）视图
 * 从 index.tsx 抽离，保持原渲染逻辑不变
 */
const CuttingEntryView: React.FC<CuttingEntryViewProps> = ({
  activeTask,
  tasks,
  bundles,
  bom,
  print,
  bundleMode,
  setBundleMode,
  existingCutQtyByKey,
  columns,
  modalWidth,
  message,
  onOpenCuttingSheetPrint,
  onRollbackActive,
}) => {
  return (
    <>
      <div ref={bundles.editSectionRef} />

      <div className="cutting-entry-layout mb-sm">
        <div className="cutting-entry-main">
          <div className="cutting-entry-info">
            <ProductionOrderHeader
              orderNo={String(activeTask.productionOrderNo || '').trim()}
              styleNo={String(activeTask.styleNo || '').trim()}
              styleName={String(activeTask.styleName || '').trim()}
              orderLines={bundles.entryOrderLines}
              styleId={activeTask?.styleId}
              styleCover={activeTask?.styleCover || null}
              coverNode={(
                <div style={{ width: 160, maxWidth: '100%' }}>
                  <StyleCoverGallery
                    styleId={activeTask?.styleId}
                    styleNo={String(activeTask.styleNo || '').trim()}
                    src={activeTask?.styleCover || null}
                    fit="cover"
                    borderRadius={8}
                  />
                </div>
              )}
              color={String(bundles.entryColorText || activeTask.color || '').trim()}
              sizeItems={bundles.entryOrderDetailLoading ? [] : bundles.entrySizeItems.map((x) => ({ size: x.size, quantity: Number(x.quantity || 0) || 0 }))}
              totalQuantity={bundles.entrySizeItems.length
                ? bundles.entrySizeItems.reduce((s, x) => s + (Number(x.quantity || 0) || 0), 0)
                : (Number(activeTask?.orderQuantity ?? 0) || 0)}
              coverSize={160}
              matrixColumnMinWidth={36}
              matrixGap={10}
              matrixFontSize={13}
            />
          </div>

          <div>
            {tasks.isAdmin && activeTask && activeTask.status !== 'pending' && activeTask.status !== 'completed' ? (
              <div className="cutting-entry-actions">
                <Button
                  danger
                  onClick={() => onRollbackActive(activeTask)}
                  loading={tasks.rollbackTaskLoading}
                  disabled={tasks.isOrderFrozenById(activeTask?.productionOrderNo ?? '') || !!activeTask?.hasScanRecords}
                >
                  退回
                </Button>
                {bundles.importLocked && bundles.dataSource.length > 0 && (
                  <Button
                    type="default"
                    icon={<PlusOutlined />}
                    onClick={bundles.handleAddBed}
                  >
                    增加床次
                  </Button>
                )}
              </div>
            ) : null}

            <div style={{ marginBottom: 12 }}>
              <Segmented
                options={[
                  { label: '一键生成', value: 'auto' },
                  { label: '自由编菲', value: 'free' },
                ]}
                value={bundleMode}
                onChange={(val) => setBundleMode(val as 'auto' | 'free')}
                disabled={bundles.importLocked}
              />
            </div>

            {bundleMode === 'auto' ? (
              <Form layout="vertical">
                <CuttingRatioPanel
                  entryColorText={bundles.entryColorText || String(activeTask?.color || '').trim()}
                  entrySizeItems={bundles.entrySizeItems}
                  entryOrderLines={bundles.entryOrderLines}
                  defaultTotalQty={Number(activeTask?.orderQuantity ?? 0) || 0}
                  sizeUsageMap={bundles.entrySizeUsageMap}
                  fabricUsageRows={bundles.entryFabricUsageRows}
                  arrivedFabricM={bundles.entryMainFabricArrived}
                  generating={bundles.generateLoading}
                  disabled={bundles.importLocked}
                  onConfirm={(rows) => {
                    bundles.setBundlesInput(rows);
                    bundles.handleGenerate(rows);
                  }}
                  onClear={() => {
                    bundles.setImportLocked(false);
                    bundles.setBundlesInput([{ skuNo: '', color: '', size: '', quantity: 0 }]);
                  }}
                  existingCutQtyByKey={existingCutQtyByKey}
                />
              </Form>
            ) : (
              <CuttingFreeBundlePanel
                entryOrderLines={bundles.entryOrderLines}
                generating={bundles.generateLoading}
                disabled={bundles.importLocked}
                onConfirm={(rows) => {
                  bundles.setBundlesInput(rows);
                  bundles.handleGenerate(rows);
                }}
                onClear={() => {
                  bundles.setImportLocked(false);
                  bundles.setBundlesInput([{ skuNo: '', color: '', size: '', quantity: 0 }]);
                }}
              />
            )}

            <CuttingBomPanel
              bomList={bom.bomList}
              bomLoading={bom.bomLoading}
              bomEditing={bom.bomEditing}
              bomSaving={bom.bomSaving}
              canEdit={bom.canEdit}
              isBundled={bom.isBundled}
              materialModalOpen={bom.materialModalOpen}
              onSetEditing={bom.setBomEditing}
              onAddRow={bom.handleAddRow}
              onRemoveRow={bom.handleRemoveRow}
              onUpdateRow={bom.handleUpdateRow}
              onSave={bom.handleSave}
              onDelete={bom.handleDelete}
              onOpenMaterialModal={bom.handleOpenMaterialModal}
              onUseMaterial={bom.handleUseMaterial}
              onCreateMaterial={bom.handleCreateMaterial}
              onSetMaterialModalOpen={bom.setMaterialModalOpen}
            />
          </div>

          <div className="cutting-entry-footer">
            <div className="cutting-entry-footer-grid">
              <div className="cutting-entry-field">
                <div className="cutting-entry-label">裁剪人</div>
                <div className="cutting-entry-value">{String(activeTask.receiverName || '').trim() || '-'}</div>
              </div>
              <div className="cutting-entry-field">
                <div className="cutting-entry-label">领取时间</div>
                <div className="cutting-entry-value">{formatDateTime(activeTask.receivedTime) || '-'}</div>
              </div>
              <div className="cutting-entry-field">
                <div className="cutting-entry-label">完成时间</div>
                <div className="cutting-entry-value">{formatDateTime(activeTask.bundledTime) || '-'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" onClick={() => print.openBatchPrint(bundles.selectedBundles)} disabled={!bundles.selectedBundles.length}>
          打印菲号
        </Button>
        <Button
          type="default"
          onClick={() => {
            if (!bundles.selectedBundles.length) {
              message.warning('请先勾选要打印的批次');
              return;
            }
            onOpenCuttingSheetPrint();
          }}
          disabled={!bundles.selectedBundles.length}
        >
          打印裁剪单
        </Button>
        <Button onClick={bundles.clearBundleSelection} disabled={!bundles.selectedBundles.length}>
          清除勾选
        </Button>
        <Tag color={bundles.selectedBundles.length ? 'blue' : 'default'}>{`已选：${bundles.selectedBundles.length}`}</Tag>
      </Space>

      <ResizableTable<CuttingBundleRow>
        storageKey="cutting-bundle-table"
        columns={columns}
        dataSource={bundles.dataSource}
        rowKey={(row) => row.id || `${row.productionOrderNo}-${row.bundleNo}-${row.color}-${row.size}`}

        rowSelection={{
          selectedRowKeys: bundles.selectedBundleRowKeys,
          onChange: (keys, rows) => {
            bundles.setSelectedBundleRowKeys(keys);
            bundles.setSelectedBundles((rows as CuttingBundleRow[]) || []);
          },
        }}
        loading={bundles.listLoading}
        scroll={{ x: 'max-content' }}
        emptyDescription="暂无裁剪数据"
        pagination={{
          current: bundles.queryParams.page,
          pageSize: bundles.queryParams.pageSize,
          total: bundles.total,
          showTotal: (total) => `共 ${total} 条`,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100', '200'],
          onChange: (page, pageSize) => bundles.setQueryParams(prev => ({ ...prev, page, pageSize })),
        }}
      />

      <CuttingPrintPreviewModal
        modalWidth={modalWidth}
        print={print}
        bundles={{ selectedBundles: bundles.selectedBundles, clearBundleSelection: bundles.clearBundleSelection }}
      />

    </>
  );
};

export default CuttingEntryView;
