import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Button, Card, Drawer, Tabs, Table, Tag, Tooltip, Space, Alert, Input,
  InputNumber, Select, Checkbox, Statistic, Empty, Spin, Divider, message, Form,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  RobotOutlined, SearchOutlined, ShoppingCartOutlined,
  ReloadOutlined, FilterOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { purchaseCartApi } from '@/services/purchaseCartApi';
import { ORDER_STATUS_LABEL, ORDER_STATUS_COLOR } from '@/constants/orderStatus';
import type {
  SmartSourcingFilter, OrderBasicDto, OrderOverviewDto, NetDemandDetail,
} from '@/types/smartSourcing';

// ─────────────── 外部 Props ───────────────
export interface SmartSourcingDrawerProps {
  open: boolean;
  onClose: () => void;
  /** V1 单订单分析模式：打开后默认聚焦的订单号（可选） */
  defaultOrderNo?: string;
  /** 从外部打开订单选择器，V1模式需要 */
  onOpenOrderPicker?: () => void;
  /** 推送完成后回调（通常用于打开购物车） */
  onPushedToCart?: () => void;
}

type SmartTabKey = 'list' | 'single';

const SmartSourcingDrawer: React.FC<SmartSourcingDrawerProps> = ({
  open,
  onClose,
  defaultOrderNo,
  onOpenOrderPicker,
  onPushedToCart,
}) => {
  // ───────── Tab 状态 ─────────
  const [tabKey, setTabKey] = useState<SmartTabKey>('list');
  useEffect(() => {
    if (open) {
      // 外部带订单号进来时，切到单订单分析；默认用列表
      setTabKey(defaultOrderNo ? 'single' : 'list');
    }
  }, [open, defaultOrderNo]);

  return (
    <Drawer
      title="智能采购推荐"
      open={open}
      onClose={onClose}
      width={typeof window !== 'undefined' ? Math.round(window.innerWidth * 0.8) : '80%'}  // D-209：加宽到屏宽80%，表格列不挤
      destroyOnClose
      bodyStyle={{ padding: 0 }}
    >
      <div style={{ padding: '12px 24px 0' }}>
        <Tabs
          activeKey={tabKey}
          onChange={(k) => setTabKey(k as SmartTabKey)}
          type="card"
          items={[
            {
              key: 'list',
              label: (
                <span>
                  <RobotOutlined /> 待采购订单列表
                  <Tag color="blue" style={{ marginLeft: 6, fontSize: 11 }}>推荐</Tag>
                </span>
              ),
              children: <ListTab onPushedToCart={onPushedToCart} />,
            },
            {
              key: 'single',
              label: (
                <span>
                  <SearchOutlined /> 单订单分析
                </span>
              ),
              children: (
                <SingleTab
                  defaultOrderNo={defaultOrderNo}
                  onOpenOrderPicker={onOpenOrderPicker}
                  onPushedToCart={onPushedToCart}
                />
              ),
            },
          ]}
        />
      </div>
    </Drawer>
  );
};

export default SmartSourcingDrawer;

// ─────────────────────────────────────────────
//   Tab 1：待采购订单列表（V2 智能模式）
//   契约：POST /orders 请求体 = SmartSourcingFilter（arrivalRateLessThan/
//         createdWithinDays/statuses/searchKeyword/onlyUrgent/page/pageSize/sortBy/sortDir）
//         POST /orders-overview 请求体 = { orderNos, forceRefresh }
// ─────────────────────────────────────────────
interface ListTabProps {
  onPushedToCart?: () => void;
}

// 状态筛选可选值（与后端 ProductionOrder.status 真实值域一致）
const STATUS_OPTIONS = [
  'pending', 'production', 'delayed', 'paused', 'returned',
] as const;

const ListTab: React.FC<ListTabProps> = ({ onPushedToCart }) => {
  const [filterForm] = Form.useForm();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [listLoading, setListLoading] = useState(false);
  const [orderList, setOrderList] = useState<OrderBasicDto[]>([]);
  const [total, setTotal] = useState(0);

  // ── 勾选 & 展开 ──
  const [selectedOrderNos, setSelectedOrderNos] = useState<string[]>([]);
  const [expandedOrderNos, setExpandedOrderNos] = useState<React.Key[]>([]);
  // 概览算完后是否已自动勾选过缺料单（仅首轮自动，用户手动改过就不再覆盖；不参与渲染用ref）
  const autoSelectedRef = useRef(false);

  // ── 批量概览 Map（orderNo → overview），以及响应级汇总 ──
  const [overviewMap, setOverviewMap] = useState<Record<string, OrderOverviewDto>>({});
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [failedMap, setFailedMap] = useState<Record<string, string>>({});

  // ── 详情 Map（orderNo → NetDemandDetail[]） ──
  const [detailMap, setDetailMap] = useState<Record<string, NetDemandDetail[]>>({});
  const [detailLoadingMap, setDetailLoadingMap] = useState<Record<string, boolean>>({});

  // ── 批量推送 ──
  const [batchPushLoading, setBatchPushLoading] = useState(false);

  // ── 竞态保护：快速翻页/连续查询时只认最后一次请求的响应 ──
  const listReqSeqRef = useRef(0);

  // ────────────────── 批量概览 ──────────────────
  const fetchOverview = useCallback(async (orderNos: string[], forceRefresh = false) => {
    if (!orderNos.length) return;
    setOverviewLoading(true);
    try {
      // 后端硬限制≤20单/批：pageSize=50 时分多批"顺序"请求（不并发），既全量计算又不打挂数据库
      for (let i = 0; i < orderNos.length; i += 20) {
        const batch = orderNos.slice(i, i + 20);
        try {
          const resp = await purchaseCartApi.buildOrdersOverview(batch, forceRefresh);
          // 先清本批旧记录再合并：修复"重试成功后仍显示计算失败"的残留问题
          setOverviewMap((prev) => {
            const next = { ...prev };
            for (const on of batch) delete next[on];
            return { ...next, ...(resp.overviews || {}) };
          });
          setFailedMap((prev) => {
            const next = { ...prev };
            for (const on of batch) delete next[on];
            return { ...next, ...(resp.failed || {}) };
          });
          // 首轮：自动勾选"有缺料"的订单，用户打开即可一键推送；之后翻页不再覆盖手动选择
          if (!autoSelectedRef.current) {
            const shortageNos = batch.filter((on) => (resp.overviews?.[on]?.shortageCount ?? 0) > 0);
            if (shortageNos.length > 0) {
              setSelectedOrderNos(shortageNos);
            }
            autoSelectedRef.current = true;
          }
        } catch (e) {
          message.error(e instanceof Error ? e.message : '批量计算订单缺料失败');
        }
      }
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  // ────────────────── 统一加载入口 ──────────────────
  // 显式传目标页码/页大小：修复三类状态bug——
  // ① 重置后闭包里 page 是旧值（分页器显示第1页但请求旧页码）
  // ② page≠1 时点"查询"仅 setPage(1) 无 effect 触发刷新，列表不动
  // ③ 快速翻页旧响应晚到覆盖新响应（竞态）
  const loadOrders = useCallback(async (targetPage: number, targetPageSize: number) => {
    const seq = ++listReqSeqRef.current;
    setListLoading(true);
    try {
      const values = await filterForm.validateFields().catch(() => ({} as Record<string, unknown>));
      // 组装与后端 SmartSourcingFilter 完全一致的字段
      const filter: SmartSourcingFilter = {
        arrivalRateLessThan: values.arrivalRateLessThan ?? undefined,
        createdWithinDays: values.createdWithinDays ?? undefined,
        statuses: (values.statuses as string[] | undefined)?.length
          ? (values.statuses as string[])
          : undefined,
        searchKeyword: (values.searchKeyword as string | undefined)?.trim() || undefined,
        onlyUrgent: values.onlyUrgent ?? false,
        sortBy: values.sortBy,
        sortDir: values.sortDir,
        page: targetPage,
        pageSize: targetPageSize,
      };
      const pageResult = await purchaseCartApi.listSourcingOrders(filter);
      if (seq !== listReqSeqRef.current) return; // 已有更新的请求，丢弃本次旧响应
      setOrderList(pageResult.list || []);
      setTotal(pageResult.total || 0);
      // 当前页订单自动算概览
      const toCalc = (pageResult.list || []).map((o) => o.orderNo).filter(Boolean);
      if (toCalc.length > 0) {
        fetchOverview(toCalc);
      }
    } catch (e) {
      if (seq === listReqSeqRef.current) {
        message.error(e instanceof Error ? e.message : '加载待采购订单失败');
      }
    } finally {
      if (seq === listReqSeqRef.current) {
        setListLoading(false);
      }
    }
  }, [filterForm, fetchOverview]);

  useEffect(() => {
    // 首次挂载由 Drawer open 触发（destroyOnClose 下 Tab 挂载即加载）
    loadOrders(1, 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ────────────────── 筛选变化重新查询 ──────────────────
  const handleSearch = useCallback(() => {
    setSelectedOrderNos([]);
    autoSelectedRef.current = false;
    setPage(1);
    // 无论当前在第几页都显式从第1页查询（原实现 page≠1 时点查询不刷新）
    loadOrders(1, pageSize);
  }, [pageSize, loadOrders]);

  const handleReset = useCallback(() => {
    filterForm.resetFields();
    setSelectedOrderNos([]);
    autoSelectedRef.current = false;
    // 全新查询：清掉旧概览与失败标记（原实现闭包 page 旧值，重置后仍请求旧页码）
    setOverviewMap({});
    setFailedMap({});
    setPage(1);
    loadOrders(1, pageSize);
  }, [filterForm, pageSize, loadOrders]);

  // 翻页：统一走 loadOrders，消除原先的闭包旧值与重复请求代码
  const handlePageChange = useCallback((p: number, ps: number) => {
    setPage(p);
    setPageSize(ps);
    loadOrders(p, ps);
  }, [loadOrders]);

  // ────────────────── 详情（单个订单，懒加载） ──────────────────
  const fetchDetail = useCallback(async (orderNo: string) => {
    setDetailLoadingMap((prev) => ({ ...prev, [orderNo]: true }));
    try {
      const rows = await purchaseCartApi.getOrderDetailCached(orderNo);
      setDetailMap((prev) => ({ ...prev, [orderNo]: rows || [] }));
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载订单详情失败');
    } finally {
      setDetailLoadingMap((prev) => ({ ...prev, [orderNo]: false }));
    }
  }, []);

  // 展开时才懒加载详情
  useEffect(() => {
    for (const orderNo of expandedOrderNos) {
      const key = String(orderNo);
      if (!detailMap[key] && !detailLoadingMap[key]) {
        fetchDetail(key);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedOrderNos]);

  // ────────────────── 勾选批量推送 ──────────────────
  const handleBatchPush = useCallback(async () => {
    if (!selectedOrderNos.length) {
      message.warning('请先勾选至少 1 个订单');
      return;
    }
    if (selectedOrderNos.length > 20) {
      message.warning('单次批量推送最多 20 个订单，请分批处理');
      return;
    }
    setBatchPushLoading(true);
    try {
      await purchaseCartApi.generateSmartSourcingBatch(selectedOrderNos);
      message.success(`已为 ${selectedOrderNos.length} 个订单生成智能采购建议，请在购物车确认`);
      onPushedToCart?.();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '批量推送购物车失败');
    } finally {
      setBatchPushLoading(false);
    }
  }, [selectedOrderNos, onPushedToCart]);

  // ────────────────── 列表列定义 ──────────────────
  // 契约：OrderBasicDto = orderNo/styleNo/styleName/orderQuantity/
  //       materialArrivalRate/status/createTime/plannedEndDate/urgencyLevel/merchandiser
  const columns: ColumnsType<OrderBasicDto> = useMemo(() => [
    {
      title: '订单 / 款式',
      dataIndex: 'orderNo',
      width: 180,
      fixed: 'left',
      render: (v: string, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>
            {v || '-'}
            {r.urgencyLevel === 'urgent' && (
              <Tag color="red" style={{ marginLeft: 4, fontSize: 10 }}>急</Tag>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
            {r.styleNo || '-'} / {r.styleName || '-'}
          </div>
        </div>
      ),
    },
    {
      title: '数量 / 跟单',
      width: 110,
      render: (_, r) => (
        <div style={{ fontSize: 12 }}>
          <div>{r.orderQuantity ?? '-'} 件</div>
          <div style={{ color: 'var(--color-text-secondary)' }}>{r.merchandiser || '-'}</div>
        </div>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      width: 140,
      render: (v) => (v ? dayjs(v).format('MM-DD HH:mm') : '-'),
    },
    {
      title: '交期',
      dataIndex: 'plannedEndDate',
      width: 130,
      render: (v) => {
        if (!v) return '-';
        const d = dayjs(v);
        const diffDay = d.diff(dayjs(), 'day');
        return (
          <Space direction="vertical" size={2}>
            <span>{d.format('YYYY-MM-DD')}</span>
            {diffDay < 0 && <Tag color="red" style={{ fontSize: 10 }}>逾期 {-diffDay}天</Tag>}
            {diffDay >= 0 && diffDay <= 3 && (
              <Tag color="orange" style={{ fontSize: 10 }}>剩 {diffDay}天</Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: '到位率',
      dataIndex: 'materialArrivalRate',
      width: 90,
      render: (v) => {
        if (v == null) return <Tag style={{ fontSize: 10 }}>未维护</Tag>;
        const color = v >= 100 ? 'var(--color-success)'
          : v >= 60 ? 'var(--color-warning)' : 'var(--color-error)';
        return <span style={{ color, fontWeight: 600 }}>{v}%</span>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: string) => (
        <Tag color={ORDER_STATUS_COLOR[v] || 'default'}>
          {ORDER_STATUS_LABEL[v] || v || '-'}
        </Tag>
      ),
    },
    {
      title: '缺料概览',
      width: 300,
      render: (_, r) => {
        const ov = overviewMap[r.orderNo];
        const failedReason = failedMap[r.orderNo];
        if (failedReason) {
          return (
            <Tooltip title={failedReason}>
              <Tag color="default" style={{ fontSize: 11 }}>计算失败</Tag>
            </Tooltip>
          );
        }
        if (!ov) {
          return <span style={{ color: 'var(--color-text-quaternary)', fontSize: 12 }}>计算中...</span>;
        }
        return (
          <Space direction="vertical" size={2}>
            <div style={{ fontSize: 12, fontWeight: 500 }}>{ov.criticalPath || '-'}</div>
            <Space size={4} wrap>
              {(ov.shortageCount ?? 0) > 0 && (
                <Tag color="red" style={{ fontSize: 10 }}>缺{ov.shortageCount}种</Tag>
              )}
              {(ov.sufficientCount ?? 0) > 0 && (
                <Tag color="green" style={{ fontSize: 10 }}>齐{ov.sufficientCount}种</Tag>
              )}
              {(ov.shortageAmount ?? 0) > 0 && (
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                  ≈ ¥{ov.shortageAmount!.toFixed(2)}
                </span>
              )}
              {ov.fromCache && (
                <Tooltip title={`缓存于 ${ov.computedAt ? dayjs(ov.computedAt).format('HH:mm') : '-'}，2小时内复用`}>
                  <Tag style={{ fontSize: 10 }}>缓存</Tag>
                </Tooltip>
              )}
            </Space>
          </Space>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right',
      render: (_, r) => {
        const ov = overviewMap[r.orderNo];
        const canPush = (ov?.shortageCount ?? 0) > 0;
        return (
          <Space size={4}>
            <Button
              size="small"
              type="link"
              loading={!!detailLoadingMap[r.orderNo]}
              onClick={() => {
                setExpandedOrderNos((prev) => {
                  const has = prev.includes(r.orderNo);
                  return has ? prev.filter((k) => k !== r.orderNo) : [...prev, r.orderNo];
                });
              }}
            >
              {expandedOrderNos.includes(r.orderNo) ? '收起明细' : '展开明细'}
            </Button>
            <Button
              size="small"
              type="link"
              disabled={!canPush}
              icon={<ShoppingCartOutlined />}
              onClick={async () => {
                try {
                  await purchaseCartApi.generateSmartSourcing(r.orderNo);
                  message.success(`订单 ${r.orderNo} 已推送购物车`);
                  onPushedToCart?.();
                } catch (e) {
                  message.error(e instanceof Error ? e.message : '推送失败');
                }
              }}
            >
              推送本单
            </Button>
          </Space>
        );
      },
    },
  ], [overviewMap, failedMap, expandedOrderNos, detailLoadingMap, onPushedToCart]);

  // ────────────────── 勾选汇总条 ──────────────────
  const selectionSummary = useMemo(() => {
    if (!selectedOrderNos.length) return null;
    const ovs = selectedOrderNos
      .map((n) => overviewMap[n])
      .filter(Boolean) as OrderOverviewDto[];
    const totalShortage = ovs.reduce((s, o) => s + (o.shortageCount || 0), 0);
    const totalAmt = ovs.reduce(
      (s, o) => s + (typeof o.shortageAmount === 'number' ? o.shortageAmount : 0), 0,
    );
    return (
      <div
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 12px', background: 'var(--color-fill-quaternary)',
          borderRadius: 6, marginBottom: 8, flexWrap: 'wrap', gap: 8,
        }}
      >
        <Space wrap>
          <span style={{ fontSize: 12 }}>已选 <strong>{selectedOrderNos.length}</strong> 单</span>
          {totalShortage > 0 && (
            <span style={{ fontSize: 12, color: 'var(--color-error)' }}>
              共 <strong>{totalShortage}</strong> 种缺料
            </span>
          )}
          {totalAmt > 0 && (
            <span style={{ fontSize: 12 }}>
              预估采购 ≈ <strong style={{ color: 'var(--color-primary)' }}>¥{totalAmt.toFixed(2)}</strong>
            </span>
          )}
        </Space>
        <Space>
          <Button size="small" onClick={() => setSelectedOrderNos([])}>清空勾选</Button>
          <Button
            size="small"
            type="primary"
            icon={<ShoppingCartOutlined />}
            loading={batchPushLoading}
            onClick={handleBatchPush}
          >
            一键推送缺料到购物车
          </Button>
        </Space>
      </div>
    );
  }, [selectedOrderNos, overviewMap, batchPushLoading, handleBatchPush]);

  // ────────────────── 展开行：净需求明细 ──────────────────
  const renderExpandedRow = (r: OrderBasicDto) => {
    const detail = detailMap[r.orderNo];
    const loading = !!detailLoadingMap[r.orderNo];
    const ov = overviewMap[r.orderNo];
    if (loading) return <Spin style={{ padding: 12 }} />;
    if (!detail || detail.length === 0) {
      return (
        <div style={{ padding: 8 }}>
          <Empty description="暂无物料清单明细（该款可能未维护）" />
        </div>
      );
    }
    return (
      <div style={{ padding: '4px 8px 8px' }}>
        {ov?.hints && ov.hints.length > 0 && (
          <Space direction="vertical" size={4} style={{ marginBottom: 8, width: '100%' }}>
            {ov.hints.map((h, i) => {
              const type: any = h.type === 'risk' ? 'error' : h.type;
              return <Alert key={i} type={type} showIcon message={h.message} />;
            })}
          </Space>
        )}
        <Table
          size="small"
          dataSource={detail}
          rowKey="materialCode"
          pagination={false}
          scroll={{ x: 1250 }}
          rowClassName={(record) => (record.needPurchase ?? false) ? '' : 'smart-sourcing-no-need'}
          columns={netDemandColumns}
        />
      </div>
    );
  };

  return (
    <div style={{ padding: 12 }}>
      {/* 筛选条件卡片：字段与后端 SmartSourcingFilter 一一对应 */}
      <Card
        bordered
        size="small"
        style={{ marginBottom: 8 }}
        title={<Space><FilterOutlined /><span>筛选条件（全部可配置）</span></Space>}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} loading={listLoading}>
              查询
            </Button>
          </Space>
        }
      >
        <Form
          form={filterForm}
          layout="vertical"
          initialValues={{
            arrivalRateLessThan: 80,
            createdWithinDays: 60,
            onlyUrgent: false,
            sortBy: 'createTime',
            sortDir: 'desc',
          }}
        >
          <Space wrap size={16} style={{ width: '100%' }} align="start">
            <Form.Item label="到位率 < (%)" style={{ marginBottom: 0 }}>
              <Form.Item name="arrivalRateLessThan" noStyle>
                <InputNumber min={1} max={100} style={{ width: 100 }} placeholder="100=全部" />
              </Form.Item>
            </Form.Item>
            <Form.Item label="创建于近(天)" style={{ marginBottom: 0 }}>
              <Form.Item name="createdWithinDays" noStyle>
                <InputNumber min={1} max={730} style={{ width: 100 }} placeholder="0=不限" />
              </Form.Item>
            </Form.Item>
            <Form.Item label="订单状态" style={{ marginBottom: 0 }}>
              <Form.Item name="statuses" noStyle>
                <Select
                  mode="multiple"
                  allowClear
                  placeholder="默认排除终态"
                  style={{ minWidth: 220 }}
                  options={STATUS_OPTIONS.map((s) => ({
                    value: s,
                    label: ORDER_STATUS_LABEL[s] || s,
                  }))}
                />
              </Form.Item>
            </Form.Item>
            <Form.Item label="关键词(订单号/款号)" style={{ marginBottom: 0 }}>
              <Form.Item name="searchKeyword" noStyle>
                <Input
                  placeholder="搜索"
                  style={{ width: 200 }}
                  allowClear
                  onPressEnter={handleSearch}
                />
              </Form.Item>
            </Form.Item>
            <Form.Item label="急单" style={{ marginBottom: 0 }}>
              <Form.Item name="onlyUrgent" noStyle valuePropName="checked">
                <Checkbox>只看急单</Checkbox>
              </Form.Item>
            </Form.Item>
            <Form.Item label="排序" style={{ marginBottom: 0 }}>
              <Space.Compact>
                <Form.Item name="sortBy" noStyle>
                  <Select style={{ width: 130 }} options={[
                    { value: 'createTime', label: '创建时间' },
                    { value: 'plannedEndDate', label: '交期' },
                    { value: 'materialArrivalRate', label: '到位率' },
                    { value: 'orderQuantity', label: '订单数量' },
                  ]} />
                </Form.Item>
                <Form.Item name="sortDir" noStyle>
                  <Select style={{ width: 84 }} options={[
                    { value: 'desc', label: '降序' },
                    { value: 'asc', label: '升序' },
                  ]} />
                </Form.Item>
              </Space.Compact>
            </Form.Item>
          </Space>
        </Form>
      </Card>

      {selectionSummary}

      <Table<OrderBasicDto>
        rowKey="orderNo"
        size="small"
        loading={listLoading}
        dataSource={orderList}
        columns={columns}
        scroll={{ x: 1250 }}
        rowSelection={{
          selectedRowKeys: selectedOrderNos,
          onChange: (keys) => setSelectedOrderNos(keys.map(String)),
          preserveSelectedRowKeys: true,
          getCheckboxProps: (r) => ({
            // 概览显示无缺料的订单禁选；未算出来的不禁（可能真缺料）
            disabled: (overviewMap[r.orderNo]?.shortageCount ?? null) === 0,
          }),
        }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50'],
          showTotal: (t) => `共 ${t} 个订单`,
          onChange: handlePageChange,
        }}
        expandable={{
          expandedRowKeys: expandedOrderNos as React.Key[],
          onExpandedRowsChange: (keys) => setExpandedOrderNos([...keys]),
          expandedRowRender: renderExpandedRow,
        }}
      />
      <Divider style={{ margin: '16px 0 8px' }} />
      <Alert
        type="info"
        showIcon
        message="性能保护说明"
        description={
          <ul style={{ paddingLeft: 18, margin: 0, fontSize: 12, lineHeight: 1.8 }}>
            <li>首屏只查订单列表（1次SQL），不做净需求计算</li>
            <li>当前页订单（≤20）自动批量算缺料概览（后端5次批量SQL，非逐单循环）</li>
            <li>概览结果缓存2小时；「展开明细」懒加载并走同一份缓存</li>
            <li>批量推送购物车单次 ≤20 单（后端硬校验），超限请分批</li>
          </ul>
        }
      />
    </div>
  );
};

// ─────────────────────────────────────────────
//   Tab 2：单订单分析（V1 兼容模式）
// ─────────────────────────────────────────────
interface SingleTabProps {
  defaultOrderNo?: string;
  onOpenOrderPicker?: () => void;
  onPushedToCart?: () => void;
}

const SingleTab: React.FC<SingleTabProps> = ({
  defaultOrderNo,
  onOpenOrderPicker,
  onPushedToCart,
}) => {
  const [orderNo, setOrderNo] = useState(defaultOrderNo || '');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<NetDemandDetail[]>([]);
  const [pushLoading, setPushLoading] = useState(false);

  useEffect(() => {
    if (defaultOrderNo) setOrderNo(defaultOrderNo);
  }, [defaultOrderNo]);

  // 外部带订单号进来时自动分析一次
  useEffect(() => {
    if (defaultOrderNo && !data.length) {
      handleAnalyze(defaultOrderNo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultOrderNo]);

  const handleAnalyze = useCallback(async (onArg?: string) => {
    const on = (onArg ?? orderNo).trim();
    if (!on) { message.warning('请输入订单号'); return; }
    setLoading(true);
    try {
      const rows = await purchaseCartApi.getNetDemand(on);
      setData(rows || []);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '分析需求失败');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [orderNo]);

  const handlePush = useCallback(async () => {
    const on = orderNo.trim();
    if (!on) { message.warning('订单号不能为空'); return; }
    // 与后端推送规则一致：needPurchase = netDemand > 0 才进购物车
    const needCount = data.filter((d) => d.needPurchase ?? false).length;
    if (needCount === 0) {
      message.info('所有物料库存充足，无需采购');
      return;
    }
    setPushLoading(true);
    try {
      await purchaseCartApi.generateSmartSourcing(on);
      message.success(`已将 ${needCount} 项缺料加入购物车草稿`);
      onPushedToCart?.();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '推送购物车失败');
    } finally {
      setPushLoading(false);
    }
  }, [orderNo, data, onPushedToCart]);

  const needCount = data.filter((d) => d.needPurchase ?? false).length;
  const enoughCount = data.length - needCount;

  return (
    <div style={{ padding: 12 }}>
      <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
        <Input
          placeholder="选择或输入生产订单号"
          value={orderNo}
          onChange={(e) => setOrderNo(e.target.value)}
          onPressEnter={() => handleAnalyze()}
          allowClear
          prefix={<SearchOutlined />}
        />
        <Button onClick={onOpenOrderPicker}>选择订单</Button>
        <Button type="primary" onClick={() => handleAnalyze()} loading={loading}>分析需求</Button>
      </Space.Compact>

      {data.length > 0 && (
        <Space style={{ marginBottom: 12 }}>
          <Statistic
            title="需采购"
            value={needCount}
            valueStyle={{ color: 'var(--color-error)', fontSize: 18 }}
          />
          <Statistic
            title="库存充足"
            value={enoughCount}
            valueStyle={{ color: 'var(--color-success)', fontSize: 18 }}
          />
        </Space>
      )}

      {data.length === 0 && !loading && (
        <Alert
          type="info"
          showIcon
          message="单订单分析（兼容旧操作）"
          description={
            <div style={{ fontSize: 13, lineHeight: 1.8 }}>
              <p style={{ margin: '0 0 4px' }}><strong>功能说明：</strong>输入生产订单号，系统自动分析该订单的物料清单，计算每个物料的净需求。</p>
              <p style={{ margin: '0 0 4px' }}><strong>计算公式：</strong>净需求 = 物料用量 × 订单数量 × (1 + 损耗率) - 可用库存 - 在途采购</p>
              <p style={{ margin: '0 0 4px' }}><strong>智能推荐：</strong>仅净需求 &gt; 0 的物料才会推送购物车，并自动推荐供应商。</p>
              <p style={{ margin: 0 }}><strong>操作流程：</strong>输入订单号 → 点「分析需求」查看明细 → 确认后点「推送缺料到购物车」。</p>
            </div>
          }
        />
      )}

      <Spin spinning={loading}>
        {data.length > 0 && (
          <Table
            size="small"
            dataSource={data}
            rowKey="materialCode"
            pagination={false}
            scroll={{ x: 1300 }}
            rowClassName={(r) => (r.needPurchase ?? false) ? '' : 'smart-sourcing-no-need'}
            columns={netDemandColumns}
          />
        )}
      </Spin>

      {data.length > 0 && <Divider style={{ margin: '12px 0' }} />}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Space>
          <Button
            type="primary"
            icon={<ShoppingCartOutlined />}
            loading={pushLoading}
            onClick={handlePush}
            disabled={needCount === 0}
          >
            确认推送缺料到购物车
          </Button>
        </Space>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
//   共享：净需求明细列定义（V1/V2 共用）
//   契约：后端 buildNetDemandDetails 返回 Map 的 key
//   （2026-08-22 逐 key 核实，见 smartSourcing.d.ts 注释）
// ─────────────────────────────────────────────
const netDemandColumns: ColumnsType<NetDemandDetail> = [
  {
    title: '状态',
    width: 80,
    fixed: 'left',
    render: (_, r) => (r.needPurchase ?? false)
      ? <Tag color="red">需采购</Tag>
      : <Tag color="green">充足</Tag>,
  },
  {
    title: '物料信息',
    width: 220,
    fixed: 'left',
    render: (_, r) => (
      <div>
        <div style={{ fontWeight: 500 }}>{r.materialName || '-'}</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
          {r.materialCode}
          {r.specification ? ` | ${r.specification}` : ''}
          {r.color ? ` | ${r.color}` : ''}
        </div>
      </div>
    ),
  },
  {
    title: '单耗',
    dataIndex: 'bomUsageAmount',
    width: 80,
    render: (v, r) => <span>{v ?? '-'} {r.unit || ''}</span>,
  },
  {
    title: '损耗率',
    dataIndex: 'lossRate',
    width: 70,
    render: (v) => (typeof v === 'number' ? `${v}%` : '-'),
  },
  {
    title: '总需求',
    dataIndex: 'demand',
    width: 100,
    render: (v, r) => (
      <span style={{ fontWeight: 500 }}>{v ?? '-'} {r.unit || ''}</span>
    ),
  },
  {
    title: '可用库存',
    dataIndex: 'availableStock',
    width: 80,
    render: (v) => {
      const n = (v ?? 0) as number;
      return (
        <span style={{ color: n > 0 ? 'var(--color-success)' : 'var(--color-text-quaternary)' }}>
          {n}
        </span>
      );
    },
  },
  {
    title: '在途',
    dataIndex: 'inTransit',
    width: 70,
    render: (v) => v ?? 0,
  },
  {
    title: '净需求',
    dataIndex: 'netDemand',
    width: 100,
    render: (v, r) => {
      const need = (v ?? 0) > 0;
      return (
        <span style={{
          color: need ? 'var(--color-error)' : 'var(--color-text-quaternary)',
          fontWeight: need ? 600 : 400,
        }}>
          {v ?? 0} {r.unit || ''}
        </span>
      );
    },
  },
  {
    title: '推荐供应商',
    width: 180,
    render: (_, r) => {
      const s = r.recommendedSupplier;
      if (!s?.supplierName) {
        return <span style={{ color: 'var(--color-text-quaternary)' }}>暂无</span>;
      }
      const tierColor = s.supplierTier === 'S' ? 'gold'
        : s.supplierTier === 'A' ? 'green' : 'default';
      return (
        <div>
          <div style={{ fontWeight: 500 }}>
            {s.supplierName}
            {s.isBomDesignated && (
              <Tag color="blue" style={{ marginLeft: 4, fontSize: 10 }}>清单指定</Tag>
            )}
          </div>
          <div style={{ fontSize: 11 }}>
            {s.supplierTier && <Tag color={tierColor} style={{ fontSize: 10 }}>{s.supplierTier}级</Tag>}
            {s.overallScore != null && (
              <span style={{ color: 'var(--color-text-secondary)', marginLeft: 4 }}>
                评分 {s.overallScore}
              </span>
            )}
          </div>
        </div>
      );
    },
  },
  {
    title: '价格参考',
    width: 160,
    render: (_, r) => (
      <div style={{ fontSize: 12, lineHeight: 1.6 }}>
        {r.bomUnitPrice != null && (
          <div>
            <span style={{ color: 'var(--color-text-secondary)' }}>物料清单预估：</span>
            <strong>¥{r.bomUnitPrice}</strong>
          </div>
        )}
        {r.lastPurchasePrice != null && (
          <div>
            <span style={{ color: 'var(--color-text-secondary)' }}>上次采购：</span>
            <strong>¥{r.lastPurchasePrice}</strong>
            {r.lastPurchaseSupplier ? ` (${r.lastPurchaseSupplier})` : ''}
          </div>
        )}
        {r.priceAlert && (
          <Tag color="orange" style={{ fontSize: 10, marginTop: 2 }}>{r.priceAlert}</Tag>
        )}
      </div>
    ),
  },
  {
    title: '推荐理由',
    dataIndex: 'recommendReason',
    width: 220,
    ellipsis: { showTitle: false },
    render: (v) => (
      <Tooltip title={v} placement="topLeft">
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{v}</span>
      </Tooltip>
    ),
  },
];
