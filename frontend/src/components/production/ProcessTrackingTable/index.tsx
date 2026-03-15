import React, { useMemo, useCallback } from 'react';
import { Tag, Space, App } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import { formatDateTime } from '@/utils/datetime';
import { productionScanApi } from '@/services/production/productionApi';
import { stageAliasMap, carSewingKeywords, tailProcessKeywords } from '@/utils/productionStage';
import { useAuth, isAdminUser } from '@/utils/AuthContext';

interface ProcessTrackingRecord {
  id: string;
  bundleNo: string;
  sku?: string;
  color?: string;
  size?: string;
  quantity: number;
  processCode: string;
  processName: string;
  scanType?: string;
  processOrder: number;
  unitPrice: number;
  scanStatus: 'pending' | 'scanned' | 'reset';
  scanTime?: string;
  operatorName?: string;
  settlementAmount?: number;
  /** 关联的扫码记录ID（用于撤回） */
  scanRecordId?: string;
  /** 是否已工资结算（已结算不可撤回） */
  isSettled?: boolean;
  /** 后续质检环节是否已完成扫码（true=后端会拒绝撤回，前端主动隐藏按钮） */
  hasNextStageScanned?: boolean;
}

/** 工序单价项（从模板/节点传入，用于动态过滤） */
interface ProcessListItem {
  id?: string;
  processCode?: string;
  code?: string;
  name?: string;
  processName?: string;
}

interface ProcessTrackingTableProps {
  records: ProcessTrackingRecord[];
  loading?: boolean;
  /** NodeDetailModal 传入的节点类型 (procurement/cutting/sewing/ironing/quality/packaging/secondaryProcess) */
  nodeType?: string;
  /** NodeDetailModal 传入的节点名称，如 "车缝"、"剪线"、"质检" */
  nodeName?: string;
  /** ProcessDetailModal 传入的工序类型 (procurement/cutting/carSewing/secondaryProcess/tailProcess/warehousing) */
  processType?: string;
  /** 订单状态（completed 时禁止撤回） */
  orderStatus?: string;
  /** 撤回成功后的回调 */
  onUndoSuccess?: () => void;
  /**
   * 该节点下的所有子工序列表（含 processCode/name），用于动态过滤。
   * 当模板修改了工序名称时，通过 processCode 精确匹配而非硬编码关键词，
   * 保证弹窗数据与模板始终一致（动态匹配）。
   */
  processList?: ProcessListItem[];
}

/** 判断工序跟踪记录是否可在 PC 端撤回
 *  isAdmin=true 时与后端一致：5小时窗口；普通用户 30分钟。
 *  终结状态（completed/cancelled/closed）与后端 isTerminalOrderStatus 完全对齐。
 */
function canUndoTracking(record: ProcessTrackingRecord, orderStatus?: string, isAdmin?: boolean): boolean {
  if (record.scanStatus !== 'scanned') return false;
  const scanType = String(record.scanType || '').trim().toLowerCase();
  const processCode = String(record.processCode || '').trim().toLowerCase();
  const processName = String(record.processName || '').trim();
  const isWarehouseRecord = scanType === 'warehouse'
    || processCode.startsWith('warehousing')
    || processCode === 'quality_warehousing'
    || processName === '入库'
    || processName === '质检入库'
    || processName === '次品入库';
  if (isWarehouseRecord) return false;
  if (record.isSettled) return false;
  if (record.hasNextStageScanned) return false;
  if (!record.scanRecordId) return false;
  // 与后端 isTerminalOrderStatus 对齐：completed / cancelled / closed 均禁止撤回
  if (orderStatus) {
    const s = orderStatus.toLowerCase();
    if (s === 'completed' || s === 'cancelled' || s === 'closed') return false;
  }
  const scanTime = record.scanTime;
  if (scanTime) {
    const scanMs = new Date(String(scanTime).replace(' ', 'T')).getTime();
    const limitMs = isAdmin ? 5 * 3600 * 1000 : 30 * 60 * 1000; // 管理员 5h，普通用户 30min
    if (!isNaN(scanMs) && Date.now() - scanMs >= limitMs) return false;
  }
  return true;
}

/**
 * 工序类型 → 关键词映射
 * 用于通过 processName 匹配工序记录是否属于某个阶段
 */
/**
 * 统一工序关键词表（从 productionStage.ts 派生，禁止在此处内联关键词数组）
 * 修改关键词请直接修改 frontend/src/utils/productionStage.ts
 */
const STAGE_KEYWORDS: Record<string, string[]> = {
  // NodeType (来自进度球) — 与 stageAliasMap 完全同步
  ...stageAliasMap,
  // ProcessType (来自列表页) — carSewing/tailProcess 为组合型阶段
  carSewing: carSewingKeywords,
  tailProcess: tailProcessKeywords,
};

/**
 * processType/nodeType → processCode 前缀映射
 * 后端 processCode 格式为 "sewing_001"，可通过前缀匹配
 */
const TYPE_TO_CODE_PREFIX: Record<string, string[]> = {
  procurement: ['procurement'],
  cutting: ['cutting'],
  sewing: ['sewing'],
  carSewing: ['sewing'],
  ironing: ['ironing', 'pressing'],
  quality: ['quality'],
  packaging: ['packaging'],
  secondaryProcess: ['secondary'],
  warehousing: ['warehousing'],
  tailProcess: ['ironing', 'pressing', 'quality', 'packaging', 'thread'],
};

/** 判断一条记录是否匹配过滤条件 */
const matchesFilter = (record: ProcessTrackingRecord, filterType: string, nodeName?: string, processList?: ProcessListItem[]): boolean => {
  const code = (record.processCode || '').toLowerCase();
  const rawName = record.processName || '';
  // 规范化名称：解决"质检入库"同时匹配质检和入库的歧义问题
  // "质检入库"业务含义是"入库"（质检后入仓），不是"质检"
  const name = rawName === '质检入库' ? '入库' : rawName;

  // 策略0（最高优先级）：通过 processList 的 processCode 做精确动态匹配
  // 当模板修改了工序名称时，processCode 不变，因此这个策略始终有效
  if (processList && processList.length > 0) {
    const plCodes = processList
      .map(p => String(p.processCode || p.code || '').trim().toLowerCase())
      .filter(Boolean);
    const plNames = processList
      .map(p => String(p.name || p.processName || '').trim().toLowerCase())
      .filter(Boolean);
    // processCode 精确或包含匹配
    if (plCodes.length > 0 && plCodes.some(c => code && (code === c || code.startsWith(c) || c.includes(code)))) {
      return true;
    }
    // processName 与 processList 名称匹配（支持改名场景的双向包含）
    if (plNames.length > 0) {
      const recNameLow = name.toLowerCase();
      if (plNames.some(n => n && (recNameLow.includes(n) || n.includes(recNameLow)))) {
        return true;
      }
    }
  }

  // 策略1：processCode 前缀匹配（如 filterType='sewing' → processCode 以 'sewing' 开头）
  const prefixes = TYPE_TO_CODE_PREFIX[filterType];
  if (prefixes && prefixes.some(p => code.startsWith(p))) {
    return true;
  }

  // 策略2：processName 关键词匹配
  const keywords = STAGE_KEYWORDS[filterType];
  if (keywords && keywords.some(kw => name.includes(kw))) {
    return true;
  }

  // 策略3：nodeName 直接匹配（处理中文节点名如 "剪线"、"整烫" 直接传入的情况）
  if (nodeName) {
    const trimmed = nodeName.trim();
    if (trimmed && name.includes(trimmed)) {
      return true;
    }
  }

  // 策略4：filterType 本身是中文（nodeTypeMap 没映射到的情况，如 "剪线"）
  if (filterType && /[\u4e00-\u9fa5]/.test(filterType) && name.includes(filterType)) {
    return true;
  }

  return false;
};

const ProcessTrackingTable: React.FC<ProcessTrackingTableProps> = ({ records, loading, nodeType, nodeName, processType, orderStatus, processList, onUndoSuccess }) => {
  const { message, modal } = App.useApp();
  const { user } = useAuth();
  const _isAdmin = isAdminUser(user);
  const safeRecords = Array.isArray(records) ? records : [];

  const handleUndo = useCallback(async (record: ProcessTrackingRecord) => {
    modal.confirm({
      width: '30vw',
      title: '确认撤回',
      content: `确定撤回此扫码记录？\n菲号: ${record.bundleNo}\n工序: ${record.processName || '-'}\n数量: ${record.quantity || 0}件`,
      okText: '确认撤回',
      cancelText: '取消',
      okButtonProps: { danger: true, type: 'default' },
      onOk: async () => {
        try {
          await productionScanApi.undo({ recordId: record.scanRecordId! });
          message.success('撤回成功');
          onUndoSuccess?.();
        } catch (e: any) {
          message.error(e?.response?.data?.message || e?.message || '撤回失败');
        }
      },
    });
  }, [message, modal, onUndoSuccess]);
  const filterType = nodeType || processType;

  // 按 nodeType/processType/nodeName/processList 过滤记录（动态匹配，支持模板改名）
  const filteredRecords = useMemo(() => {
    if (!filterType) return safeRecords;
    return safeRecords.filter(r => matchesFilter(r, filterType, nodeName, processList));
  }, [safeRecords, filterType, nodeName, processList]);

  // 平铺数据：按菲号+工序排序
  const flatData = useMemo(() => {
    return [...filteredRecords]
      .sort((a, b) => {
        const bA = Number(a.bundleNo) || 0;
        const bB = Number(b.bundleNo) || 0;
        if (bA !== bB) return bA - bB;
        return (a.processOrder || 0) - (b.processOrder || 0);
      })
      .map(r => ({ ...r, key: `row-${r.id}` }));
  }, [filteredRecords]);

  // 统计信息
  const stats = useMemo(() => {
    const total = flatData.length;
    const scanned = flatData.filter(r => r.scanStatus === 'scanned').length;
    const totalAmount = flatData.reduce((s, r) => s + (r.settlementAmount || 0), 0);
    const bundles = new Set(flatData.map(r => r.bundleNo)).size;
    return { total, scanned, totalAmount, bundles };
  }, [flatData]);

  const columns = [
    {
      title: '菲号',
      dataIndex: 'bundleNo',
      key: 'bundleNo',
      width: 70,
      fixed: 'left' as const,
      render: (v: number) => (
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1f2937' }}>{v}</span>
      ),
    },
    {
      title: '工序',
      dataIndex: 'processName',
      key: 'processName',
      width: 100,
      render: (v: string, record: any) => (
        <div>
          <span style={{ fontSize: 12, fontWeight: 500 }}>{v || '-'}</span>
          {record.processCode && (
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginLeft: 4 }}>({record.processCode})</span>
          )}
        </div>
      ),
    },
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 80,
      render: (v: string) => <span style={{ fontSize: 12 }}>{v || '-'}</span>,
    },
    {
      title: '尺码',
      dataIndex: 'size',
      key: 'size',
      width: 70,
      render: (v: string) => <span style={{ fontSize: 12 }}>{v || '-'}</span>,
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 70,
      align: 'right' as const,
      render: (v: number) => <span style={{ fontSize: 12, fontWeight: 600 }}>{v || 0}</span>,
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 80,
      align: 'right' as const,
      render: (price: number) => (
        <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
          {price ? `¥${Number(price).toFixed(2)}` : '-'}
        </span>
      ),
    },
    {
      title: '扫码状态',
      dataIndex: 'scanStatus',
      key: 'scanStatus',
      width: 90,
      render: (status: string) => {
        const sm: Record<string, { color: string; label: string }> = {
          scanned: { color: 'var(--color-success)', label: '已扫码' },
          pending: { color: 'var(--color-warning)', label: '待扫码' },
          reset: { color: 'var(--color-danger)', label: '已重置' },
        };
        const cfg = sm[status] || { color: '#d9d9d9', label: status || '-' };
        return <Tag color={cfg.color} style={{ fontSize: 11, margin: 0 }}>{cfg.label}</Tag>;
      },
    },
    {
      title: '扫码时间',
      dataIndex: 'scanTime',
      key: 'scanTime',
      width: 140,
      render: (time: string) => (
        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{time ? formatDateTime(time) : '-'}</span>
      ),
    },
    {
      title: '操作人',
      dataIndex: 'operatorName',
      key: 'operatorName',
      width: 90,
      render: (v: string) => <span style={{ fontSize: 12 }}>{v || '-'}</span>,
    },
    {
      title: '结算金额',
      dataIndex: 'settlementAmount',
      key: 'settlementAmount',
      width: 100,
      align: 'right' as const,
      render: (amount: number) => (
        <span style={{ fontSize: 12, color: 'var(--color-success)', fontWeight: 600 }}>
          {amount ? `¥${Number(amount).toFixed(2)}` : '-'}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 80,
      render: (_: any, record: ProcessTrackingRecord) => {
        if (!canUndoTracking(record, orderStatus, _isAdmin)) return null;
        const actions: RowAction[] = [
          {
            key: 'undo',
            label: '撤回',
            danger: true,
            primary: true,
            onClick: () => handleUndo(record),
          },
        ];
        return <RowActions actions={actions} />;
      },
    },
  ];

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        {filterType && (
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            当前筛选：<strong style={{ color: '#1f2937' }}>{nodeName || filterType}</strong>
          </span>
        )}
        <Space split={'·'}>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            菲号: <strong>{stats.bundles}</strong> 个
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            工序: <strong>{stats.total}</strong> 条
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-success)' }}>
            已扫: <strong>{stats.scanned}</strong> 条
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-success)' }}>
            金额: <strong>{`¥${stats.totalAmount.toFixed(2)}`}</strong>
          </span>
        </Space>
      </div>

      <ResizableTable
        storageKey="process-tracking"
        columns={columns}
        dataSource={flatData}
        loading={loading}
        rowKey="key"
        size="small"
        scroll={{ x: 900, y: 450 }}
        pagination={{
          pageSize: 50,
          showSizeChanger: true,
          pageSizeOptions: ['20', '50', '100'],
          showTotal: (total) => `共 ${total} 条记录`,
          size: 'small',
        }}
      />
    </div>
  );
};

export default ProcessTrackingTable;
