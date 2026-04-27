import React from 'react';
import { Card, Alert, Statistic, Row, Col, Tag, Typography } from 'antd';
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

const QcRecordsPanel: React.FC<Props> = ({ qcRecords, qcStats, recordsLoading, highlightWhNo }) => (
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

    <Card size="small" title="质检记录明细" loading={recordsLoading}>
      <ResizableTable<WarehousingDetailRecord>
        size="small" rowKey="id" pagination={false}
        dataSource={qcRecords}
        resizableColumns={false}
        scroll={undefined}
        style={{ fontSize: 12 }}
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

export default QcRecordsPanel;
