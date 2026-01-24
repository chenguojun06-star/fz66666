import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, Collapse, Descriptions, Form, Input, Modal, Row, Select, Space, Statistic, Tabs, Tag, message } from 'antd';
import { CheckOutlined, CloseCircleOutlined, DollarOutlined, RollbackOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import Layout from '../../components/Layout';
import ResizableTable from '../../components/common/ResizableTable';
import ResizableModal from '../../components/common/ResizableModal';
import RowActions from '../../components/common/RowActions';
import api from '../../utils/api';
import { returnFinanceReconciliation, updateFinanceReconciliationStatus } from '../../utils/api';
import { useSync } from '../../utils/syncManager';
import {
  MaterialReconQueryParams,
  MaterialReconciliation,
  OrderProfitMaterialItem,
  OrderProfitOrderInfo,
  OrderProfitResponse,
  OrderProfitSummary,
  OrderProfitTimelinePoint,
  ShipmentReconQueryParams,
  ShipmentReconciliation,
} from '../../types/finance';
import { formatDateTime } from '../../utils/datetime';
import { StyleCoverThumb } from '../../components/StyleAssets';
import { useAuth } from '../../utils/authContext';
import { useViewport } from '../../utils/useViewport';

type ApprovalTab = 'material' | 'shipment' | 'orderProfit';
type ReconStatus = 'pending' | 'verified' | 'approved' | 'paid' | 'rejected';
type ApprovalListKind = Exclude<ApprovalTab, 'orderProfit'>;
type ApprovalRecord = MaterialReconciliation | ShipmentReconciliation;

const { Option } = Select;

const isAdminUser = (user?: { role?: string; roleName?: string; username?: string } | null) => {
  const role = String(user?.role ?? user?.roleName ?? '').trim();
  const username = String(user?.username ?? '').trim();
  if (username === 'admin') return true;
  if (role === '1') return true;
  const lower = role.toLowerCase();
  return lower.includes('admin') || role.includes('管理员');
};

const toArray = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  return [];
};

const getStatusConfig = (status: ReconStatus | string | undefined) => {
  const statusMap: Record<string, { text: string; color: string }> = {
    pending: { text: '待审核', color: 'blue' },
    verified: { text: '已验证', color: 'green' },
    approved: { text: '已批准', color: 'cyan' },
    paid: { text: '已付款', color: 'success' },
    rejected: { text: '已拒绝', color: 'error' },
  };
  return statusMap[String(status || '')] || { text: '未知', color: 'default' };
};

const getMaterialPurchaseStatusConfig = (status: string | undefined) => {
  const statusMap: Record<string, { text: string; color: string }> = {
    pending: { text: '待采购', color: 'blue' },
    received: { text: '已领取', color: 'gold' },
    partial: { text: '部分到货', color: 'orange' },
    completed: { text: '全部到货', color: 'success' },
    cancelled: { text: '已取消', color: 'error' },
    canceled: { text: '已取消', color: 'error' },
  };
  return statusMap[String(status || '')] || { text: '未知', color: 'default' };
};

const canTransition = (from: ReconStatus, to: ReconStatus) => {
  if (from === to) return false;
  if (from === 'pending') return to === 'verified' || to === 'rejected';
  if (from === 'verified') return to === 'approved' || to === 'rejected';
  if (from === 'approved') return to === 'paid' || to === 'rejected';
  return false;
};

const getActionIcon = (key: string) => {
  const k = String(key || '').trim();
  if (k === 'verified') return <CheckOutlined />;
  if (k === 'approved') return <SafetyCertificateOutlined />;
  if (k === 'paid') return <DollarOutlined />;
  if (k === 'reReview') return <SafetyCertificateOutlined />;
  if (k === 'rejected') return <CloseCircleOutlined />;
  if (k === 'return') return <RollbackOutlined />;
  return undefined;
};

const formatMoney2 = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : '-';
};

type LineSeries<T> = {
  key: string;
  name: string;
  color: string;
  getY: (p: T) => number;
};

const SimpleLineChart = <T extends { date?: string }>(
  props: {
    height?: number;
    points: T[];
    series: LineSeries<T>[];
  }
) => {
  const height = Number(props.height || 220);
  const w = 900;
  const h = Math.max(160, height);
  const padL = 48;
  const padR = 16;
  const padT = 16;
  const padB = 40;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const pts = Array.isArray(props.points) ? props.points : [];
  const series = Array.isArray(props.series) ? props.series : [];
  const safeNum = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const xCount = pts.length;
  const xStep = xCount > 1 ? innerW / (xCount - 1) : 0;

  const allY: number[] = [];
  for (const s of series) {
    for (const p of pts) allY.push(safeNum(s.getY(p)));
  }
  const yMinRaw = allY.length ? Math.min(...allY) : 0;
  const yMaxRaw = allY.length ? Math.max(...allY) : 0;
  const yMin = Math.min(0, yMinRaw);
  const yMax = yMaxRaw === yMin ? yMin + 1 : yMaxRaw;

  const x = (i: number) => padL + xStep * i;
  const y = (v: number) => {
    const ratio = (v - yMin) / (yMax - yMin);
    return padT + innerH * (1 - ratio);
  };

  const buildPolyline = (s: LineSeries<T>) => {
    if (!pts.length) return '';
    return pts
      .map((p, i) => {
        const vx = x(i);
        const vy = y(safeNum(s.getY(p)));
        return `${vx.toFixed(1)},${vy.toFixed(1)}`;
      })
      .join(' ');
  };

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => yMin + (yMax - yMin) * r);
  const xLabelEvery = pts.length > 10 ? Math.ceil(pts.length / 6) : 1;

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        {yTicks.map((tv, idx) => {
          const yy = y(tv);
          return (
            <g key={idx}>
              <line x1={padL} y1={yy} x2={w - padR} y2={yy} stroke="#f0f0f0" strokeWidth={1} />
              <text x={padL - 8} y={yy + 4} fontSize={11} fill="#666" textAnchor="end">
                {formatMoney2(tv)}
              </text>
            </g>
          );
        })}

        <line x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="#d9d9d9" strokeWidth={1} />
        <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="#d9d9d9" strokeWidth={1} />

        {series.map((s) => {
          const points = buildPolyline(s);
          if (!points) return null;
          return <polyline key={s.key} points={points} fill="none" stroke={s.color} strokeWidth={2} />;
        })}

        {pts.map((p, i) => {
          if (i % xLabelEvery !== 0 && i !== pts.length - 1) return null;
          const label = String((p as Record<string, unknown>)?.date || '').trim();
          if (!label) return null;
          return (
            <text key={i} x={x(i)} y={h - 16} fill="#666" textAnchor="middle" style={{ fontSize: 'var(--font-size-xs)' }}>
              {label}
            </text>
          );
        })}
      </svg>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '8px 0 0 0' }}>
        {series.map((s) => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: 'inline-block' }} />
            <span style={{ fontSize: 'var(--font-size-sm)', color: '#555' }}>{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

type ApprovalTablePagination = {
  current: number;
  pageSize: number;
  total: number;
  onChange: (page: number, pageSize: number) => void;
};

type ApprovalTableProps = {
  kind: ApprovalListKind;
  columns: unknown[];
  dataSource: ApprovalRecord[];
  loading: boolean;
  pagination: ApprovalTablePagination;
  rowSelection: {
    selectedRowKeys: React.Key[];
    onChange: (keys: React.Key[], rows: ApprovalRecord[]) => void;
  };
  onOpenDetail: (kind: ApprovalListKind, record: ApprovalRecord) => void;
  ignoreRowClick: (e: unknown) => boolean;
};

const ApprovalTable: React.FC<ApprovalTableProps> = ({
  kind,
  columns,
  dataSource,
  loading,
  pagination,
  rowSelection,
  onOpenDetail,
  ignoreRowClick,
}) => {
  return (
    <ResizableTable
      columns={columns as Record<string, unknown>}
      dataSource={dataSource}
      rowKey={(r: Record<string, unknown>) => String(r.id)}
      onRow={(record: ApprovalRecord) => {
        return {
          onClick: (e: unknown) => {
            if (ignoreRowClick(e)) return;
            onOpenDetail(kind, record);
          },
        } as Record<string, unknown>;
      }}
      rowSelection={rowSelection}
      loading={loading}
      pagination={pagination}
    />
  );
};

type OrderProfitPanelProps = {
  orderInfo?: OrderProfitOrderInfo | null;
  summary?: OrderProfitSummary | null;
  timeline: OrderProfitTimelinePoint[];
  orderProfitLoading: boolean;
  usingWarehousingQty: boolean;
  calcQty: number;
  materialArrivalRate: number;
  materialArrivedAmount: number;
  materialArrivedQty: number;
  materialPlannedQty: number;
  materialPlannedAmount: number;
  totalCost: number;
  revenue: number;
  incurredCost: number;
  warehousingRevenue: number;
  shipmentRevenue: number;
  shipmentRevenueTotal: number;
  orderTimelineColumns: unknown[];
  orderMaterialColumns: unknown[];
  chartSeries: LineSeries<OrderProfitTimelinePoint>[];
  materials: OrderProfitMaterialItem[];
};

const OrderProfitPanel: React.FC<OrderProfitPanelProps> = ({
  orderInfo,
  summary,
  timeline,
  orderProfitLoading,
  usingWarehousingQty,
  calcQty,
  materialArrivalRate,
  materialArrivedAmount,
  materialArrivedQty,
  materialPlannedQty,
  materialPlannedAmount,
  totalCost,
  revenue,
  incurredCost,
  warehousingRevenue,
  shipmentRevenue,
  shipmentRevenueTotal,
  orderTimelineColumns,
  orderMaterialColumns,
  chartSeries,
  materials,
}) => {
  const { isMobile } = useViewport();
  return (
    <>
      <Card
        size="small"
        className="mb-sm"
        title="订单概览"
        loading={orderProfitLoading}
        extra={
          orderInfo ? (
            <Space wrap>
              {usingWarehousingQty ? <Tag color="green">按入库数量核算</Tag> : <Tag color="orange">按下单数量核算</Tag>}
              {calcQty > 0 ? <Tag>核算数量：{calcQty}</Tag> : null}
            </Space>
          ) : null
        }
      >
        {orderInfo ? (
          <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3, lg: 3 }}>
            <Descriptions.Item label="订单号">{String(orderInfo.orderNo || '').trim() || '-'}</Descriptions.Item>
            <Descriptions.Item label="款号">{String(orderInfo.styleNo || '').trim() || '-'}</Descriptions.Item>
            <Descriptions.Item label="款名">{String(orderInfo.styleName || '').trim() || '-'}</Descriptions.Item>
            <Descriptions.Item label="工厂">{String(orderInfo.factoryName || '').trim() || '-'}</Descriptions.Item>
            <Descriptions.Item label="下单数量">{Number(orderInfo.quantity) || 0}</Descriptions.Item>
            <Descriptions.Item label="生产完成数">{Number(orderInfo.completedQuantity) || 0}</Descriptions.Item>
            <Descriptions.Item label="入库数量">{Number(orderInfo.warehousingQuantity) || 0}</Descriptions.Item>
            <Descriptions.Item label="开发最终单价">{`¥${(summary ? Number(summary.quotationUnitPrice) || 0 : 0).toFixed(2)}`}</Descriptions.Item>
            <Descriptions.Item label="核算数量">{calcQty}</Descriptions.Item>
          </Descriptions>
        ) : (
          <Tag color="default">请输入订单号查询</Tag>
        )}
      </Card>

      <Row gutter={[12, 12]} className="mb-sm">
        <Col xs={24} lg={8}>
          <Card size="small" title="面辅料到料（数量/金额）" loading={orderProfitLoading}>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Statistic title="到料率" value={materialArrivalRate} precision={2} suffix="%" />
              </Col>
              <Col span={12}>
                <Statistic title="到料金额" value={materialArrivedAmount} precision={2} prefix="¥" />
              </Col>
              <Col span={12}>
                <Statistic title="到料数量" value={materialArrivedQty} />
              </Col>
              <Col span={12}>
                <Statistic title="到货成本(累计)" value={summary ? Number(summary.materialArrivedCost) || 0 : 0} precision={2} prefix="¥" />
              </Col>
            </Row>
            <Collapse
              size="small"
              ghost
              items={[
                {
                  key: 'moreMaterial',
                  label: '更多指标',
                  children: (
                    <Row gutter={[16, 16]}>
                      <Col span={12}>
                        <Statistic title="采购数量" value={materialPlannedQty} />
                      </Col>
                      <Col span={12}>
                        <Statistic title="预算金额" value={materialPlannedAmount} precision={2} prefix="¥" />
                      </Col>
                    </Row>
                  ),
                },
              ]}
            />
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card size="small" title="生产（数量/单价/成本）" loading={orderProfitLoading}>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Statistic title="生产完成数" value={orderInfo ? Number(orderInfo.completedQuantity) || 0 : 0} />
              </Col>
              <Col span={12}>
                <Statistic title="入库数量" value={orderInfo ? Number(orderInfo.warehousingQuantity) || 0 : 0} />
              </Col>
              <Col span={12}>
                <Statistic title="总成本" value={totalCost} precision={2} prefix="¥" />
              </Col>
              <Col span={12}>
                <Statistic title="核算成本单价" value={summary ? Number(summary.actualUnitCost) || 0 : 0} precision={2} prefix="¥" />
              </Col>
            </Row>
            <Collapse
              size="small"
              ghost
              items={[
                {
                  key: 'moreProduction',
                  label: '更多指标',
                  children: (
                    <Row gutter={[16, 16]}>
                      <Col span={12}>
                        <Statistic title="生产加工成本" value={summary ? Number(summary.processingCost) || 0 : 0} precision={2} prefix="¥" />
                      </Col>
                      <Col span={12}>
                        <Statistic title="预算面辅料成本" value={summary ? Number(summary.materialPlannedCost) || 0 : 0} precision={2} prefix="¥" />
                      </Col>
                    </Row>
                  ),
                },
              ]}
            />
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card size="small" title="成本利润（核算口径）" loading={orderProfitLoading}>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Statistic title="核算收入" value={revenue} precision={2} prefix="¥" />
              </Col>
              <Col span={12}>
                <Statistic title="已发生成本" value={incurredCost} precision={2} prefix="¥" />
              </Col>
              <Col span={12}>
                <Statistic title="利润" value={summary ? Number(summary.profit) || 0 : 0} precision={2} prefix="¥" />
              </Col>
              <Col span={12}>
                <Statistic title="毛利率" value={summary ? Number(summary.marginPercent) || 0 : 0} precision={2} suffix="%" />
              </Col>
            </Row>
            <Collapse
              size="small"
              ghost
              items={[
                {
                  key: 'moreProfit',
                  label: '更多指标',
                  children: (
                    <Row gutter={[16, 16]}>
                      <Col span={12}>
                        <Statistic title="入库金额" value={warehousingRevenue} precision={2} prefix="¥" />
                      </Col>
                      <Col span={12}>
                        <Statistic title="已回款(paid)" value={shipmentRevenue} precision={2} prefix="¥" />
                      </Col>
                      <Col span={12}>
                        <Statistic title="出货对账(累计)" value={shipmentRevenueTotal} precision={2} prefix="¥" />
                      </Col>
                      <Col span={12}>
                        <Statistic title="预算成本(报价)" value={summary ? Number(summary.quotationTotalCost) || 0 : 0} precision={2} prefix="¥" />
                      </Col>
                      <Col span={12}>
                        <Statistic title="单件利润" value={summary ? Number(summary.unitProfit) || 0 : 0} precision={2} prefix="¥" />
                      </Col>
                    </Row>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Card size="small" className="mb-sm" title="趋势（累计）" loading={orderProfitLoading}>
        <SimpleLineChart points={timeline} series={chartSeries} />
      </Card>

      <Card size="small" className="mb-sm" title="趋势明细" loading={orderProfitLoading}>
        <ResizableTable
          columns={orderTimelineColumns as Record<string, unknown>}
          dataSource={timeline as Record<string, unknown>}
          rowKey="date"
          pagination={false}
          scroll={{ x: 'max-content', y: isMobile ? 260 : 360 }}
        />
      </Card>

      <Card size="small" className="mb-sm" title="面辅料明细（到料数量/单价/金额）" loading={orderProfitLoading}>
        <ResizableTable
          columns={orderMaterialColumns as Record<string, unknown>}
          dataSource={materials as Record<string, unknown>}
          rowKey={(r: Record<string, unknown>) => {
            const id = String(r?.id || '').trim();
            if (id) return id;
            const purchaseNo = String(r?.purchaseNo || '').trim();
            const materialCode = String(r?.materialCode || '').trim();
            const materialName = String(r?.materialName || '').trim();
            const receivedTime = String(r?.receivedTime || '').trim();
            return [purchaseNo, materialCode, materialName, receivedTime].filter(Boolean).join('|') || 'row';
          }}
          pagination={false}
          scroll={{ x: 'max-content', y: isMobile ? 260 : 360 }}
        />
      </Card>
    </>
  );
};

type ApprovalActionItem = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

type ApprovalDetailModalProps = {
  open: boolean;
  kind: ApprovalListKind;
  record: ApprovalRecord | null;
  width: number | string;
  initialHeight: number;
  onClose: () => void;
  buildActionItems: (kind: ApprovalListKind, status: ReconStatus, id: string) => ApprovalActionItem[];
  getPrevStageTime: (status: ReconStatus, record: ApprovalRecord) => string;
  getPaidAtTime: (status: ReconStatus, record: ApprovalRecord) => string;
};

const ApprovalDetailModal: React.FC<ApprovalDetailModalProps> = ({
  open,
  kind,
  record,
  width,
  initialHeight,
  onClose,
  buildActionItems,
  getPrevStageTime,
  getPaidAtTime,
}) => {
  return (
    <ResizableModal
      open={open}
      title={kind === 'material' ? '物料付款详情' : '成品结算付款详情'}
      onCancel={onClose}
      footer={
        <div className="modal-footer-actions">
          <Button onClick={onClose}>关闭</Button>
        </div>
      }
      width={width}
      initialHeight={initialHeight}
      scaleWithViewport
      destroyOnHidden
    >
      {record ? (
        <>
          <Card size="small" className="mb-sm">
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {kind === 'shipment' ? (
                <StyleCoverThumb
                  styleId={(record as ShipmentReconciliation)?.styleId}
                  styleNo={String((record as ShipmentReconciliation)?.styleNo || '').trim() || undefined}
                  size={84}
                  borderRadius={12}
                />
              ) : (
                <div style={{ width: 84, height: 84, borderRadius: 12, background: '#f5f5f5' }} />
              )}

              <div style={{ flex: 1, minWidth: 260 }}>
                <Space wrap style={{ marginBottom: 8 }}>
                  <Tag color="blue">{String((record as Record<string, unknown>)?.reconciliationNo || '').trim() || '-'}</Tag>
                  <Tag>
                    状态：{(() => {
                      const cfg = getStatusConfig((record as Record<string, unknown>)?.status as Record<string, unknown>);
                      return cfg.text;
                    })()}
                  </Tag>
                  <Tag>对账日期：{formatDateTime((record as Record<string, unknown>)?.reconciliationDate)}</Tag>
                </Space>

                <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3, lg: 3 }}>
                  {kind === 'material' ? (
                    <>
                      <Descriptions.Item label="供应商">{String((record as Record<string, unknown>)?.supplierName || '').trim() || '-'}</Descriptions.Item>
                      <Descriptions.Item label="订单号">{String((record as Record<string, unknown>)?.orderNo || '').trim() || '-'}</Descriptions.Item>
                      <Descriptions.Item label="款号">{String((record as Record<string, unknown>)?.styleNo || '').trim() || '-'}</Descriptions.Item>
                      <Descriptions.Item label="采购单号">{String((record as Record<string, unknown>)?.purchaseNo || '').trim() || '-'}</Descriptions.Item>
                      <Descriptions.Item label="物料编码">{String((record as Record<string, unknown>)?.materialCode || '').trim() || '-'}</Descriptions.Item>
                      <Descriptions.Item label="物料名称">{String((record as Record<string, unknown>)?.materialName || '').trim() || '-'}</Descriptions.Item>
                    </>
                  ) : (
                    <>
                      <Descriptions.Item label="客户">{String((record as Record<string, unknown>)?.customerName || '').trim() || '-'}</Descriptions.Item>
                      <Descriptions.Item label="订单号">{String((record as Record<string, unknown>)?.orderNo || '').trim() || '-'}</Descriptions.Item>
                      <Descriptions.Item label="款号">{String((record as Record<string, unknown>)?.styleNo || '').trim() || '-'}</Descriptions.Item>
                      <Descriptions.Item label="数量">{Number((record as Record<string, unknown>)?.quantity ?? 0) || 0}</Descriptions.Item>
                      <Descriptions.Item label="生产完成数">{Number((record as Record<string, unknown>)?.productionCompletedQuantity ?? 0) || 0}</Descriptions.Item>
                    </>
                  )}
                  <Descriptions.Item label="总金额(元)">{formatMoney2((record as Record<string, unknown>)?.totalAmount)}</Descriptions.Item>
                  <Descriptions.Item label="扣款(元)">{formatMoney2((record as Record<string, unknown>)?.deductionAmount)}</Descriptions.Item>
                  <Descriptions.Item label="最终金额(元)">{formatMoney2((record as Record<string, unknown>)?.finalAmount)}</Descriptions.Item>
                  <Descriptions.Item label="上环节时间">{getPrevStageTime((record as Record<string, unknown>)?.status as Record<string, unknown>, record)}</Descriptions.Item>
                  <Descriptions.Item label="付款时间">{getPaidAtTime((record as Record<string, unknown>)?.status as Record<string, unknown>, record)}</Descriptions.Item>
                </Descriptions>
              </div>
            </div>
          </Card>

          <Card size="small" title="审核动作">
            <Space wrap>
              {buildActionItems(
                kind,
                ((record as Record<string, unknown>)?.status || 'pending') as ReconStatus,
                String((record as Record<string, unknown>)?.id || '')
              ).map((a) => {
                return (
                  <Button
                    key={String(a.key)}
                    icon={a.icon}
                    danger={Boolean(a.danger)}
                    disabled={Boolean(a.disabled)}
                    onClick={a.onClick}
                  >
                    {a.label}
                  </Button>
                );
              })}
            </Space>
          </Card>
        </>
      ) : (
        <div style={{ color: '#999' }}>未选择记录</div>
      )}
    </ResizableModal>
  );
};

const PaymentApproval: React.FC = () => {
  const location = useLocation();
  const { user } = useAuth();
  const [tab, setTab] = useState<ApprovalTab>('shipment');

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailKind, setDetailKind] = useState<ApprovalListKind>('shipment');
  const [detailRecord, setDetailRecord] = useState<ApprovalRecord | null>(null);

  const openDetail = (kind: ApprovalListKind, record: ApprovalRecord) => {
    setDetailKind(kind);
    setDetailRecord(record || null);
    setDetailOpen(true);
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setDetailRecord(null);
  };

  const ignoreRowClick = (e: unknown) => {
    const el = e?.target as HTMLElement | null;
    if (!el) return false;
    return Boolean(
      el.closest('button,a,.ant-checkbox-wrapper,.ant-checkbox,.table-actions,.ant-dropdown,.ant-select,.ant-input,.ant-picker')
    );
  };

  const { modalWidth } = useViewport();
  const detailModalWidth = modalWidth;
  const detailModalInitialHeight = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800;

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [selectedRows, setSelectedRows] = useState<ApprovalRecord[]>([]);
  const [batchLoading, setBatchLoading] = useState<ReconStatus | null>(null);

  const handleSelectionChange = (keys: React.Key[], rows: ApprovalRecord[]) => {
    setSelectedRowKeys(keys);
    setSelectedRows(rows);
  };

  const [materialList, setMaterialList] = useState<MaterialReconciliation[]>([]);
  const [materialTotal, setMaterialTotal] = useState(0);
  const [materialLoading, setMaterialLoading] = useState(false);
  const [materialQuery, setMaterialQuery] = useState<MaterialReconQueryParams>({ page: 1, pageSize: 10, status: 'pending' });

  const [shipmentList, setShipmentList] = useState<ShipmentReconciliation[]>([]);
  const [shipmentTotal, setShipmentTotal] = useState(0);
  const [shipmentLoading, setShipmentLoading] = useState(false);
  const [shipmentQuery, setShipmentQuery] = useState<ShipmentReconQueryParams>({ page: 1, pageSize: 10, status: 'pending' });

  const [orderProfitOrderNo, setOrderProfitOrderNo] = useState<string>('');
  const [orderProfitLoading, setOrderProfitLoading] = useState(false);
  const [orderProfitData, setOrderProfitData] = useState<OrderProfitResponse | null>(null);
  const [modalApi, modalContextHolder] = Modal.useModal();

  const isAdmin = useMemo(() => isAdminUser(user), [user]);

  const buildActionItems = (kind: ApprovalListKind, status: ReconStatus, id: string) => {
    return [
      {
        key: 'verified',
        label: '验证',
        icon: getActionIcon('verified'),
        disabled: !id || !canTransition(status, 'verified'),
        onClick: () => updateStatus(kind, id, 'verified'),
      },
      {
        key: 'approved',
        label: '批准',
        icon: getActionIcon('approved'),
        disabled: !id || !canTransition(status, 'approved'),
        onClick: () => updateStatus(kind, id, 'approved'),
      },
      {
        key: 'paid',
        label: '付款',
        icon: getActionIcon('paid'),
        disabled: !id || !canTransition(status, 'paid'),
        onClick: () => updateStatus(kind, id, 'paid'),
      },
      {
        key: 'reReview',
        label: '重审',
        icon: getActionIcon('reReview'),
        disabled: !isAdmin || !id || status !== 'paid',
        onClick: () => openReReviewModal(kind, id),
      },
      {
        key: 'rejected',
        label: '驳回',
        icon: getActionIcon('rejected'),
        danger: true,
        disabled: !id || !canTransition(status, 'rejected'),
        onClick: () => updateStatus(kind, id, 'rejected'),
      },
      {
        key: 'return',
        label: '退回',
        icon: getActionIcon('return'),
        disabled: !id || status === 'pending' || status === 'rejected' || status === 'paid',
        onClick: () => openReturnModal(kind, id),
      },
    ];
  };

  const getPrevStageTime = (status: ReconStatus, record: any) => {
    if (!record) return '-';
    if (status === 'approved') return formatDateTime((record as Record<string, unknown>).verifiedAt) || formatDateTime((record as Record<string, unknown>).updateTime) || '-';
    if (status === 'paid') return formatDateTime((record as Record<string, unknown>).approvedAt) || formatDateTime((record as Record<string, unknown>).updateTime) || '-';
    if (status === 'rejected') {
      return (
        formatDateTime((record as Record<string, unknown>).approvedAt) ||
        formatDateTime((record as Record<string, unknown>).verifiedAt) ||
        formatDateTime((record as Record<string, unknown>).updateTime) ||
        '-'
      );
    }
    if (status === 'verified') return formatDateTime((record as Record<string, unknown>).createTime) || formatDateTime((record as Record<string, unknown>).reconciliationDate || (record as Record<string, unknown>).settlementDate) || '-';
    return '-';
  };

  const getPaidAtTime = (status: ReconStatus, record: any) => {
    if (status !== 'paid') return '-';
    return formatDateTime((record as Record<string, unknown>).paidAt) || formatDateTime((record as Record<string, unknown>).updateTime) || '-';
  };

  useEffect(() => {
    const desired = (location.state as Record<string, unknown>)?.defaultTab;
    if (desired === 'material' || desired === 'shipment' || desired === 'orderProfit') setTab(desired);
    else if (desired === 'factory') setTab('material');
  }, [location.state]);

  useEffect(() => {
    setSelectedRowKeys([]);
    setSelectedRows([]);
  }, [tab]);

  useEffect(() => {
    const desiredTab = (location.state as Record<string, unknown>)?.defaultTab;
    const desiredStatusRaw = (location.state as Record<string, unknown>)?.defaultStatus;
    const desiredStatus = String(desiredStatusRaw || '').trim();
    const allowed: ReconStatus[] = ['pending', 'verified', 'approved', 'paid', 'rejected'];
    if (!allowed.includes(desiredStatus as Record<string, unknown>)) return;
    if (desiredTab === 'material') {
      setMaterialQuery((prev) => ({ ...prev, status: desiredStatus, page: 1 }));
    } else if (desiredTab === 'shipment') {
      setShipmentQuery((prev) => ({ ...prev, status: desiredStatus, page: 1 }));
    }
  }, [location.state]);

  const fetchMaterialApprovals = async () => {
    setMaterialLoading(true);
    try {
      const res = await api.get<{ code: number; message: string; data: { records: MaterialReconciliation[]; total: number } }>('/finance/material-reconciliation/list', { params: materialQuery });
      if (res.code === 200) {
        setMaterialList(toArray<MaterialReconciliation>(res.data?.records));
        setMaterialTotal(Number(res.data?.total || 0));
      } else {
        message.error(res.message || '获取物料审批付款列表失败');
      }
    } catch (e: unknown) {
      message.error(e?.message || '获取物料审批付款列表失败');
    } finally {
      setMaterialLoading(false);
    }
  };

  const fetchShipmentApprovals = async () => {
    setShipmentLoading(true);
    try {
      const res = await api.get<{ code: number; message: string; data: { records: ShipmentReconciliation[]; total: number } }>('/finance/shipment-reconciliation/list', { params: shipmentQuery });
      if (res.code === 200) {
        setShipmentList(toArray<ShipmentReconciliation>(res.data?.records));
        setShipmentTotal(Number(res.data?.total || 0));
      } else {
        message.error(res.message || '获取出货审批付款列表失败');
      }
    } catch (e: unknown) {
      message.error(e?.message || '获取出货审批付款列表失败');
    } finally {
      setShipmentLoading(false);
    }
  };

  const fetchOrderProfit = async () => {
    const orderNo = String(orderProfitOrderNo || '').trim();
    if (!orderNo) {
      message.error('请输入订单号');
      return;
    }
    setOrderProfitLoading(true);
    try {
      const res = await api.get<{ code: number; message: string; data: Record<string, unknown> | null }>('/finance/reconciliation/order-profit', {
        params: {
          orderNo,
        },
      });
      if (res.code === 200) {
        setOrderProfitData((res.data || null) as Record<string, unknown>);
      } else {
        message.error(res.message || '获取订单盈利失败');
      }
    } catch (e: unknown) {
      message.error(e?.message || '获取订单盈利失败');
    } finally {
      setOrderProfitLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'material') fetchMaterialApprovals();
  }, [tab, materialQuery]);

  // 实时同步：物料审批付款列表（45秒轮询）
  useSync(
    'material-approval-list',
    async () => {
      try {
        const res = await api.get<{ code: number; data: { records: MaterialReconciliation[]; total: number } }>('/finance/material-reconciliation/list', { params: materialQuery });
        if (res.code === 200) {
          return {
            records: toArray<MaterialReconciliation>(res.data?.records),
            total: Number(res.data?.total || 0)
          };
        }
        return null;
      } catch (error) {
        console.error('[实时同步] 获取物料审批列表失败', error);
        return null;
      }
    },
    (newData, oldData) => {
      if (oldData !== null && newData) {
        setMaterialList(newData.records);
        setMaterialTotal(newData.total);
        // // console.log('[实时同步] 物料审批数据已更新', { oldCount: oldData.records.length, newCount: newData.records.length });
      }
    },
    {
      interval: 45000,
      enabled: !materialLoading && tab === 'material' && !detailOpen,
      pauseOnHidden: true,
      onError: (error) => console.error('[实时同步] 物料审批同步错误', error)
    }
  );

  useEffect(() => {
    if (tab === 'shipment') fetchShipmentApprovals();
  }, [tab, shipmentQuery]);

  // 实时同步：出货审批付款列表（45秒轮询）
  useSync(
    'shipment-approval-list',
    async () => {
      try {
        const res = await api.get<{ code: number; data: { records: ShipmentReconciliation[]; total: number } }>('/finance/shipment-reconciliation/list', { params: shipmentQuery });
        if (res.code === 200) {
          return {
            records: toArray<ShipmentReconciliation>(res.data?.records),
            total: Number(res.data?.total || 0)
          };
        }
        return null;
      } catch (error) {
        console.error('[实时同步] 获取出货审批列表失败', error);
        return null;
      }
    },
    (newData, oldData) => {
      if (oldData !== null && newData) {
        setShipmentList(newData.records);
        setShipmentTotal(newData.total);
        // // console.log('[实时同步] 出货审批数据已更新', { oldCount: oldData.records.length, newCount: newData.records.length });
      }
    },
    {
      interval: 45000,
      enabled: !shipmentLoading && tab === 'shipment' && !detailOpen,
      pauseOnHidden: true,
      onError: (error) => console.error('[实时同步] 出货审批同步错误', error)
    }
  );

  useEffect(() => {
    if (tab !== 'orderProfit') return;
    const orderNo = String(orderProfitOrderNo || '').trim();
    if (!orderNo) return;
    fetchOrderProfit();
  }, [tab]);

  const updateStatus = async (kind: ApprovalTab, id: string, status: ReconStatus) => {
    try {
      const res = await updateFinanceReconciliationStatus(id, status);
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        message.success('操作成功');
        if (detailOpen && detailRecord && String((detailRecord as Record<string, unknown>)?.id || '') === String(id || '')) {
          setDetailRecord((prev: any | null) => {
            if (!prev) return prev;
            if (String((prev as Record<string, unknown>)?.id || '') !== String(id || '')) return prev;
            return { ...(prev as Record<string, unknown>), status };
          });
        }
        if (kind === 'material') fetchMaterialApprovals();
        else fetchShipmentApprovals();
      } else {
        message.error(result.message || '操作失败');
      }
    } catch (e: unknown) {
      message.error(e?.message || '操作失败');
    }
  };

  const getBatchStatusLabel = (status: ReconStatus) => {
    if (status === 'verified') return '验证';
    if (status === 'approved') return '审核';
    if (status === 'paid') return '付款';
    return status;
  };

  const batchUpdateStatus = async (targetStatus: ReconStatus) => {
    if (!selectedRowKeys.length) {
      message.error('请先勾选需要操作的记录');
      return;
    }

    if (targetStatus !== 'verified' && targetStatus !== 'approved' && targetStatus !== 'paid') {
      message.error('不支持的批量操作');
      return;
    }

    const label = getBatchStatusLabel(targetStatus);
    const rowsById = new Map<string, unknown>(selectedRows.map((r) => [String((r as Record<string, unknown>)?.id || ''), r]));
    const keys = selectedRowKeys.map((k) => String(k));

    modalApi.confirm({
      title: `一键${label}`,
      content: `确认对已选 ${keys.length} 条记录执行“${label}”吗？`,
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        setBatchLoading(targetStatus);

        let okCount = 0;
        let failCount = 0;
        let skippedCount = 0;

        const tasks = keys.map(async (id) => {
          const row = rowsById.get(id);
          const fromStatus = (row?.status || '') as ReconStatus;

          if (row && !canTransition(fromStatus, targetStatus)) {
            skippedCount += 1;
            return;
          }

          try {
            const res = await updateFinanceReconciliationStatus(id, targetStatus);
            const result = res as Record<string, unknown>;
            if (result.code === 200) {
              okCount += 1;
            } else {
              failCount += 1;
            }
          } catch {
    // Intentionally empty
      // 忽略错误
            failCount += 1;
          }
        });

        await Promise.all(tasks);

        setBatchLoading(null);
        setSelectedRowKeys([]);
        setSelectedRows([]);

        if (tab === 'material') fetchMaterialApprovals();
        else if (tab === 'shipment') fetchShipmentApprovals();

        if (!okCount && !failCount && skippedCount) {
          message.warning(`无可操作记录（已跳过 ${skippedCount} 条）`);
          return;
        }

        const parts = [`成功 ${okCount} 条`];
        if (skippedCount) parts.push(`跳过 ${skippedCount} 条`);
        if (failCount) parts.push(`失败 ${failCount} 条`);
        message.success(`批量${label}完成：${parts.join('，')}`);
      },
    });
  };

  const returnToPrevious = async (kind: ApprovalTab, id: string, reason: string) => {
    try {
      const res = await returnFinanceReconciliation(id, reason);
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        message.success('退回成功');
        if (kind === 'material') fetchMaterialApprovals();
        else fetchShipmentApprovals();
      } else {
        message.error(result.message || '退回失败');
      }
    } catch (e: unknown) {
      message.error(e?.message || '退回失败');
    }
  };

  const openReturnModal = (kind: ApprovalTab, id: string) => {
    let reasonValue = '';
    modalApi.confirm({
      title: '退回',
      content: (
        <Form layout="vertical" onSubmitCapture={(e) => e.preventDefault()}>
          <Form.Item label="退回原因">
            <Input.TextArea rows={4} onChange={(e) => {
              reasonValue = e.target.value;
            }} />
          </Form.Item>
        </Form>
      ),
      okText: '确认退回',
      cancelText: '取消',
      onOk: async () => {
        const reason = String(reasonValue || '').trim();
        if (!reason) {
          message.error('请输入退回原因');
          throw new Error('missing reason');
        }
        await returnToPrevious(kind, id, reason);
      },
    });
  };

  const openReReviewModal = (kind: ApprovalTab, id: string) => {
    let reasonValue = '';
    modalApi.confirm({
      title: '重审',
      content: (
        <Form layout="vertical" onSubmitCapture={(e) => e.preventDefault()}>
          <Form.Item label="重审原因">
            <Input.TextArea rows={4} onChange={(e) => {
              reasonValue = e.target.value;
            }} />
          </Form.Item>
        </Form>
      ),
      okText: '确认重审',
      cancelText: '取消',
      onOk: async () => {
        const reason = String(reasonValue || '').trim();
        if (!reason) {
          message.error('请输入重审原因');
          throw new Error('missing reason');
        }
        await reReview(kind, id, reason);
      },
    });
  };

  const reReview = async (kind: ApprovalTab, id: string, reason: string) => {
    if (!isAdmin) {
      message.error('只有管理员可以重审');
      return;
    }

    if (!String(reason || '').trim()) {
      message.error('请输入重审原因');
      return;
    }

    try {
      const res = await api.post<{ code: number; message: string }>('/finance/reconciliation/return', { id, reason });
      if (res.code === 200) {
        message.success('已重审');
        if (kind === 'material') fetchMaterialApprovals();
        else fetchShipmentApprovals();
      } else {
        message.error(res.message || '重审失败');
      }
    } catch (e: unknown) {
      message.error(e?.message || '重审失败');
    }
  };

  const materialColumns = useMemo(() => {
    return [
      {
        title: '对账单号',
        dataIndex: 'reconciliationNo',
        key: 'reconciliationNo',
        width: 140,
      },
      {
        title: '供应商',
        dataIndex: 'supplierName',
        key: 'supplierName',
        width: 180,
      },
      {
        title: '订单号',
        dataIndex: 'orderNo',
        key: 'orderNo',
        width: 140,
        render: (v: unknown) => String(v || '').trim() || '-',
      },
      {
        title: '款号',
        dataIndex: 'styleNo',
        key: 'styleNo',
        width: 110,
        render: (v: unknown) => String(v || '').trim() || '-',
      },
      {
        title: '采购单号',
        dataIndex: 'purchaseNo',
        key: 'purchaseNo',
        width: 140,
      },
      {
        title: '物料编码',
        dataIndex: 'materialCode',
        key: 'materialCode',
        width: 120,
      },
      {
        title: '物料名称',
        dataIndex: 'materialName',
        key: 'materialName',
        ellipsis: true,
      },
      {
        title: '数量',
        dataIndex: 'quantity',
        key: 'quantity',
        width: 80,
        align: 'right' as const,
      },
      {
        title: '生产完成数',
        dataIndex: 'productionCompletedQuantity',
        key: 'productionCompletedQuantity',
        width: 110,
        align: 'right' as const,
        render: (v: unknown) => {
          const n = typeof v === 'number' ? v : Number(v);
          return Number.isFinite(n) ? n : '-';
        },
      },
      {
        title: '最终金额(元)',
        dataIndex: 'finalAmount',
        key: 'finalAmount',
        width: 130,
        align: 'right' as const,
        render: (v: unknown) => {
          const n = typeof v === 'number' ? v : Number(v);
          return Number.isFinite(n) ? n.toFixed(2) : '-';
        },
      },
      {
        title: '对账日期',
        dataIndex: 'reconciliationDate',
        key: 'reconciliationDate',
        width: 140,
        render: (v: unknown) => formatDateTime(v),
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 110,
        render: (status: ReconStatus) => {
          const { text, color } = getStatusConfig(status);
          return <Tag color={color}>{text}</Tag>;
        },
      },
      {
        title: '上环节时间',
        key: 'prevStageTime',
        width: 160,
        render: (_: any, record: MaterialReconciliation) => {
          const status = record.status as ReconStatus;
          const id = String(record.id || '');
          if (!id) return '-';
          return getPrevStageTime(status, record);
        },
      },
      {
        title: '付款时间',
        key: 'paidAt',
        width: 160,
        render: (_: any, record: MaterialReconciliation) => {
          const status = record.status as ReconStatus;
          return getPaidAtTime(status, record);
        },
      },
      {
        title: '重审时间',
        key: 'reReviewAt',
        width: 160,
        render: (_: any, record: MaterialReconciliation) => formatDateTime((record as Record<string, unknown>).reReviewAt) || '-',
      },
      {
        title: '重审原因',
        key: 'reReviewReason',
        width: 180,
        render: (_: any, record: MaterialReconciliation) => String((record as Record<string, unknown>).reReviewReason || '').trim() || '-',
      },
      {
        title: '操作',
        key: 'action',
        width: 110,
        fixed: 'right' as const,
        render: (_: any, record: MaterialReconciliation) => {
          const status = record.status as ReconStatus;
          const id = String(record.id || '');
          const items = buildActionItems('material', status, id);
          return <RowActions actions={[{ key: 'more', label: '更多', children: items as Record<string, unknown> }]} maxInline={0} />;
        },
      },
    ];
  }, [isAdmin, modalApi]);

  const shipmentColumns = useMemo(() => {
    return [
      {
        title: '图片',
        key: 'cover',
        width: 72,
        render: (_: any, record: ShipmentReconciliation) => <StyleCoverThumb styleId={record.styleId} styleNo={record.styleNo} size={40} borderRadius={6} />,
      },
      {
        title: '对账单号',
        dataIndex: 'reconciliationNo',
        key: 'reconciliationNo',
        width: 140,
      },
      {
        title: '客户',
        dataIndex: 'customerName',
        key: 'customerName',
        width: 180,
      },
      {
        title: '订单号',
        dataIndex: 'orderNo',
        key: 'orderNo',
        width: 140,
      },
      {
        title: '款号',
        dataIndex: 'styleNo',
        key: 'styleNo',
        width: 110,
      },
      {
        title: '数量',
        dataIndex: 'quantity',
        key: 'quantity',
        width: 80,
        align: 'right' as const,
      },
      {
        title: '生产完成数',
        dataIndex: 'productionCompletedQuantity',
        key: 'productionCompletedQuantity',
        width: 110,
        align: 'right' as const,
        render: (v: unknown) => {
          const n = typeof v === 'number' ? v : Number(v);
          return Number.isFinite(n) ? n : '-';
        },
      },
      {
        title: '最终金额(元)',
        dataIndex: 'finalAmount',
        key: 'finalAmount',
        width: 130,
        align: 'right' as const,
        render: (v: unknown) => {
          const n = typeof v === 'number' ? v : Number(v);
          return Number.isFinite(n) ? n.toFixed(2) : '-';
        },
      },
      {
        title: '对账日期',
        dataIndex: 'reconciliationDate',
        key: 'reconciliationDate',
        width: 140,
        render: (v: unknown) => formatDateTime(v),
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 110,
        render: (status: ReconStatus) => {
          const { text, color } = getStatusConfig(status);
          return <Tag color={color}>{text}</Tag>;
        },
      },
      {
        title: '上环节时间',
        key: 'prevStageTime',
        width: 160,
        render: (_: any, record: ShipmentReconciliation) => {
          const status = record.status as ReconStatus;
          const id = String(record.id || '');
          if (!id) return '-';
          return getPrevStageTime(status, record);
        },
      },
      {
        title: '付款时间',
        key: 'paidAt',
        width: 160,
        render: (_: any, record: ShipmentReconciliation) => {
          const status = record.status as ReconStatus;
          return getPaidAtTime(status, record);
        },
      },
      {
        title: '重审时间',
        key: 'reReviewAt',
        width: 160,
        render: (_: any, record: ShipmentReconciliation) => formatDateTime((record as Record<string, unknown>).reReviewAt) || '-',
      },
      {
        title: '重审原因',
        key: 'reReviewReason',
        width: 180,
        render: (_: any, record: ShipmentReconciliation) => String((record as Record<string, unknown>).reReviewReason || '').trim() || '-',
      },
      {
        title: '操作',
        key: 'action',
        width: 110,
        fixed: 'right' as const,
        render: (_: any, record: ShipmentReconciliation) => {
          const status = record.status as ReconStatus;
          const id = String(record.id || '');
          const items = buildActionItems('shipment', status, id);
          return <RowActions actions={[{ key: 'more', label: '更多', children: items as Record<string, unknown> }]} maxInline={0} />;
        },
      },
    ];
  }, [isAdmin, modalApi]);

  const orderMaterialColumns = useMemo(() => {
    return [
      {
        title: '采购单号',
        dataIndex: 'purchaseNo',
        key: 'purchaseNo',
        width: 140,
        render: (v: unknown) => String(v || '').trim() || '-',
      },
      {
        title: '类型',
        dataIndex: 'materialType',
        key: 'materialType',
        width: 110,
        render: (v: unknown) => String(v || '').trim() || '-',
      },
      {
        title: '物料编码',
        dataIndex: 'materialCode',
        key: 'materialCode',
        width: 120,
        render: (v: unknown) => String(v || '').trim() || '-',
      },
      {
        title: '物料名称',
        dataIndex: 'materialName',
        key: 'materialName',
        width: 200,
        ellipsis: true,
        render: (v: unknown) => String(v || '').trim() || '-',
      },
      {
        title: '规格',
        dataIndex: 'specifications',
        key: 'specifications',
        width: 160,
        ellipsis: true,
        render: (v: unknown) => String(v || '').trim() || '-',
      },
      {
        title: '单位',
        dataIndex: 'unit',
        key: 'unit',
        width: 70,
        render: (v: unknown) => String(v || '').trim() || '-',
      },
      {
        title: '采购数',
        dataIndex: 'purchaseQuantity',
        key: 'purchaseQuantity',
        width: 90,
        align: 'right' as const,
        render: (v: unknown) => Number(v) || 0,
      },
      {
        title: '到货数',
        dataIndex: 'arrivedQuantity',
        key: 'arrivedQuantity',
        width: 90,
        align: 'right' as const,
        render: (v: unknown) => Number(v) || 0,
      },
      {
        title: '单价(元)',
        dataIndex: 'unitPrice',
        key: 'unitPrice',
        width: 100,
        align: 'right' as const,
        render: (v: unknown) => formatMoney2(v),
      },
      {
        title: '金额(元)',
        key: 'amount',
        width: 110,
        align: 'right' as const,
        render: (_: any, r: OrderProfitMaterialItem) => {
          const qty = Number((r as Record<string, unknown>)?.arrivedQuantity ?? 0);
          const price = Number((r as Record<string, unknown>)?.unitPrice);
          if (Number.isFinite(qty) && Number.isFinite(price)) return (qty * price).toFixed(2);
          const v = Number((r as Record<string, unknown>)?.totalAmount);
          return Number.isFinite(v) ? v.toFixed(2) : '-';
        },
      },
      {
        title: '供应商',
        dataIndex: 'supplierName',
        key: 'supplierName',
        width: 160,
        ellipsis: true,
        render: (v: unknown) => String(v || '').trim() || '-',
      },
      {
        title: '领料时间',
        dataIndex: 'receivedTime',
        key: 'receivedTime',
        width: 160,
        render: (v: unknown) => formatDateTime(v) || '-',
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 100,
        render: (v: unknown) => {
          const { text, color } = getMaterialPurchaseStatusConfig(String(v || '').trim() || undefined);
          return <Tag color={color}>{text}</Tag>;
        },
      },
    ];
  }, []);

  const orderTimelineColumns = useMemo(() => {
    return [
      { title: '日期', dataIndex: 'date', key: 'date', width: 110 },
      {
        title: '物料到货成本(元)',
        dataIndex: 'materialArrivedCost',
        key: 'materialArrivedCost',
        width: 140,
        align: 'right' as const,
        render: (v: unknown) => formatMoney2(v),
      },
      {
        title: '加工成本(元)',
        dataIndex: 'processingCost',
        key: 'processingCost',
        width: 120,
        align: 'right' as const,
        render: (v: unknown) => formatMoney2(v),
      },
      {
        title: '核算收入(元)',
        dataIndex: 'revenue',
        key: 'revenue',
        width: 110,
        align: 'right' as const,
        render: (v: unknown) => formatMoney2(v),
      },
      {
        title: '累计成本(元)',
        key: 'cumCost',
        width: 130,
        align: 'right' as const,
        render: (_: any, r: OrderProfitTimelinePoint) => {
          const a = Number((r as Record<string, unknown>)?.cumMaterialArrivedCost ?? 0) || 0;
          const b = Number((r as Record<string, unknown>)?.cumProcessingCost ?? 0) || 0;
          return (a + b).toFixed(2);
        },
      },
      {
        title: '累计核算收入(元)',
        dataIndex: 'cumRevenue',
        key: 'cumRevenue',
        width: 130,
        align: 'right' as const,
        render: (v: unknown) => formatMoney2(v),
      },
      {
        title: '累计利润(元)',
        dataIndex: 'cumProfit',
        key: 'cumProfit',
        width: 130,
        align: 'right' as const,
        render: (v: unknown) => formatMoney2(v),
      },
    ];
  }, []);

  const materialExtraFilters = (
    <Card size="small" className="filter-card mb-sm">
      <Form layout="inline" size="small" onSubmitCapture={(e) => e.preventDefault()}>
        <Form.Item label="对账单号">
          <Input
            placeholder="请输入对账单号"
            onChange={(e) => setMaterialQuery((prev) => ({ ...prev, reconciliationNo: e.target.value, page: 1 }))}
            style={{ width: 160 }}
            allowClear
          />
        </Form.Item>
        <Form.Item label="供应商">
          <Input
            placeholder="请输入供应商"
            onChange={(e) => setMaterialQuery((prev) => ({ ...prev, supplierName: e.target.value, page: 1 }))}
            style={{ width: 160 }}
            allowClear
          />
        </Form.Item>
        <Form.Item label="物料编码">
          <Input
            placeholder="请输入物料编码"
            onChange={(e) => setMaterialQuery((prev) => ({ ...prev, materialCode: e.target.value, page: 1 }))}
            style={{ width: 160 }}
            allowClear
          />
        </Form.Item>
        <Form.Item label="状态">
          <Select
            value={materialQuery.status || ''}
            style={{ width: 140 }}
            onChange={(v) => setMaterialQuery((prev) => ({ ...prev, status: v || undefined, page: 1 }))}
          >
            <Option value="">全部</Option>
            <Option value="pending">待审核</Option>
            <Option value="verified">已验证</Option>
            <Option value="approved">已批准</Option>
            <Option value="paid">已付款</Option>
            <Option value="rejected">已拒绝</Option>
          </Select>
        </Form.Item>
        <Form.Item className="filter-actions">
          <Space>
            <Button type="primary" onClick={fetchMaterialApprovals} loading={materialLoading}>
              刷新
            </Button>
            <Button
              onClick={() =>
                setMaterialQuery({
                  page: 1,
                  pageSize: 10,
                  status: 'pending',
                })
              }
            >
              重置
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );

  const shipmentExtraFilters = (
    <Card size="small" className="filter-card mb-sm">
      <Form layout="inline" size="small" onSubmitCapture={(e) => e.preventDefault()}>
        <Form.Item label="结算单号">
          <Input
            placeholder="请输入结算单号"
            onChange={(e) => setShipmentQuery((prev) => ({ ...prev, settlementNo: e.target.value, page: 1 }))}
            style={{ width: 160 }}
            allowClear
          />
        </Form.Item>
        <Form.Item label="人员">
          <Input
            placeholder="请输入人员"
            onChange={(e) => setShipmentQuery((prev) => ({ ...prev, workerName: e.target.value, page: 1 }))}
            style={{ width: 140 }}
            allowClear
          />
        </Form.Item>
        <Form.Item label="款号">
          <Input
            placeholder="请输入款号"
            onChange={(e) => setShipmentQuery((prev) => ({ ...prev, styleNo: e.target.value, page: 1 }))}
            style={{ width: 140 }}
            allowClear
          />
        </Form.Item>
        <Form.Item label="状态">
          <Select value={shipmentQuery.status || ''} style={{ width: 140 }} onChange={(v) => setShipmentQuery((prev) => ({ ...prev, status: v || undefined, page: 1 }))}>
            <Option value="">全部</Option>
            <Option value="pending">待审核</Option>
            <Option value="verified">已验证</Option>
            <Option value="approved">已批准</Option>
            <Option value="paid">已付款</Option>
            <Option value="rejected">已拒绝</Option>
          </Select>
        </Form.Item>
        <Form.Item className="filter-actions">
          <Space>
            <Button type="primary" onClick={fetchShipmentApprovals} loading={shipmentLoading}>
              刷新
            </Button>
            <Button
              onClick={() =>
                setShipmentQuery({
                  page: 1,
                  pageSize: 10,
                  status: 'pending',
                })
              }
            >
              重置
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );

  const orderProfitExtraFilters = (
    <Card size="small" className="filter-card mb-sm">
      <Form layout="inline" size="small" onSubmitCapture={(e) => e.preventDefault()}>
        <Form.Item label="订单号">
          <Input
            placeholder="请输入订单号"
            value={orderProfitOrderNo}
            onChange={(e) => setOrderProfitOrderNo(e.target.value)}
            style={{ width: 180 }}
            allowClear
          />
        </Form.Item>
        <Form.Item className="filter-actions">
          <Space>
            <Button type="primary" onClick={fetchOrderProfit} loading={orderProfitLoading}>
              查询
            </Button>
            <Button
              onClick={() => {
                setOrderProfitOrderNo('');
                setOrderProfitData(null);
              }}
            >
              重置
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );

  const headerActions = tab === 'orderProfit' ? null : (
    <Space>
      <Tag color={selectedRowKeys.length ? 'blue' : 'default'}>已选 {selectedRowKeys.length} 条</Tag>
      <Button
        icon={<CheckOutlined />}
        onClick={() => batchUpdateStatus('verified')}
        disabled={!selectedRowKeys.length}
        loading={batchLoading === 'verified'}
      >
        一键验证
      </Button>
      <Button
        icon={<SafetyCertificateOutlined />}
        onClick={() => batchUpdateStatus('approved')}
        disabled={!selectedRowKeys.length}
        loading={batchLoading === 'approved'}
      >
        一键审核
      </Button>
      <Button
        type="primary"
        icon={<DollarOutlined />}
        onClick={() => batchUpdateStatus('paid')}
        disabled={!selectedRowKeys.length}
        loading={batchLoading === 'paid'}
      >
        一键付款
      </Button>
    </Space>
  );

  const summary = orderProfitData?.summary;
  const orderInfo = orderProfitData?.order;
  const timeline = orderProfitData?.timeline || [];
  const calcBasis = String((summary as Record<string, unknown>)?.calcBasis || '').trim();
  const calcQty = summary ? Number((summary as Record<string, unknown>)?.calcQty) || 0 : 0;
  const usingWarehousingQty = calcBasis === 'warehousing' || Number((orderInfo as Record<string, unknown>)?.warehousingQuantity) > 0;
  const revenue = summary ? Number((summary as Record<string, unknown>).revenue) || 0 : 0;
  const warehousingRevenue = summary ? Number((summary as Record<string, unknown>).warehousingRevenue) || 0 : 0;
  const shipmentRevenue = summary ? Number((summary as Record<string, unknown>).shipmentRevenue) || 0 : 0;
  const shipmentRevenueTotal = summary ? Number((summary as Record<string, unknown>).shipmentRevenueTotal) || 0 : 0;
  const incurredCost = summary ? Number((summary as Record<string, unknown>).incurredCost) || 0 : 0;

  const materialPlannedQty = summary ? Number((summary as Record<string, unknown>)?.materialPlannedQty) || 0 : 0;
  const materialArrivedQty = summary ? Number((summary as Record<string, unknown>)?.materialArrivedQty) || 0 : 0;
  const materialPlannedAmount = summary ? Number((summary as Record<string, unknown>)?.materialPlannedCost) || 0 : 0;
  const materialArrivedAmount = summary ? Number((summary as Record<string, unknown>)?.materialArrivedCost) || 0 : 0;
  const materialArrivalRate = summary ? Number((summary as Record<string, unknown>)?.materialArrivalRate) || 0 : 0;

  const totalCost = summary ? (Number(summary.materialPlannedCost) || 0) + (Number(summary.processingCost) || 0) : 0;
  const chartSeries = useMemo(() => {
    const costSeries: LineSeries<OrderProfitTimelinePoint> = {
      key: 'cost',
      name: '累计成本',
      color: '#ff4d4f',
      getY: (p) => (Number(p.cumMaterialArrivedCost) || 0) + (Number(p.cumProcessingCost) || 0),
    };
    const revSeries: LineSeries<OrderProfitTimelinePoint> = {
      key: 'revenue',
      name: '累计核算收入',
      color: '#1677ff',
      getY: (p) => Number(p.cumRevenue) || 0,
    };
    const profitSeries: LineSeries<OrderProfitTimelinePoint> = {
      key: 'profit',
      name: '累计利润',
      color: '#52c41a',
      getY: (p) => Number(p.cumProfit) || 0,
    };
    return [revSeries, costSeries, profitSeries];
  }, [timeline]);

  return (
    <Layout>
      {modalContextHolder}
      <div>
        <Card className="page-card">
          <div className="page-header">
            <h2 className="page-title">审批付款</h2>
            {headerActions}
          </div>

          <Tabs
            activeKey={tab}
            onChange={(k) => setTab(k as ApprovalTab)}
            items={[
              { key: 'material', label: '物料付款' },
              { key: 'shipment', label: '成品结算付款' },
              { key: 'orderProfit', label: '订单成本与盈利' },
            ]}
          />

          {tab === 'material' ? materialExtraFilters : tab === 'shipment' ? shipmentExtraFilters : orderProfitExtraFilters}

          {tab === 'material' ? (
            <ApprovalTable
              kind="material"
              columns={materialColumns as Record<string, unknown>}
              dataSource={materialList}
              onOpenDetail={openDetail}
              ignoreRowClick={ignoreRowClick}
              rowSelection={{ selectedRowKeys, onChange: handleSelectionChange }}
              loading={materialLoading}
              pagination={{
                current: materialQuery.page,
                pageSize: materialQuery.pageSize,
                total: materialTotal,
                onChange: (page, pageSize) => setMaterialQuery((prev) => ({ ...prev, page, pageSize })),
              }}
            />
          ) : tab === 'shipment' ? (
            <ApprovalTable
              kind="shipment"
              columns={shipmentColumns as Record<string, unknown>}
              dataSource={shipmentList}
              onOpenDetail={openDetail}
              ignoreRowClick={ignoreRowClick}
              rowSelection={{ selectedRowKeys, onChange: handleSelectionChange }}
              loading={shipmentLoading}
              pagination={{
                current: shipmentQuery.page,
                pageSize: shipmentQuery.pageSize,
                total: shipmentTotal,
                onChange: (page, pageSize) => setShipmentQuery((prev) => ({ ...prev, page, pageSize })),
              }}
            />
          ) : (
            <OrderProfitPanel
              orderInfo={orderInfo}
              summary={summary}
              timeline={timeline}
              orderProfitLoading={orderProfitLoading}
              usingWarehousingQty={usingWarehousingQty}
              calcQty={calcQty}
              materialArrivalRate={materialArrivalRate}
              materialArrivedAmount={materialArrivedAmount}
              materialArrivedQty={materialArrivedQty}
              materialPlannedQty={materialPlannedQty}
              materialPlannedAmount={materialPlannedAmount}
              totalCost={totalCost}
              revenue={revenue}
              incurredCost={incurredCost}
              warehousingRevenue={warehousingRevenue}
              shipmentRevenue={shipmentRevenue}
              shipmentRevenueTotal={shipmentRevenueTotal}
              orderTimelineColumns={orderTimelineColumns as Record<string, unknown>}
              orderMaterialColumns={orderMaterialColumns as Record<string, unknown>}
              chartSeries={chartSeries}
              materials={orderProfitData?.materials || []}
            />
          )}
        </Card>

        <ApprovalDetailModal
          open={detailOpen}
          kind={detailKind}
          record={detailRecord}
          width={detailModalWidth}
          initialHeight={detailModalInitialHeight}
          onClose={closeDetail}
          buildActionItems={buildActionItems}
          getPrevStageTime={getPrevStageTime}
          getPaidAtTime={getPaidAtTime}
        />
      </div>
    </Layout>
  );
};

export default PaymentApproval;
