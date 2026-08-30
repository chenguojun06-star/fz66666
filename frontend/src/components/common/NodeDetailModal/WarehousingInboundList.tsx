/**
 * D-222：入库节点详情的成品入库记录兜底列表。
 * 入库不是工资结算工序，t_production_process_tracking 里通常没有"入库"行——
 * 工序跟踪 tab 筛选入库时永远是 0 条（与预警条"264/32 已完成"自相矛盾）。
 * 此组件直接展示 t_product_warehousing 成品入库单（权威入库事实），跟踪表无行时兜底显示。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Button, Table } from 'antd';
import api from '@/utils/api';

interface WarehousingInboundListProps {
  orderId?: string;
  orderNo?: string;
  onNavigateInspect?: () => void;
  completed?: boolean;
}

const WarehousingInboundList: React.FC<WarehousingInboundListProps> = ({ orderId, orderNo, onNavigateInspect, completed }) => {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orderId && !orderNo) return;
    let mounted = true;
    setLoading(true);
    api.get('/production/warehousing/list', {
      params: { page: 1, pageSize: 50, ...(orderId ? { orderId } : {}), orderNo: orderNo || '' },
    }).then((res: any) => {
      if (!mounted) return;
      const raw = res?.data?.records ?? res?.data ?? [];
      setRecords(Array.isArray(raw) ? raw : []);
    }).catch(() => {
      if (mounted) setRecords([]);
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [orderId, orderNo]);

  const totalQualified = useMemo(
    () => records.reduce((s, r) => s + (Number(r.qualifiedQuantity) || 0), 0),
    [records],
  );

  return (
    <div>
      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          入库不是计件工序，以下为该订单的<strong>成品入库单记录</strong>（合格合计 <b style={{ color: 'var(--color-primary)' }}>{totalQualified}</b> 件）：
        </div>
        {onNavigateInspect && (
          <Button
            size="small"
            style={completed ? { color: 'var(--color-text-tertiary)', borderColor: 'var(--color-border-antd)' } : {}}
            onClick={onNavigateInspect}
          >
            跳转详情页
            {completed && <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 4 }}>（已完成）</span>}
          </Button>
        )}
      </div>
      <Table
        size="small"
        rowKey={(r: any) => String(r.id ?? r.warehousingNo)}
        loading={loading}
        dataSource={records}
        pagination={records.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
        scroll={{ x: 'max-content' }}
        columns={[
          { title: '入库单号', dataIndex: 'warehousingNo', key: 'warehousingNo', width: 150 },
          { title: '菲号', dataIndex: 'cuttingBundleNo', key: 'cuttingBundleNo', width: 80, render: (v: any) => v ?? '-' },
          { title: '颜色', dataIndex: 'color', key: 'color', width: 90, render: (v: any) => v || '-' },
          { title: '码数', dataIndex: 'size', key: 'size', width: 100, render: (v: any) => v || '-' },
          { title: '合格数', dataIndex: 'qualifiedQuantity', key: 'qualifiedQuantity', width: 80, render: (v: any) => <b style={{ color: 'var(--color-success)' }}>{v ?? 0}</b> },
          { title: '次品', dataIndex: 'unqualifiedQuantity', key: 'unqualifiedQuantity', width: 70, render: (v: any) => v || 0 },
          { title: '来源', dataIndex: 'warehousingType', key: 'warehousingType', width: 80, render: (v: any) => (v === 'scan' ? '扫码' : '手工') },
          { title: '仓库/库位', dataIndex: 'warehouse', key: 'warehouse', width: 100, render: (v: any) => v || '-' },
          { title: '操作人', dataIndex: 'warehousingOperatorName', key: 'warehousingOperatorName', width: 90, render: (v: any) => v || '-' },
          { title: '入库时间', dataIndex: 'createTime', key: 'createTime', width: 150, render: (v: any) => (v ? String(v).replace('T', ' ').slice(0, 16) : '-') },
        ]}
        locale={{ emptyText: '该订单还没有成品入库记录' }}
      />
    </div>
  );
};

export default WarehousingInboundList;
