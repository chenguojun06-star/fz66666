/**
 * ShopSalesRanking — 商品销量榜（爆款榜 / 滞销榜）
 *
 * <h3>为什么不做「更多图表」</h3>
 * 调研发现项目装了 echarts / echarts-for-react 却<b>几乎零使用</b>（仅 7 处，
 * 且商品相关 0 处）。但「滞销榜/爆款榜」本质上是一列排序后的数字，
 * **表格 + 占比条比柱状图更好读**（运营要的是「哪款该清库存」而不是「趋势形状」）。
 * 因此这里用轻量 SVG 占比条，不引入图表库 —— 保持与项目既有的
 * `MiniTrendBars` / `SizeColorSalesBars` 同一套写法。
 *
 * <h3>数据真实性</h3>
 * 数据来自真实出库台账，与单款销量趋势<b>同一销售口径</b>（同一类型过滤），
 * 因此榜单数字与趋势图可互相对账。无数据时显示明确原因，不画空坐标系。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Segmented, Space, Table, Tooltip, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import StyleImageCell from '@/components/common/StyleImageCell';
import { useStyleCoverImages } from '@/hooks/useStyleCoverImages';
import api from '@/utils/api';
import { message } from '@/utils/antdStatic';

const { Text } = Typography;

type RankRow = {
  styleNo: string;
  qty: number;
};

type RankResp = {
  code: number;
  data: {
    hasData?: boolean;
    items?: RankRow[];
    days?: number;
    sort?: 'asc' | 'desc';
    totalStyles?: number;
    totalQty?: number;
    dataRange?: string | null;
    noDataReason?: string | null;
  };
};

const ShopSalesRanking: React.FC = () => {
  const [mode, setMode] = useState<'desc' | 'asc'>('desc');
  const [days, setDays] = useState(90);
  const [rows, setRows] = useState<RankRow[]>([]);
  const [meta, setMeta] = useState<{ hasData: boolean; range: string | null; reason: string | null; totalStyles: number }>(
    { hasData: false, range: null, reason: null, totalStyles: 0 },
  );
  const [loading, setLoading] = useState(false);
  const { imageMap, fetchByStyleNos } = useStyleCoverImages();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<RankResp>('/order-management/sales-ranking', {
        params: { days, limit: 50, asc: mode === 'asc' },
      });
      if (res.code === 200 && res.data) {
        setRows(res.data.items || []);
        setMeta({
          hasData: !!res.data.hasData,
          range: res.data.dataRange ?? null,
          reason: res.data.noDataReason ?? null,
          totalStyles: res.data.totalStyles ?? 0,
        });
        void fetchByStyleNos((res.data.items || []).map((i) => i.styleNo));
      } else {
        setRows([]);
        setMeta({ hasData: false, range: null, reason: null, totalStyles: 0 });
      }
    } catch {
      setRows([]);
      setMeta({ hasData: false, range: null, reason: null, totalStyles: 0 });
      message.error('销量榜加载失败');
    } finally {
      setLoading(false);
    }
  }, [days, mode, fetchByStyleNos]);

  useEffect(() => { void load(); }, [load]);

  const max = rows.length > 0 ? Math.max(...rows.map((r) => Math.abs(r.qty)), 1) : 1;

  const columns: ColumnsType<RankRow> = [
    {
      title: '款式图',
      width: 76,
      render: (_, r) => <StyleImageCell styleNo={r.styleNo} imageMap={imageMap} size={44} />,
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      width: 160,
      render: (v: string) => <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</Text>,
    },
    {
      title: '累计售出（件）',
      dataIndex: 'qty',
      align: 'right',
      width: 130,
      sorter: (a, b) => a.qty - b.qty,
      render: (v: number) => <Text strong>{v}</Text>,
    },
    {
      title: mode === 'desc' ? '占比' : '相对水平',
      render: (_, r) => (
        <div style={{ height: 12, background: 'var(--color-bg-subtle)', borderRadius: 2, overflow: 'hidden' }}>
          <div
            style={{
              width: `${Math.max(2, (Math.abs(r.qty) / max) * 100)}%`,
              height: '100%',
              background: r.qty > 0 ? 'var(--color-primary)' : 'var(--color-text-quaternary)',
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Space wrap>
        <Segmented
          value={mode}
          onChange={(v) => setMode(v as 'desc' | 'asc')}
          options={[
            { value: 'desc', label: '爆款榜（卖得最多）' },
            { value: 'asc', label: '滞销榜（卖得最少）' },
          ]}
        />
        <Segmented
          value={days}
          onChange={(v) => setDays(Number(v))}
          options={[
            { value: 30, label: '近30天' },
            { value: 90, label: '近90天' },
            { value: 180, label: '近180天' },
          ]}
        />
        <Tooltip title="重新查询">
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>刷新</Button>
        </Tooltip>
        {meta.hasData && (
          <Text type="secondary">
            共 {meta.totalStyles} 款有销售记录{meta.range ? `，区间 ${meta.range}` : ''}
          </Text>
        )}
      </Space>

      {!meta.hasData && !loading ? (
        <Alert
          type="info"
          showIcon
          message="暂无销量数据"
          description={
            (meta.reason ? `${meta.reason}。` : '')
            + '销量榜来自真实出库台账（发货/自由出库/扫码出库），调拨与报废不计销量。'
            + '没有出库记录时显示为空，而不是用 0 填充 —— 两者业务含义不同。'
          }
        />
      ) : (
        <Card size="small" styles={{ body: { padding: 0 } }}>
          <Table<RankRow>
            rowKey="styleNo"
            size="small"
            columns={columns}
            dataSource={rows}
            loading={loading}
            pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 款` }}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该区间内没有销售记录" /> }}
          />
        </Card>
      )}
    </div>
  );
};

export default ShopSalesRanking;
