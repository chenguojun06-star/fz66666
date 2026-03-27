/**
 * 标签管理页面（洗水唛 / U编码）
 *
 * 功能：
 *   - 按订单查看洗水唛（成分/洗涤说明）和 U 编码
 *   - 洗水唛数据来源于款式开发（styleInfo），下单后由款式信息同步
 *   - U 编码默认按「款号-颜色-码数-订单号后6位」自动生成，用户可在行内覆盖
 *   - 支持单条及批量打印洗水唛 / 吊牌
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { App, Button, Input, Select, Space, Tag, Tooltip } from 'antd';
import { PrinterOutlined, ReloadOutlined, TagOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import StandardToolbar from '@/components/common/StandardToolbar';
import { productionOrderApi } from '@/services/production/productionApi';
import api, { parseProductionOrderLines, sortSizeNames } from '@/utils/api';
import type { ProductionOrder } from '@/types/production';
import type { ColumnsType } from 'antd/es/table';
import WashLabelBatchPrintModal, { WashLabelItem } from './components/WashLabelBatchPrintModal';

const { Option } = Select;

type ParsedOrderLine = {
  color?: string;
  size?: string;
  quantity?: number;
};

function getOrderLines(order: ProductionOrder): ParsedOrderLine[] {
  return parseProductionOrderLines(order).filter((line) => {
    const color = String(line?.color || '').trim();
    const size = String(line?.size || '').trim();
    return !!color && !!size;
  });
}

function getDisplayColors(order: ProductionOrder): string[] {
  return Array.from(new Set(
    getOrderLines(order).map((line) => String(line?.color || '').trim()).filter(Boolean),
  ));
}

function getDisplaySizes(order: ProductionOrder): string[] {
  return sortSizeNames(Array.from(new Set(
    getOrderLines(order).map((line) => String(line?.size || '').trim()).filter(Boolean),
  )));
}

function getDisplayColorText(order: ProductionOrder): string {
  const colors = getDisplayColors(order);
  if (colors.length > 1) return `${colors.length}色：${colors.join(' / ')}`;
  if (colors.length === 1) return colors[0];
  return String(order.color || '').trim() || '-';
}

function getDisplaySizeText(order: ProductionOrder): string {
  const sizes = getDisplaySizes(order);
  if (sizes.length > 0) return sizes.join(' / ');
  return String(order.size || '').trim() || '-';
}

function genUCode(order: ProductionOrder, line?: ParsedOrderLine): string {
  const parts = [
    order.styleNo,
    String(line?.color || order.color || '').trim(),
    String(line?.size || order.size || '').trim(),
  ].filter(Boolean);
  const suffix = String(order.orderNo || '').slice(-6);
  return parts.length ? `${parts.join('-')}-${suffix}` : order.orderNo || '';
}

type StyleLabelCache = Record<string, {
  fabricComposition?: string;
  fabricCompositionParts?: string;
  washInstructions?: string;
  uCode?: string;
  washTempCode?: string;
  bleachCode?: string;
  tumbleDryCode?: string;
  ironCode?: string;
  dryCleanCode?: string;
}>;

const WashLabelPage: React.FC = () => {
  const { message } = App.useApp();

  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 30;
  const [searchOrderNo, setSearchOrderNo] = useState('');
  const [searchStyleNo, setSearchStyleNo] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  /** 缓存 styleId → 款式标签字段（含成分/套装成分/洗护说明/U码/ISO护理码） */
  const styleCache = useRef<StyleLabelCache>({});
  /** 触发含缓存数据的列重新渲染 */
  const [, setCacheVer] = useState(0);

  /** 本地 U 编码覆盖（仅当次会话有效，不持久化） */
  const [uCodeOverrides, setUCodeOverrides] = useState<Record<string, string>>({});

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  const [batchPrintOpen, setBatchPrintOpen] = useState(false);
  const [batchPrintItems, setBatchPrintItems] = useState<WashLabelItem[]>([]);
  const [batchPrintLoading, setBatchPrintLoading] = useState(false);

  /** 并行获取款式标签信息（静默，不阻塞UI，利用缓存） */
  const fetchStyleInfoForOrders = useCallback(async (list: ProductionOrder[]) => {
    const uncached = [...new Set(list.map(o => o.styleId).filter(Boolean))]
      .filter(id => !(id in styleCache.current));
    if (!uncached.length) return;

    await Promise.allSettled(
      uncached.map(async (styleId) => {
        try {
          const res = await api.get<any>(`/style/info/${styleId}`);
          const d = (res as any)?.data ?? res ?? {};
          styleCache.current[styleId] = {
            fabricComposition: d.fabricComposition,
            fabricCompositionParts: d.fabricCompositionParts,
            washInstructions: d.washInstructions,
            uCode: d.uCode,
            washTempCode: d.washTempCode,
            bleachCode: d.bleachCode,
            tumbleDryCode: d.tumbleDryCode,
            ironCode: d.ironCode,
            dryCleanCode: d.dryCleanCode,
          };
        } catch { /* silently ignore: 款式可能未填写 */ }
      })
    );
    setCacheVer(v => v + 1);
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await productionOrderApi.list({
        page,
        pageSize,
        orderNo: searchOrderNo.trim() || undefined,
        styleNo: searchStyleNo.trim() || undefined,
        status: statusFilter || undefined,
      } as any);
      const records = (res as any)?.data?.records ?? (res as any)?.records ?? [];
      const tot = (res as any)?.data?.total ?? (res as any)?.total ?? records.length;
      setOrders(records as ProductionOrder[]);
      setTotal(tot);
      void fetchStyleInfoForOrders(records as ProductionOrder[]);
    } catch {
      message.error('加载订单失败');
    } finally {
      setLoading(false);
    }
  }, [page, searchOrderNo, searchStyleNo, statusFilter, fetchStyleInfoForOrders, message]);

  useEffect(() => { void fetchOrders(); }, [fetchOrders]);

  const getUCode = (order: ProductionOrder): string => {
    if (order.id && uCodeOverrides[order.id]) return uCodeOverrides[order.id];
    const cached = styleCache.current[order.styleId];
    if (cached?.uCode) return cached.uCode;
    return genUCode(order);
  };

  const buildPrintItems = useCallback(async (targetOrders: ProductionOrder[]): Promise<WashLabelItem[]> => {
    await fetchStyleInfoForOrders(targetOrders);
    return targetOrders.flatMap(o => {
      const cached = styleCache.current[o.styleId] ?? {};
      const lines = getOrderLines(o);
      const fallbackLine = lines.length ? lines : [{ color: o.color, size: o.size, quantity: o.orderQuantity }];
      return fallbackLine.map((line) => ({
        orderNo: o.orderNo,
        styleNo: o.styleNo,
        styleName: o.styleName,
        color: String(line?.color || o.color || '').trim(),
        size: String(line?.size || o.size || '').trim(),
        fabricComposition: cached.fabricComposition,
        fabricCompositionParts: cached.fabricCompositionParts,
        washInstructions: cached.washInstructions,
        uCode: cached.uCode || (lines.length <= 1 ? getUCode(o) : genUCode(o, line)),
        washTempCode: cached.washTempCode,
        bleachCode: cached.bleachCode,
        tumbleDryCode: cached.tumbleDryCode,
        ironCode: cached.ironCode,
        dryCleanCode: cached.dryCleanCode,
      }));
    });
  }, [fetchStyleInfoForOrders]);

  const openBatchPrint = useCallback(async (targetOrders: ProductionOrder[]) => {
    setBatchPrintLoading(true);
    setBatchPrintOpen(true);
    const items = await buildPrintItems(targetOrders);
    setBatchPrintItems(items);
    setBatchPrintLoading(false);
  }, [buildPrintItems]);

  const handleBatchPrint = async () => {
    const selected = orders.filter(o => o.id && selectedRowKeys.includes(o.id));
    if (!selected.length) { message.warning('请先勾选要打印的订单'); return; }
    await openBatchPrint(selected);
  };

  const columns: ColumnsType<ProductionOrder> = [
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 140,
      render: (v: string) => <span style={{ fontWeight: 500 }}>{v}</span>,
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 110,
    },
    {
      title: '款名',
      dataIndex: 'styleName',
      key: 'styleName',
      width: 120,
      ellipsis: true,
    },
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 80,
      render: (_: unknown, record: ProductionOrder) => getDisplayColorText(record),
    },
    {
      title: '码数',
      dataIndex: 'size',
      key: 'size',
      width: 120,
      render: (_: unknown, record: ProductionOrder) => getDisplaySizeText(record),
    },
    {
      title: (
        <Tooltip title="来源：款式开发 → 面料成分">
          面料成分
        </Tooltip>
      ),
      key: 'fabricComposition',
      width: 200,
      ellipsis: true,
      render: (_: unknown, record: ProductionOrder) => {
        const cached = styleCache.current[record.styleId];
        if (cached === undefined) return <span style={{ color: '#bbb' }}>--</span>;
        return cached.fabricComposition
          ? <Tooltip title={cached.fabricComposition}><span>{cached.fabricComposition}</span></Tooltip>
          : <span style={{ color: '#fa8c16' }}>未填写</span>;
      },
    },
    {
      title: (
        <Tooltip title="来源：款式开发 → 洗涤说明">
          洗涤说明
        </Tooltip>
      ),
      key: 'washInstructions',
      width: 200,
      ellipsis: true,
      render: (_: unknown, record: ProductionOrder) => {
        const cached = styleCache.current[record.styleId];
        if (cached === undefined) return <span style={{ color: '#bbb' }}>--</span>;
        return cached.washInstructions
          ? <Tooltip title={cached.washInstructions}><span>{cached.washInstructions}</span></Tooltip>
          : <span style={{ color: '#fa8c16' }}>未填写</span>;
      },
    },
    {
      title: (
        <Tooltip title="默认：款号-颜色-码数-订单号后6位，可修改">
          U编码
        </Tooltip>
      ),
      key: 'uCode',
      width: 200,
      render: (_: unknown, record: ProductionOrder) => {
        const lineCount = getOrderLines(record).length;
        if (lineCount > 1) {
          return <span style={{ color: '#1677ff', fontWeight: 600 }}>{`按SKU生成 ${lineCount} 条`}</span>;
        }
        return (
          <Input
            size="small"
            value={record.id ? (uCodeOverrides[record.id] ?? getUCode(record)) : getUCode(record)}
            onChange={e => record.id && setUCodeOverrides(prev => ({ ...prev, [record.id!]: e.target.value }))}
            style={{ width: 185 }}
            placeholder="自动生成"
          />
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right' as const,
      width: 80,
      render: (_: unknown, record: ProductionOrder) => (
        <Button
          size="small"
          icon={<PrinterOutlined />}
          onClick={() => void openBatchPrint([record])}
        >
          打印
        </Button>
      ),
    },
  ];

  return (
    <Layout>
      <div style={{ padding: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            <TagOutlined style={{ marginRight: 8, color: 'var(--primary-color)' }} />
            标签管理（洗水唛 / U编码）
          </h2>
          <div style={{ marginTop: 4, fontSize: 12, color: '#888' }}>
            洗水唛数据来源于款式开发，下单后自动同步；U编码支持行内修改
          </div>
        </div>

        <StandardToolbar
          left={
            <Space wrap>
              <Input
                placeholder="订单号"
                value={searchOrderNo}
                onChange={e => setSearchOrderNo(e.target.value)}
                onPressEnter={() => { setPage(1); void fetchOrders(); }}
                allowClear
                style={{ width: 140 }}
              />
              <Input
                placeholder="款号"
                value={searchStyleNo}
                onChange={e => setSearchStyleNo(e.target.value)}
                onPressEnter={() => { setPage(1); void fetchOrders(); }}
                allowClear
                style={{ width: 120 }}
              />
              <Select
                value={statusFilter}
                onChange={v => { setStatusFilter(v); setPage(1); }}
                style={{ width: 110 }}
                placeholder="状态"
              >
                <Option value="">全部状态</Option>
                <Option value="pending">待生产</Option>
                <Option value="production">生产中</Option>
                <Option value="completed">已完成</Option>
              </Select>
              <Button icon={<ReloadOutlined />} onClick={() => { setPage(1); void fetchOrders(); }}>
                刷新
              </Button>
            </Space>
          }
          right={
            <Space>
              {selectedRowKeys.length > 0 && (
                <Tag color="blue">{selectedRowKeys.length} 条已选</Tag>
              )}
              <Button
                type="primary"
                icon={<PrinterOutlined />}
                disabled={selectedRowKeys.length === 0}
                onClick={() => void handleBatchPrint()}
              >
                批量打印标签
              </Button>
            </Space>
          }
        />

        <ResizableTable<ProductionOrder>
          rowKey="id"
          columns={columns}
          dataSource={orders}
          loading={loading}
          scroll={{ x: 1200 }}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: (p) => setPage(p),
            showSizeChanger: false,
            showTotal: (t) => `共 ${t} 条`,
          }}
          size="small"
        />
      </div>

      <WashLabelBatchPrintModal
        open={batchPrintOpen}
        onClose={() => { setBatchPrintOpen(false); setBatchPrintItems([]); }}
        items={batchPrintItems}
        loading={batchPrintLoading}
      />
    </Layout>
  );
};

export default WashLabelPage;
