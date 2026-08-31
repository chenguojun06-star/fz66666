import React, { useMemo } from 'react';
import { Card, Alert, Statistic, Row, Col, Tag, Typography, Progress } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { formatDateTime } from '@/utils/datetime';
import { WarehousingDetailRecord } from '../../types';
import { getQualityStatusConfig, getDefectCategoryLabel, getDefectRemarkLabel } from '../../utils';

const { Text } = Typography;

interface QcStats {
  total: number;
  qualified: number;
  unqualified: number;
  count: number;
  warehoused: number;
  pendingWarehouse: number;
}

interface Props {
  qcRecords: WarehousingDetailRecord[];
  qcStats: QcStats;
  recordsLoading: boolean;
  highlightWhNo: string;
}

const QcRecordsPanel: React.FC<Props> = ({ qcRecords, qcStats, recordsLoading, highlightWhNo }) => {
  // D-253：质检记录分类——不合格记录按「次品类别」「处理方式」聚合，一眼看清主要缺陷构成；全部合格不渲染
  const unqualifiedTotal = Number(qcStats.unqualified || 0);
  const defectGroupList = useMemo(() => {
    if (unqualifiedTotal <= 0) return [];
    const map = new Map<string, number>();
    qcRecords.forEach((r) => {
      const qty = Number(r.unqualifiedQuantity || 0);
      if (qty <= 0) return;
      const label = getDefectCategoryLabel(r.defectCategory);
      map.set(label, (map.get(label) || 0) + qty);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [qcRecords, unqualifiedTotal]);

  const remarkGroupList = useMemo(() => {
    if (unqualifiedTotal <= 0) return [];
    const map = new Map<string, number>();
    qcRecords.forEach((r) => {
      const qty = Number(r.unqualifiedQuantity || 0);
      if (qty <= 0) return;
      const label = getDefectRemarkLabel(r.defectRemark);
      map.set(label, (map.get(label) || 0) + qty);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [qcRecords, unqualifiedTotal]);

  return (
  <div>
    {/* 统计卡片 */}
    <Row gutter={16} style={{ marginBottom: 16 }}>
      <Col span={4}><Statistic title="质检次数" value={qcStats.count} /></Col>
      <Col span={4}><Statistic title="质检总数" value={qcStats.total} /></Col>
      <Col span={4}><Statistic title="合格数" value={qcStats.qualified} styles={{ content: { color: 'var(--color-success)' } }} /></Col>
      <Col span={4}><Statistic title="不合格数" value={qcStats.unqualified} styles={{ content: { color: 'var(--color-danger)' } }} /></Col>
      <Col span={4}><Statistic title="已入库" value={qcStats.warehoused} styles={{ content: { color: 'var(--color-info)' } }} /></Col>
      <Col span={4}><Statistic title="待入库" value={qcStats.pendingWarehouse} styles={{ content: { color: 'var(--color-warning)' } }} /></Col>
    </Row>

    {qcStats.total > 0 && qcRecords.length > 0 && (() => {
      const passRate = Math.round(qcStats.qualified / qcStats.total * 100);
      if (passRate >= 80) return null;
      return (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          title={`批次质检通过率偏低：当前通过率 ${passRate}%（合格 ${qcStats.qualified} / 总计 ${qcStats.total}），低于警戒线 80%，请复核不合格原因。`}
        />
      );
    })()}

    {/* 不合格记录分类聚合 */}
    {unqualifiedTotal > 0 && (defectGroupList.length > 0 || remarkGroupList.length > 0) ? (
      <Row gutter={16} style={{ marginBottom: 12 }}>
        <Col xs={24} lg={12}>
          <Card size="small" title={`不合格分布 · 次品类别（共 ${unqualifiedTotal} 件）`}>
            {defectGroupList.length > 0 ? defectGroupList.map(([label, qty]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Tag color="error" style={{ width: 120, textAlign: 'center', marginInlineEnd: 0, flexShrink: 0 }}>{label}</Tag>
                <Progress
                  percent={Math.round(qty / unqualifiedTotal * 100)}
                  size="small"
                  strokeColor="var(--color-danger)"
                  format={() => `${qty}件`}
                  style={{ flex: 1, marginBottom: 0 }}
                />
              </div>
            )) : <Typography.Text type="secondary">暂无次品类别标注</Typography.Text>}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title={`不合格分布 · 处理方式（共 ${unqualifiedTotal} 件）`}>
            {remarkGroupList.length > 0 ? remarkGroupList.map(([label, qty]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Tag color="warning" style={{ width: 120, textAlign: 'center', marginInlineEnd: 0, flexShrink: 0 }}>{label}</Tag>
                <Progress
                  percent={Math.round(qty / unqualifiedTotal * 100)}
                  size="small"
                  strokeColor="var(--color-warning)"
                  format={() => `${qty}件`}
                  style={{ flex: 1, marginBottom: 0 }}
                />
              </div>
            )) : <Typography.Text type="secondary">暂无处理方式标注</Typography.Text>}
          </Card>
        </Col>
      </Row>
    ) : null}

    <Card title="质检记录明细" loading={recordsLoading}>
      <ResizableTable<WarehousingDetailRecord>
        storageKey="qc-records-panel-table"
        rowKey="id" pagination={false}
        emptyDescription="暂无质检数据"
        dataSource={qcRecords}
        resizableColumns={false}
        scroll={{ x: 1100 }}
        style={{ fontSize: 14 }}
        rowClassName={(record) =>
          highlightWhNo && record.warehousingNo === highlightWhNo ? 'ant-table-row-selected' : ''
        }
        columns={[
          {
            title: '质检入库号', dataIndex: 'warehousingNo', key: 'wn', width: 110,
            render: (v: string) => <Text strong={highlightWhNo === v}>{v || '-'}</Text>,
          },
          {
            title: '菲号', dataIndex: 'cuttingBundleQrCode', key: 'qr', width: 100, ellipsis: true,
            render: (v: unknown) => { const t = String(v || '').split('|')[0].trim(); if (!t) return '-'; const parts = t.split('-'); return parts.length > 3 ? parts.slice(-3).join('-') : t; },
          },
          { title: '颜色', dataIndex: 'color', key: 'color', width: 70 },
          { title: '尺码', dataIndex: 'size', key: 'size', width: 60 },
          { title: '质检数', dataIndex: 'warehousingQuantity', key: 'wq', width: 70, align: 'right' as const },
          {
            title: '合格数', dataIndex: 'qualifiedQuantity', key: 'qq', width: 80, align: 'right' as const,
            render: (v: number) => <span style={{ color: 'var(--color-success)' }}>{v ?? 0}</span>,
          },
          {
            title: '不合格数', dataIndex: 'unqualifiedQuantity', key: 'uq', width: 80, align: 'right' as const,
            render: (v: number) => v ? <span style={{ color: 'var(--color-danger)' }}>{v}</span> : <span>0</span>,
          },
          {
            title: '质检状态', dataIndex: 'qualityStatus', key: 'qs', width: 90,
            render: (s: string) => { const c = getQualityStatusConfig(s); return <Tag color={c.color}>{c.text}</Tag>; },
          },
          {
            title: '仓库', dataIndex: 'warehouse', key: 'wh2', width: 80,
            render: (v: string) => v || <Tag color="warning">待入库</Tag>,
          },
          {
            title: '次品类别', key: 'dc', width: 100,
            render: (_: unknown, r: WarehousingDetailRecord) =>
              Number(r.unqualifiedQuantity || 0) > 0 ? getDefectCategoryLabel(r.defectCategory) : '-',
          },
          {
            title: '处理方式', key: 'dr', width: 100,
            render: (_: unknown, r: WarehousingDetailRecord) =>
              Number(r.unqualifiedQuantity || 0) > 0 ? getDefectRemarkLabel(r.defectRemark) : '-',
          },
          {
            title: '质检时间', dataIndex: 'createTime', key: 'ct', width: 150,
            render: (v: unknown) => formatDateTime(v),
          },
        ]}
      />
    </Card>
  </div>
  );
};

export default QcRecordsPanel;
