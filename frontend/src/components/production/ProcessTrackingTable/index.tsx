import React, { useMemo } from 'react';
import { Tag, Space } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { formatDateTime } from '@/utils/datetime';

interface ProcessTrackingRecord {
  id: number;
  bundleNo: string;
  sku?: string;
  color?: string;
  size?: string;
  quantity: number;
  processCode: string;
  processName: string;
  processOrder: number;
  unitPrice: number;
  scanStatus: 'pending' | 'scanned' | 'reset';
  scanTime?: string;
  operatorName?: string;
  settlementAmount?: number;
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
}

/**
 * 工序类型 → 关键词映射
 * 用于通过 processName 匹配工序记录是否属于某个阶段
 */
const STAGE_KEYWORDS: Record<string, string[]> = {
  // NodeType (来自进度球)
  procurement: ['采购', '物料', '备料'],
  cutting: ['裁剪', '裁床', '开裁', '剪裁'],
  sewing: ['车缝', '缝制', '缝纫', '车工'],
  ironing: ['整烫', '熨烫', '大烫'],
  quality: ['质检', '检验', '品检', '验货'],
  packaging: ['包装', '后整', '打包', '装箱'],
  secondaryProcess: ['二次工艺', '绣花', '印花', '二次'],
  warehousing: ['入库', '仓库'],
  // ProcessType (来自列表页)
  carSewing: ['车缝', '缝制', '缝纫', '车工', '生产'],
  tailProcess: ['尾部', '整烫', '包装', '质检', '后整', '剪线', '熨烫', '大烫', '检验', '品检', '打包', '装箱'],
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
const matchesFilter = (record: ProcessTrackingRecord, filterType: string, nodeName?: string): boolean => {
  const code = (record.processCode || '').toLowerCase();
  const name = record.processName || '';

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

const ProcessTrackingTable: React.FC<ProcessTrackingTableProps> = ({ records, loading, nodeType, nodeName, processType }) => {
  const safeRecords = Array.isArray(records) ? records : [];
  const filterType = nodeType || processType;

  // 按 nodeType/processType/nodeName 过滤记录
  const filteredRecords = useMemo(() => {
    if (!filterType) return safeRecords;
    return safeRecords.filter(r => matchesFilter(r, filterType, nodeName));
  }, [safeRecords, filterType, nodeName]);

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
