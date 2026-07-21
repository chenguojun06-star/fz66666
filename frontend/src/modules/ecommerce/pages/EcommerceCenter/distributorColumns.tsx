import React from 'react';
import { Tag, Tooltip } from 'antd';
import RowActions from '@/components/common/RowActions';
import type { ColumnsType } from 'antd/es/table';
import type { RowAction } from '@/components/common/RowActions';
import type {
  DistributorProfile,
  DistributorLevel,
  DistributorPricePolicy,
  B2BOrder,
  DistributorBill,
} from './useDistributor';
import {
  CycleMap,
  StatusMap,
  PolicyTypeMap,
  B2BOrderStatusMap,
  getBillHandleLabel,
} from './distributorHelpers';
import { BILL_DIFF_TYPE_MAP, getConfidenceColor } from './helpers';

/** 列定义所需的上下文（来自 useDistributorTabData） */
export interface DistributorColumnContext {
  setProfileModal: React.Dispatch<React.SetStateAction<{ open: boolean; record: DistributorProfile | null }>>;
  setLevelModal: React.Dispatch<React.SetStateAction<{ open: boolean; record: DistributorLevel | null }>>;
  setPolicyModal: React.Dispatch<React.SetStateAction<{ open: boolean; record: DistributorPricePolicy | null }>>;
  handleDeleteProfile: (id: number) => void;
  handleDeleteLevel: (id: number) => void;
  handleDeletePolicy: (id: number) => void;
  handleShipB2B: (id: number) => void;
  handleConfirmB2B: (id: number) => void;
  handleCancelB2B: (id: number) => void;
  handleHandleBill: (id: number, status: number) => void;
  handleChangeProfileStatus: (record: DistributorProfile) => void;
}

export function buildProfileCols(ctx: DistributorColumnContext): ColumnsType<DistributorProfile> {
  return [
    { title: '分销商编号', dataIndex: 'distributorNo', width: 140 },
    { title: '名称', dataIndex: 'distributorName', width: 160 },
    { title: '等级', dataIndex: 'distributorLevel', width: 90, render: (v?: string) => v ? <Tag color="blue">{v}</Tag> : '-' },
    { title: '联系人', dataIndex: 'contactPerson', width: 90 },
    { title: '电话', dataIndex: 'contactPhone', width: 120 },
    { title: '结算周期', dataIndex: 'settlementCycle', width: 90, render: (v?: string) => {
      const m = v ? CycleMap[v] : null; return m ? <Tag color={m.color}>{m.label}</Tag> : '-';
    }},
    { title: '信用额度', dataIndex: 'creditLimit', width: 110, align: 'right' as const, render: (v?: number) => v ? `¥${v.toFixed(2)}` : '-' },
    { title: '已用额度', dataIndex: 'usedCredit', width: 110, align: 'right' as const, render: (v?: number) => v ? `¥${v.toFixed(2)}` : '-' },
    { title: '状态', dataIndex: 'status', width: 80, render: (v?: string) => {
      const m = v ? StatusMap[v] : null; return m ? <Tag color={m.color}>{m.label}</Tag> : '-';
    }},
    { title: '操作', width: 200, render: (_: unknown, r: DistributorProfile) => (
      <RowActions actions={[
        { key: 'edit', label: '编辑', primary: true, onClick: () => ctx.setProfileModal({ open: true, record: r }) },
        { key: 'status', label: '切换状态', onClick: () => ctx.handleChangeProfileStatus(r) },
        { key: 'del', label: '删除', danger: true, onClick: () => ctx.handleDeleteProfile(r.id!) },
      ]} />
    )},
  ];
}

export function buildLevelCols(ctx: DistributorColumnContext): ColumnsType<DistributorLevel> {
  return [
    { title: '等级编码', dataIndex: 'levelCode', width: 100 },
    { title: '等级名称', dataIndex: 'levelName', width: 140 },
    { title: '默认折扣率', dataIndex: 'defaultDiscount', width: 110, align: 'right' as const, render: (v?: number) => v != null ? `${v}%` : '-' },
    { title: '升级门槛', dataIndex: 'minPurchaseAmount', width: 120, align: 'right' as const, render: (v?: number) => v ? `¥${v.toFixed(2)}` : '-' },
    { title: '排序', dataIndex: 'sortOrder', width: 70 },
    { title: '操作', width: 150, render: (_: unknown, r: DistributorLevel) => (
      <RowActions actions={[
        { key: 'edit', label: '编辑', primary: true, onClick: () => ctx.setLevelModal({ open: true, record: r }) },
        { key: 'del', label: '删除', danger: true, onClick: () => ctx.handleDeleteLevel(r.id!) },
      ]} />
    )},
  ];
}

export function buildPolicyCols(ctx: DistributorColumnContext): ColumnsType<DistributorPricePolicy> {
  return [
    { title: '策略名称', dataIndex: 'policyName', width: 160 },
    { title: '类型', dataIndex: 'policyType', width: 90, render: (v?: string) => {
      const it = v ? PolicyTypeMap[v] : null; return it ? <Tag color={it.color}>{it.label}</Tag> : '-';
    }},
    { title: '适用等级', dataIndex: 'distributorLevel', width: 100, render: (v?: string) => v ?? '全部' },
    { title: '适用SKU', dataIndex: 'skuCode', width: 120, render: (v?: string) => v ?? '全部' },
    { title: '供货价', dataIndex: 'supplyPrice', width: 100, align: 'right' as const, render: (v?: number) => v != null ? `¥${v.toFixed(2)}` : '-' },
    { title: '最低零售价', dataIndex: 'minRetailPrice', width: 110, align: 'right' as const, render: (v?: number) => v != null ? `¥${v.toFixed(2)}` : '-' },
    { title: '操作', width: 150, render: (_: unknown, r: DistributorPricePolicy) => (
      <RowActions actions={[
        { key: 'edit', label: '编辑', primary: true, onClick: () => ctx.setPolicyModal({ open: true, record: r }) },
        { key: 'del', label: '删除', danger: true, onClick: () => ctx.handleDeletePolicy(r.id!) },
      ]} />
    )},
  ];
}

export function buildB2bCols(ctx: DistributorColumnContext): ColumnsType<B2BOrder> {
  return [
    { title: '订单号', dataIndex: 'orderNo', width: 180 },
    { title: 'SKU', dataIndex: 'skuCode', width: 130 },
    { title: '商品名称', dataIndex: 'productName', width: 160, ellipsis: true },
    { title: '数量', dataIndex: 'quantity', width: 70, align: 'right' as const },
    { title: '单价', dataIndex: 'unitPrice', width: 90, align: 'right' as const, render: (v?: number) => v != null ? `¥${v.toFixed(2)}` : '-' },
    { title: '总金额', dataIndex: 'totalAmount', width: 110, align: 'right' as const, render: (v?: number) => v != null ? `¥${v.toFixed(2)}` : '-' },
    { title: '状态', dataIndex: 'status', width: 90, render: (v?: number) => {
      const it = v != null ? B2BOrderStatusMap[v] : null; return it ? <Tag color={it.color}>{it.label}</Tag> : '-';
    }},
    { title: '操作', width: 200, render: (_: unknown, r: B2BOrder) => {
      const actions: RowAction[] = [];
      if (r.status === 1) {
        actions.push({ key: 'ship', label: '发货', primary: true, onClick: () => ctx.handleShipB2B(r.id!) });
      }
      if (r.status === 2) {
        actions.push({ key: 'confirm', label: '确认收货', primary: true, onClick: () => ctx.handleConfirmB2B(r.id!) });
      }
      if (r.status != null && r.status < 3) {
        actions.push({ key: 'cancel', label: '取消', danger: true, onClick: () => ctx.handleCancelB2B(r.id!) });
      }
      return <RowActions actions={actions} />;
    }},
  ];
}

export function buildBillCols(ctx: DistributorColumnContext): ColumnsType<DistributorBill> {
  return [
    { title: '账期', dataIndex: 'billPeriod', width: 90 },
    { title: '订单号', dataIndex: 'platformOrderNo', width: 150 },
    { title: '差异类型', dataIndex: 'diffType', width: 110, render: (v?: string) => {
      const it = v ? BILL_DIFF_TYPE_MAP[v] : null; return it ? <Tag color={it.color}>{it.label}</Tag> : <Tag>未知</Tag>;
    }},
    { title: '平台金额', dataIndex: 'platformAmount', width: 100, align: 'right' as const, render: (v?: number) => v != null ? `¥${v.toFixed(2)}` : '-' },
    { title: '本地金额', dataIndex: 'localAmount', width: 100, align: 'right' as const, render: (v?: number) => v != null ? `¥${v.toFixed(2)}` : '-' },
    { title: '差异金额', dataIndex: 'diffAmount', width: 100, align: 'right' as const, render: (v?: number) => {
      if (v == null) return '-';
      const color = Math.abs(v) < 0.01 ? 'var(--color-success)' : v > 0 ? 'var(--color-error)' : 'var(--color-warning)';
      return <span style={{ color, fontWeight: 500 }}>{v > 0 ? '+' : ''}{v.toFixed(2)}</span>;
    }},
    { title: 'AI 分析', dataIndex: 'aiAnalysis', width: 260, ellipsis: true, render: (v?: string | null, r?: DistributorBill) => {
      const text = v || '-';
      const conf = r?.aiConfidence;
      const color = getConfidenceColor(conf);
      return (
        <Tooltip title={text}>
          <span style={{ color }}>
            {conf != null && <span style={{ marginRight: 4 }}>[{conf}%]</span>}
            {text}
          </span>
        </Tooltip>
      );
    }},
    { title: '操作', width: 200, render: (_: unknown, r: DistributorBill) => {
      const actions: RowAction[] = r.handledStatus === 0 ? [
        { key: 'confirm', label: getBillHandleLabel(1), primary: true, onClick: () => ctx.handleHandleBill(r.id!, 1) },
        { key: 'appeal', label: getBillHandleLabel(2), onClick: () => ctx.handleHandleBill(r.id!, 2) },
        { key: 'ignore', label: getBillHandleLabel(3), onClick: () => ctx.handleHandleBill(r.id!, 3) },
      ] : [];
      return <RowActions actions={actions} />;
    }},
  ];
}

export interface AllDistributorColumns {
  profileCols: ColumnsType<DistributorProfile>;
  levelCols: ColumnsType<DistributorLevel>;
  policyCols: ColumnsType<DistributorPricePolicy>;
  b2bCols: ColumnsType<B2BOrder>;
  billCols: ColumnsType<DistributorBill>;
}

/** 一次性构建所有列定义 */
export function buildAllDistributorColumns(ctx: DistributorColumnContext): AllDistributorColumns {
  return {
    profileCols: buildProfileCols(ctx),
    levelCols: buildLevelCols(ctx),
    policyCols: buildPolicyCols(ctx),
    b2bCols: buildB2bCols(ctx),
    billCols: buildBillCols(ctx),
  };
}
