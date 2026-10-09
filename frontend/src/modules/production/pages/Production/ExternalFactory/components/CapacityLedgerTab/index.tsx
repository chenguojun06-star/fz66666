import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Empty, Space, Spin, Table, Tag, Tooltip, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { productionOrderApi, type CapacityLedgerRow, type CapacityLedgerStatus } from '@/services/production/productionApi';

const { Text } = Typography;

/**
 * 外发工厂产能台账（D-779）
 *
 * <p>回答一个问题：**内部产能不足时，这些订单该外推给谁？**
 *
 * <p>设计要点 —— <b>把「不知道」和「很闲」严格区分开</b>：
 * 未配日产能的工厂 loadRate / freeCapacity 都是 null，界面显示「未配置产能」，
 * <b>不显示 0</b>。若把没填产能当成 0 产能，界面会呈现一片「都很闲」，
 * 运营就会把订单推给一家根本不知道自己能不能做的厂 —— 这比没有这个功能更糟。
 */

const STATUS_META: Record<
  CapacityLedgerStatus,
  { label: string; color: string; hint: string }
> = {
  AVAILABLE: {
    label: '有余量',
    color: 'success',
    hint: '负荷低于 80%，可承接外推订单',
  },
  TIGHT: {
    label: '接近满载',
    color: 'warning',
    hint: '负荷 80%~100%，接单需谨慎',
  },
  OVERLOADED: {
    label: '已超载',
    color: 'error',
    hint: '负荷超过 100%，不应再派单',
  },
  UNKNOWN: {
    label: '负载未知',
    color: 'default',
    hint: '配了产能但没有在制订单数据，无法判断余量',
  },
  UNCONFIGURED: {
    label: '未配置产能',
    color: 'default',
    hint: '未填日产能，也没有实测扫码数据 —— 请先到「工厂管理」补录日产能',
  },
};

const CapacitySourceTag: React.FC<{ source?: string }> = ({ source }) => {
  if (source === 'real') return <Tag color="blue">实测</Tag>;
  if (source === 'configured') return <Tag>配置</Tag>;
  return <Tag color="warning">未配置</Tag>;
};

const CapacityLedgerTab: React.FC = () => {
  const [rows, setRows] = useState<CapacityLedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await productionOrderApi.getCapacityLedger();
      setRows(res?.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** 汇总：这份台账最想让人看到的一句话 */
  const summary = useMemo(() => {
    const unconfigured = rows.filter((r) => r.status === 'UNCONFIGURED').length;
    const available = rows.filter((r) => r.status === 'AVAILABLE').length;
    const overloaded = rows.filter((r) => r.status === 'OVERLOADED').length;
    const freeTotal = rows.reduce(
      (s, r) => s + (r.freeCapacity30d && r.freeCapacity30d > 0 ? r.freeCapacity30d : 0),
      0
    );
    return { unconfigured, available, overloaded, freeTotal };
  }, [rows]);

  const columns = useMemo(
    () => [
      {
        title: '外发工厂',
        dataIndex: 'factoryName',
        key: 'factoryName',
        fixed: 'left' as const,
        width: 180,
        render: (v: string, r: CapacityLedgerRow) => (
          <div>
            <div>{v}</div>
            <Space size={4} style={{ marginTop: 2 }}>
              <CapacitySourceTag source={r.capacitySource} />
              {r.supplierTier ? <Tag color="gold">{r.supplierTier} 级</Tag> : null}
            </Space>
          </div>
        ),
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 130,
        render: (s: CapacityLedgerStatus) => (
          <Tooltip title={STATUS_META[s]?.hint}>
            <Tag color={STATUS_META[s]?.color}>{STATUS_META[s]?.label}</Tag>
          </Tooltip>
        ),
      },
      {
        title: '日产能(件/天)',
        dataIndex: 'effectiveDailyCapacity',
        key: 'daily',
        width: 130,
        render: (_: unknown, r: CapacityLedgerRow) =>
          r.effectiveDailyCapacity > 0 ? (
            <span>{r.effectiveDailyCapacity}</span>
          ) : (
            // 关键：没配就写「未配置」，绝不显示 0
            <Text type="secondary">未配置</Text>
          ),
      },
      {
        title: '在制',
        dataIndex: 'inProgressQuantity',
        key: 'inProgressQuantity',
        width: 110,
        render: (v: number, r: CapacityLedgerRow) => (
          <span>
            {v}
            <Text type="secondary" style={{ fontSize: 12 }}>
              {' '}
              / {r.inProgressOrders} 单
            </Text>
          </span>
        ),
      },
      {
        title: '负荷率',
        dataIndex: 'loadRate',
        key: 'loadRate',
        width: 120,
        render: (v: number | null) =>
          v == null ? (
            <Text type="secondary">—</Text>
          ) : (
            <span style={{ color: v > 100 ? 'var(--error-color, #ff4d4f)' : undefined }}>
              {v}%
            </span>
          ),
      },
      {
        title: '近30天余量',
        dataIndex: 'freeCapacity30d',
        key: 'freeCapacity30d',
        width: 130,
        render: (v: number | null) => {
          if (v == null) return <Text type="secondary">—</Text>;
          if (v < 0) return <span style={{ color: 'var(--error-color, #ff4d4f)' }}>{v}</span>;
          return <span>{v}</span>;
        },
      },
      {
        title: '品质分',
        dataIndex: 'qualityScore',
        key: 'qualityScore',
        width: 90,
        render: (v: number) => (v < 0 ? <Text type="secondary">—</Text> : v),
      },
      {
        title: '综合评分',
        dataIndex: 'overallScore',
        key: 'overallScore',
        width: 100,
        render: (v: number) => (v < 0 ? <Text type="secondary">—</Text> : v),
      },
    ],
    []
  );

  return (
    <div style={{ padding: 12 }}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="这张台账用来决定「订单该外推给谁」"
        description={
          <div style={{ fontSize: 12, lineHeight: 1.8 }}>
            · <b>未配置产能</b>的工厂不参与排序判断 —— 请先到「工厂管理」补录日产能，
            否则系统无法判断它能不能接单。
            <br />· 负荷率 = 近 30 天在制件数 ÷（日产能 × 30）。
            <br />· 这里的「近 30 天余量」只是<b>当前排产口径</b>，不是档期预留；
            真正的可接单日期需要另建工厂档期。
          </div>
        }
      />

      <Space style={{ marginBottom: 12 }} wrap>
        <Tag color="success">有余量 {summary.available}</Tag>
        <Tag color="error">已超载 {summary.overloaded}</Tag>
        <Tag color="warning">未配置产能 {summary.unconfigured}</Tag>
        <Text type="secondary">
          近 30 天可接单合计：<b>{summary.freeTotal}</b> 件
        </Text>
        <Button size="small" icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
          刷新
        </Button>
      </Space>

      {summary.unconfigured > 0 ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={`有 ${summary.unconfigured} 家外发工厂未配置日产能`}
          description="这些工厂不会出现在「可接单」判断里 —— 在补录之前，系统无法为它们背书。"
        />
      ) : null}

      <Spin spinning={loading}>
        {error ? (
          <Alert type="error" showIcon message={error} />
        ) : rows.length === 0 && !loading ? (
          <Empty description="暂无外发工厂" />
        ) : (
          <Table
            rowKey={(r) => r.factoryId || r.factoryName}
            dataSource={rows}
            columns={columns}
            size="small"
            scroll={{ x: 1100 }}
            pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 家` }}
          />
        )}
      </Spin>
    </div>
  );
};

export default CapacityLedgerTab;