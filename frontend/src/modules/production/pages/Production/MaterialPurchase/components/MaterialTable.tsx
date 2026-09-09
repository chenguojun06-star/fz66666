import React, { useMemo, useState } from 'react';
import { Button, Form } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import ResizableTable from '@/components/common/ResizableTable';
import MaterialPickupModal, { type MaterialPickupRecord } from '@/components/common/MaterialPickupModal';
import { useColumnSettings, ColumnSettingsDrawer } from '@/components/common/ColumnSettings';
import { MaterialPurchase as MaterialPurchaseType, MaterialQueryParams } from '@/types/production';
import { useMaterialColumns } from './useMaterialColumns';
import CancelReceiveModal from './CancelReceiveModal';
import ArrivalConfirmModal from './ArrivalConfirmModal';
import SelectedRowsBar from './SelectedRowsBar';

// D-325 显示字段：字段全由系统预设，用户只挑显隐；方案跟随账号（与全站各列表页同一套）
const MATERIAL_LIST_COLUMNS = [
  { key: 'styleCover', label: '图片' },
  { key: 'styleNo', label: '款号' },
  { key: 'orderNo', label: '订单号' },
  { key: 'factoryName', label: '生产方' },
  { key: 'orderQuantity', label: '下单数量' },
  { key: 'purchaseNo', label: '采购单号' },
  { key: 'materialType', label: '物料类型' },
  { key: 'materialName', label: '物料名称' },
  { key: 'materialCode', label: '物料编码' },
  { key: 'color', label: '颜色' },
  { key: 'specWidth', label: '规格/幅宽' },
  { key: 'fabricWeight', label: '克重' },
  { key: 'fabricComposition', label: '成分' },
  { key: 'supplierName', label: '供应商' },
  { key: 'purchaseQuantity', label: '采购数量' },
  { key: 'referenceKilograms', label: '参考公斤数' },
  { key: 'arrivedQuantity', label: '到货数量' },
  { key: 'pendingArrivalQuantity', label: '待到数量' },
  { key: 'usedQuantity', label: '使用量' },
  { key: 'stockRemainingQuantity', label: '库存余量' },
  { key: 'stockStatus', label: '库存/领取' },
  { key: 'unitPrice', label: '单价' },
  { key: 'reconciliationStatus', label: '对账状态' },
  { key: 'settlementAmount', label: '结算金额' },
  { key: 'status', label: '状态' },
  { key: 'sourceType', label: '来源' },
  { key: 'createTime', label: '下单时间' },
  { key: 'expectedShipDate', label: '预计出货' },
  { key: 'receivedTime', label: '采购时间' },
  { key: 'actualArrivalDate', label: '采购完成' },
  { key: 'receiverName', label: '采购员' },
  { key: 'remark', label: '备注' },
];
const MATERIAL_COLUMN_GROUPS = [
  { title: '订单/款式', keys: ['styleCover', 'styleNo', 'orderNo', 'factoryName', 'orderQuantity', 'purchaseNo'] },
  { title: '物料信息', keys: ['materialType', 'materialName', 'materialCode', 'color', 'specWidth', 'fabricWeight', 'fabricComposition', 'supplierName'] },
  { title: '数量/库存', keys: ['purchaseQuantity', 'referenceKilograms', 'arrivedQuantity', 'pendingArrivalQuantity', 'usedQuantity', 'stockRemainingQuantity', 'stockStatus'] },
  { title: '金额/对账', keys: ['unitPrice', 'reconciliationStatus', 'settlementAmount'] },
  { title: '状态/时间', keys: ['status', 'sourceType', 'createTime', 'expectedShipDate', 'receivedTime', 'actualArrivalDate', 'receiverName', 'remark'] },
];
const MATERIAL_COLUMN_PRESETS = [
  {
    key: 'simple', label: '精简',
    values: {
      styleCover: true, styleNo: true, orderNo: true, materialName: true,
      purchaseQuantity: true, arrivedQuantity: true, status: true, expectedShipDate: true,
    },
  },
  { key: 'standard', label: '标准', values: Object.fromEntries(MATERIAL_LIST_COLUMNS.map((c) => [c.key, true])) },
];

interface MaterialTableProps {
  loading: boolean;
  dataSource: MaterialPurchaseType[];
  total: number;
  queryParams: MaterialQueryParams;
  setQueryParams: React.Dispatch<React.SetStateAction<MaterialQueryParams>>;
  isMobile: boolean;
  onView: (record: MaterialPurchaseType) => void;
  onEdit: (record: MaterialPurchaseType) => void;
  onRemark: (record: MaterialPurchaseType) => void;
  onRefresh?: () => void;
  sortField: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string, order: 'asc' | 'desc') => void;
  purchaseSortField: string;
  purchaseSortOrder: 'asc' | 'desc';
  onPurchaseSort: (field: string, order: 'asc' | 'desc') => void;
  isOrderFrozenForRecord: (record?: Record<string, unknown> | null) => boolean;
  onDelete?: (record: MaterialPurchaseType) => void;
  onConfirmReturn?: (record: MaterialPurchaseType) => void;
  onReturnReset?: (record: MaterialPurchaseType) => void;
  onQualityIssue?: (record: MaterialPurchaseType) => void;
  isSupervisorOrAbove?: boolean;
  onOpenDetail?: (styleNo: string, orderNo?: string) => void;
  onBatchAddToCart?: (records: MaterialPurchaseType[]) => void;
}

const MaterialTable: React.FC<MaterialTableProps> = ({
  loading,
  dataSource,
  total,
  queryParams,
  setQueryParams,
  isMobile,
  onView,
  onEdit,
  onRemark,
  onRefresh,
  sortField,
  sortOrder,
  onSort,
  purchaseSortField,
  purchaseSortOrder,
  onPurchaseSort,
  isOrderFrozenForRecord,
  onDelete,
  onConfirmReturn,
  onReturnReset,
  onQualityIssue,
  isSupervisorOrAbove,
  onOpenDetail,
  onBatchAddToCart,
}) => {
  const navigate = useNavigate();
  const [selectedRows, setSelectedRows] = useState<MaterialPurchaseType[]>([]);
  const [cancelTarget, setCancelTarget] = useState<MaterialPurchaseType | null>(null);
  const [arrivalTarget, setArrivalTarget] = useState<MaterialPurchaseType | null>(null);
  const [arrivalForm] = Form.useForm();
  const [pickupTarget, setPickupTarget] = useState<MaterialPurchaseType | null>(null);

  // 大货采购领取面辅料：打开可编辑数量的弹窗
  const handleApplyPickup = React.useCallback((record: MaterialPurchaseType) => {
    setPickupTarget(record);
  }, []);

  // 由当前点击的采购行构造领取弹窗所需数据
  const pickupRecord: MaterialPickupRecord | null = pickupTarget
    ? {
        materialId: pickupTarget.materialId,
        materialCode: pickupTarget.materialCode,
        materialName: pickupTarget.materialName,
        color: pickupTarget.color,
        size: pickupTarget.size,
        unit: pickupTarget.unit,
        defaultQuantity: pickupTarget.purchaseQuantity,
        availableStock: pickupTarget.availableStock,
        stockStatus: pickupTarget.stockStatus,
      }
    : null;

  const columns = useMaterialColumns({
    dataSource,
    navigate,
    onOpenDetail,
    sortField,
    sortOrder,
    onSort,
    purchaseSortField,
    purchaseSortOrder,
    onPurchaseSort,
    isOrderFrozenForRecord,
    onView,
    onEdit,
    onRemark,
    onDelete,
    onConfirmReturn,
    onReturnReset,
    onQualityIssue,
    isSupervisorOrAbove,
    arrivalForm,
    setArrivalTarget,
    setCancelTarget,
    onApplyPickup: handleApplyPickup,
  });

  // D-325 显示字段：操作列常显，其余按显示字段方案过滤
  const materialColumnSettings = useColumnSettings({
    pageKey: 'material-purchase-list',
    bizType: 'material_purchase',
    allColumns: MATERIAL_LIST_COLUMNS,
    defaultVisible: Object.fromEntries(MATERIAL_LIST_COLUMNS.map((c) => [c.key, true])),
  });
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const visibleColumns = useMemo(
    () => columns.filter((c: any) => c.key === 'action' || materialColumnSettings.visibleColumns[c.key] !== false),
    [columns, materialColumnSettings.visibleColumns],
  );

  return (
    <>
      <style>{`.material-row-overdue { background-color: rgba(255, 77, 79, 0.06) !important; }`}</style>
      <CancelReceiveModal
        open={cancelTarget !== null}
        target={cancelTarget}
        onCancel={() => setCancelTarget(null)}
        onSuccess={onRefresh}
      />
      <ArrivalConfirmModal
        open={Boolean(arrivalTarget)}
        target={arrivalTarget}
        form={arrivalForm}
        onCancel={() => setArrivalTarget(null)}
        onSuccess={onRefresh}
      />
      <SelectedRowsBar
        selectedRows={selectedRows}
        onClear={() => setSelectedRows([])}
        onBatchAddToCart={onBatchAddToCart}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <Button icon={<SettingOutlined />} onClick={() => setColumnSettingsOpen(true)}>
          显示字段
        </Button>
      </div>
      <ResizableTable<MaterialPurchaseType>
        columns={visibleColumns}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        emptyDescription="暂无采购任务"
        rowSelection={{
          selectedRowKeys: selectedRows.map(r => r.id as string),
          onChange: (keys, rows) => setSelectedRows(rows),
        }}
        scroll={{ x: 'max-content' }}
        rowClassName={(record: MaterialPurchaseType) => {
          const s = String(record.status || '').toLowerCase();
          if (['completed', 'cancelled', 'received'].includes(s)) return '';
          const exp = record.expectedShipDate;
          if (exp && new Date(exp).getTime() < Date.now()) return 'material-row-overdue';
          return '';
        }}
        size={isMobile ? 'small' : 'middle'}
        pagination={{
          current: queryParams.page,
          pageSize: queryParams.pageSize,
          total: total,
          onChange: (page, pageSize) => setQueryParams(prev => ({ ...prev, page, pageSize })),
          showTotal: (total) => `共 ${total} 条`,
          showSizeChanger: true,
          pageSizeOptions: ['20', '50', '100', '200'],
          size: isMobile ? 'small' : 'default'
        }}
      />
      <MaterialPickupModal
        open={pickupRecord !== null}
        record={pickupRecord}
        usageType="BULK"
        styleId={pickupTarget?.styleId}
        styleNo={pickupTarget?.styleNo}
        orderId={pickupTarget?.orderId}
        orderNo={pickupTarget?.orderNo}
        factoryType={pickupTarget?.factoryType}
        onCancel={() => setPickupTarget(null)}
        onSuccess={() => {
          setPickupTarget(null);
          onRefresh?.();
        }}
      />
      <ColumnSettingsDrawer
        open={columnSettingsOpen}
        onClose={() => setColumnSettingsOpen(false)}
        columnOptions={MATERIAL_LIST_COLUMNS}
        visibleColumns={materialColumnSettings.visibleColumns}
        onToggle={materialColumnSettings.setVisible}
        onReset={materialColumnSettings.reset}
        title="显示字段"
        groups={MATERIAL_COLUMN_GROUPS}
        presets={MATERIAL_COLUMN_PRESETS}
        onApplyPreset={materialColumnSettings.applyValues}
      />
    </>
  );
};

export default MaterialTable;
