import React from 'react';
import { Tag, Select, Input, InputNumber } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import RowActions from '@/components/common/RowActions';
import MaterialTypeTag from '@/components/common/MaterialTypeTag';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import SupplierSelect from '@/components/common/SupplierSelect';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import { confirmDelete } from '@/utils/confirm';
import { formatDateTime } from '@/utils/datetime';
import { formatMoney } from '@/utils/format';
import { formatMaterialQuantityWithUnit, getStatusConfig } from '../MaterialPurchase/utils';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import type { MaterialPurchase } from '@/types/production';
import { MATERIAL_TYPE_OPTIONS } from './helpers';
import { getPurchaseMissingFields } from './hooks/types';

const { Option } = Select;

export interface EditColumnsDeps {
  isMultiColor: boolean;
  colorList: string[];
  handleUpdateRow: (id: string, field: string, value: unknown) => void;
  handleOpenMaterialModal: (id: string) => void;
  handleRemoveRow: (id: string) => void;
}

export function buildEditColumns(deps: EditColumnsDeps): ColumnsType<MaterialPurchase> {
  const { isMultiColor, colorList, handleUpdateRow, handleOpenMaterialModal, handleRemoveRow } = deps;
  return [
    {
      title: '物料类型', dataIndex: 'materialType', key: 'materialType', width: 110,
      render: (v: unknown, record: MaterialPurchase) => (
        <Select
          value={String(v || 'fabricA')}
          size="small"
          style={{ width: '100%' }}
          onChange={(val) => handleUpdateRow(record.id!, 'materialType', val)}
        >
          {MATERIAL_TYPE_OPTIONS.map((opt) => (
            <Option key={opt.value} value={opt.value}>{opt.label}</Option>
          ))}
        </Select>
      ),
    },
    {
      title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 120,
      render: (v: unknown, record: MaterialPurchase) => (
        <Input
          value={String(v || '')}
          size="small"
          onChange={(e) => handleUpdateRow(record.id!, 'materialCode', e.target.value)}
          placeholder="输入编码"
          suffix={<span style={{ fontSize: 10, color: 'var(--color-primary)', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); handleOpenMaterialModal(record.id!); }}>选用</span>}
        />
      ),
    },
    {
      title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 130, ellipsis: true,
      render: (v: unknown, record: MaterialPurchase) => (
        <Input
          value={String(v || '')}
          size="small"
          onChange={(e) => handleUpdateRow(record.id!, 'materialName', e.target.value)}
          placeholder="物料名称"
        />
      ),
    },
    {
      title: '成分', dataIndex: 'fabricComposition', key: 'fabricComposition', width: 100, ellipsis: true,
      render: (v: unknown, record: MaterialPurchase) => (
        <Input
          value={String(v || '')}
          size="small"
          onChange={(e) => handleUpdateRow(record.id!, 'fabricComposition', e.target.value)}
          placeholder="成分"
        />
      ),
    },
    {
      title: '克重', dataIndex: 'fabricWeight', key: 'fabricWeight', width: 80,
      render: (v: unknown, record: MaterialPurchase) => (
        <Input
          value={String(v || '')}
          size="small"
          onChange={(e) => handleUpdateRow(record.id!, 'fabricWeight', e.target.value)}
          placeholder="克重"
        />
      ),
    },
    {
      title: '颜色', dataIndex: 'color', key: 'color', width: 90,
      render: (v: unknown, record: MaterialPurchase) =>
        isMultiColor && colorList.length > 0 ? (
          <Select
            value={String(v || '')}
            size="small"
            style={{ width: '100%' }}
            placeholder="选择颜色"
            allowClear
            onChange={(val) => handleUpdateRow(record.id!, 'color', val)}
            options={colorList.map((c: string) => ({ label: c, value: c }))}
          />
        ) : (
          <Input
            value={String(v || '')}
            size="small"
            onChange={(e) => handleUpdateRow(record.id!, 'color', e.target.value)}
            placeholder="颜色"
          />
        ),
    },
    {
      title: '码数', dataIndex: 'size', key: 'size', width: 90,
      render: (v: unknown, record: MaterialPurchase) => (
        <DictAutoComplete
          dictType="size"
          value={String(v || '')}
          onChange={(val: string) => handleUpdateRow(record.id!, 'size', val)}
          placeholder="码数"
          size="small"
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '规格', dataIndex: 'specifications', key: 'specifications', width: 100,
      render: (v: unknown, record: MaterialPurchase) => (
        <Input
          value={String(v || '')}
          size="small"
          onChange={(e) => handleUpdateRow(record.id!, 'specifications', e.target.value)}
          placeholder="规格"
        />
      ),
    },
    {
      title: '单位', dataIndex: 'unit', key: 'unit', width: 80,
      render: (v: unknown, record: MaterialPurchase) => (
        <DictAutoComplete
          dictType="material_unit"
          value={String(v || '')}
          onChange={(val: string) => handleUpdateRow(record.id!, 'unit', val)}
          placeholder="单位"
          size="small"
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '采购数量', dataIndex: 'purchaseQuantity', key: 'purchaseQuantity', width: 90, align: 'right' as const,
      render: (v: unknown, record: MaterialPurchase) => (
        <InputNumber
          value={Number(v || 0)}
          size="small"
          min={0}
          style={{ width: '100%' }}
          onChange={(val) => handleUpdateRow(record.id!, 'purchaseQuantity', val ?? 0)}
        />
      ),
    },
    {
      title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 90, align: 'right' as const,
      render: (v: unknown, record: MaterialPurchase) => (
        <InputNumber
          value={Number(v || 0)}
          size="small"
          min={0}
          precision={2}
          style={{ width: '100%' }}
          prefix="¥"
          onChange={(val) => handleUpdateRow(record.id!, 'unitPrice', val ?? 0)}
        />
      ),
    },
    {
      title: '供应商', dataIndex: 'supplierName', key: 'supplierName', width: 140, ellipsis: true,
      render: (v: unknown, record: MaterialPurchase) => (
        <SupplierSelect
          value={String(v || '')}
          placeholder="供应商"
          size="small"
          style={{ width: '100%' }}
          onChange={(_val: string, option: any) => {
            handleUpdateRow(record.id!, 'supplierName', _val);
            const sel = Array.isArray(option) ? option[0] : option;
            if (sel) {
              handleUpdateRow(record.id!, 'supplierId', (sel as any).id || '');
              handleUpdateRow(record.id!, 'supplierContactPerson' as any, (sel as any).supplierContactPerson || '');
              handleUpdateRow(record.id!, 'supplierContactPhone' as any, (sel as any).supplierContactPhone || '');
            }
          }}
        />
      ),
    },
    {
      title: '操作', key: 'action', width: 120, fixed: 'right' as const,
      render: (_: unknown, record: MaterialPurchase) => (
        <RowActions
          maxInline={2}
          actions={[
            { key: 'select', label: '选用', title: '从面辅料资料选用', onClick: () => handleOpenMaterialModal(record.id!) },
            { key: 'delete', label: '删除', title: '删除此行', danger: true, onClick: () => { confirmDelete('该物料行', async () => handleRemoveRow(record.id!), { content: '删除此物料行？保存后将不可恢复' }); } },
          ]}
        />
      ),
    },
  ];
}

export interface ViewColumnsDeps {
  colWidth: number | undefined;
  editing: boolean;
  /** 样衣采购场景：true 时隐藏"出库领取"按钮（样衣不经过仓库库存，按钮误点必返回 400 库存不足） */
  sampleMode?: boolean;
  /** D-272：仓库库存映射（purchaseId → 可用库存）。出库领取仅在库存>0（做过入库）时显示 */
  stockMap?: Record<string, number>;
  /** 样衣BOM已完成：锁定编辑/删除（需在样衣详情-物料清单退回后操作） */
  locked?: boolean;
  handleStartEdit: () => void;
  handleDelete: (record: MaterialPurchase) => void;
  openReceive: (record: MaterialPurchase) => void;
  openInbound: (record: MaterialPurchase) => void;
  handleReturnConfirm: (record: MaterialPurchase) => void;
  handleReturnReset: (record: MaterialPurchase) => void;
  handleCancelReceive: (record: MaterialPurchase) => void;
  handleWarehousePick: (record: MaterialPurchase, quantity: number) => void;
  setQualityIssueRecord: (record: MaterialPurchase | null) => void;
  setQualityIssueVisible: (visible: boolean) => void;
}

export function buildViewColumns(deps: ViewColumnsDeps): ColumnsType<MaterialPurchase> {
  const {
    colWidth, editing, sampleMode, locked, stockMap,
    handleStartEdit, handleDelete,
    openReceive, openInbound,
    handleReturnConfirm, handleReturnReset, handleCancelReceive,
    handleWarehousePick,
    setQualityIssueRecord, setQualityIssueVisible,
  } = deps;

  return [
    { title: '物料类型', dataIndex: 'materialType', key: 'materialType', width: colWidth || 100, render: (v: string) => <MaterialTypeTag value={v} /> },
    { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: colWidth || 140, ellipsis: true },
    { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: colWidth || 120, ellipsis: true },
    { title: '颜色', dataIndex: 'color', key: 'color', width: colWidth || 80, ellipsis: true, render: (v: string) => String(v || '').trim() || '-' },
    // size 为空 = 该物料不按码数区分（各码用量走 sizeUsageMap 分码配比），显示「全码」避免整列空白
    { title: '尺码', dataIndex: 'size', key: 'size', width: colWidth || 80, ellipsis: true, render: (v: string) => String(v || '').trim() || '全码' },
    { title: '单位', dataIndex: 'unit', key: 'unit', width: colWidth || 70, ellipsis: true },
    { title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: colWidth || 90, align: 'right' as const, render: (v: number) => Number.isFinite(Number(v)) ? formatMoney(v) : '-' },
    { title: '采购数量', dataIndex: 'purchaseQuantity', key: 'purchaseQuantity', width: colWidth || 100, align: 'right' as const, render: (v: number, r: MaterialPurchase) => formatMaterialQuantityWithUnit(v, r.unit) },
    { title: '到货数量', dataIndex: 'arrivedQuantity', key: 'arrivedQuantity', width: colWidth || 100, align: 'right' as const, render: (v: number, r: MaterialPurchase) => formatMaterialQuantityWithUnit(v, r.unit) },
    {
      title: '金额', key: 'amount', width: colWidth || 100, align: 'right' as const,
      render: (_: unknown, r: MaterialPurchase) => {
        const quantity = Number(r.purchaseQuantity || 0);
        const price = Number(r.unitPrice || 0);
        const total = quantity * price;
        return Number.isFinite(total) ? formatMoney(total) : '-';
      },
    },
    {
      title: '供应商', dataIndex: 'supplierName', key: 'supplierName', width: colWidth || 140, ellipsis: true,
      render: (_: unknown, r: MaterialPurchase) => <SupplierNameTooltip name={r.supplierName} contactPerson={(r as any).supplierContactPerson} contactPhone={(r as any).supplierContactPhone} />,
    },
    { title: '采购日期', dataIndex: 'receivedTime', key: 'receivedTime', width: colWidth || 120, render: (v: string) => v ? formatDateTime(v) : '-' },
    { title: '最新到货日期', dataIndex: 'expectedArrivalDate', key: 'expectedArrivalDate', width: colWidth || 120, render: (v: string) => v ? formatDateTime(v) : '-' },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: colWidth || 110,
      render: (status: string) => {
        const config = getStatusConfig(status as MaterialPurchase['status']);
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '操作', key: 'action', width: 260, fixed: 'right' as const,
      render: (_: unknown, record: MaterialPurchase) => {
        const status = String(record.status || '').toLowerCase();
        const isPending = status === MATERIAL_PURCHASE_STATUS.PENDING;
        const isReceived = status === MATERIAL_PURCHASE_STATUS.RECEIVED || status === 'received';
        const isPartial = status === MATERIAL_PURCHASE_STATUS.PARTIAL || status === MATERIAL_PURCHASE_STATUS.PARTIAL_ARRIVAL;
        const isCompleted = status === MATERIAL_PURCHASE_STATUS.COMPLETED || status === 'completed';
        const isCancelled = status === MATERIAL_PURCHASE_STATUS.CANCELLED || status === 'cancelled';

        const isReturnConfirmed = Number((record as any)?.returnConfirmed || 0) === 1;
        const isWarehousePending = status === MATERIAL_PURCHASE_STATUS.WAREHOUSE_PENDING || status === 'warehouse_pending';

        // D-124：编辑/删除按行锁定——本行已回料确认则本行禁改删（其他未确认行不受影响）；BOM完成锁仍为整表
        const rowEditLocked = !!locked || isReturnConfirmed;
        const rowEditLockTitle = isReturnConfirmed
          ? '已回料确认，如需调整请先在操作中退回'
          : (locked ? '样衣物料清单已完成，请先在样衣详情-物料清单退回' : '');

        return (
          <RowActions
            maxInline={2}
            actions={[
              ...(editing ? [] : [
                { key: 'edit', label: '编辑', title: rowEditLockTitle || '编辑采购信息', onClick: () => handleStartEdit(), disabled: isCancelled || rowEditLocked },
              ]),
              { key: 'delete', label: '删除', title: rowEditLockTitle || '删除此物料行', onClick: () => handleDelete(record), danger: true, disabled: isCancelled || rowEditLocked },
              ...(isWarehousePending ? [{ key: 'warehouse-pending', label: '待仓库出库', title: '等待仓库出库', disabled: true }] : []),
              ...(!isWarehousePending && (isPending || isReceived || isPartial) ? (() => {
                const rowMissing = getPurchaseMissingFields(record);
                // D-122：已回料确认行禁止再登记到货（与列表页/大货 Drawer 联动）
                const rowDisabled = rowMissing.length > 0 || isReturnConfirmed;
                const rowTitle = isReturnConfirmed ? '已回料确认，如需重做请先退回' : (rowMissing.length > 0 ? `该行缺少：${rowMissing.join('、')}，请先编辑补全` : (isPending ? '领取采购并登记到货数量' : '登记追加到货数量'));
                return [{ key: 'receive', label: isPending ? (rowMissing.length > 0 ? `领取（缺${rowMissing.join('、')}）` : '领取并到货') : '追加到货', title: rowTitle, onClick: () => openReceive(record), primary: isPending, disabled: rowDisabled }];
              })() : []),
              ...(isPending ? [{ key: 'inbound', label: '登记到货', title: '直接登记到货数量', onClick: () => openInbound(record) }] : []),
              // D-122：已回料确认的行置灰（与批量操作/列表页/大货 Drawer 同一判定），如需重做先点「退回」
              ...(!isPending && !isCancelled ? [{ key: 'return-confirm', label: '回料确认', title: isReturnConfirmed ? '已回料确认，如需重做请先退回' : '确认物料已回料到仓库', disabled: isReturnConfirmed, onClick: () => handleReturnConfirm(record) }] : []),
              ...(isReturnConfirmed ? [{ key: 'return-reset', label: '退回', title: '退回已确认的回料', onClick: () => handleReturnReset(record), danger: true }] : []),
              ...(!isPending && !isCompleted && !isCancelled && !isReturnConfirmed ? [{ key: 'cancel-receive', label: '撤回采购', title: '撤回已领取的采购，恢复为待处理', onClick: () => handleCancelReceive(record), danger: true }] : []),
              // D-117：已取消的采购不可再登记品质异常（终态行按钮置灰）
              { key: 'quality-issue', label: '品质异常', title: isCancelled ? '该采购已取消，不可登记品质异常' : '登记物料品质问题', disabled: isCancelled, onClick: () => { setQualityIssueRecord(record); setQualityIssueVisible(true); } },
              // D-272：「出库领取」只在仓库真有库存（做过入库）时显示。
              // 直采直用（登记到货但从未入库）的采购不走仓库流程，
              // 显示按钮只会让用户误点 → 后端 calcAvailableStock=0 → 400 仓库库存不足。
              // 样衣模式同理隐藏。
              ...(() => {
                if (sampleMode || !(isReturnConfirmed || isCompleted)) return [];
                const stockQty = stockMap?.[String(record.id)];
                if (stockQty == null || Number(stockQty) <= 0) return [];
                const pickQty = Math.min(Number(stockQty), Number(record.arrivedQuantity || record.purchaseQuantity || 0));
                return [{
                  key: 'warehouse-pick',
                  label: '出库领取',
                  title: `从库存出库领取物料（仓库可用 ${stockQty}${record.unit ? ' ' + record.unit : ''}）`,
                  onClick: () => handleWarehousePick(record, pickQty),
                  primary: true,
                }];
              })(),
            ]}
          />
        );
      },
    },
  ];
}
