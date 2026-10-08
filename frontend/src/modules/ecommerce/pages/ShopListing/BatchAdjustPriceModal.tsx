import React, { useState } from 'react';
import {
  Alert, Button, Divider, InputNumber, Modal, Radio, Space, Table, Tag, Typography,
} from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import shopAdminApi, { type BatchPricePreview, type BatchPriceItem } from '@/services/shop/shopApi';

const { Text } = Typography;

export type BatchPriceMode = 'SET' | 'PERCENT_ADJUST';

type Props = {
  open: boolean;
  /** 已勾选的款式 id */
  styleIds: number[];
  /** id → 款号，用于结果可读性 */
  styleNoOf: (id: number) => string;
  onCancel: () => void;
  /** 执行成功后通知父级刷新 */
  onDone: () => void;
};

const money = (v?: number | null) => (v == null ? '—' : `¥${Number(v).toFixed(2)}`);

/**
 * D-769：跨款式批量调价。
 *
 * <p>核心是**两阶段**：先试算（dryRun）把「会变成亏损的款」摆出来，
 * 运营确认后才真正执行。批量动钱一旦出错，只能靠反查日志回滚，
 * 代价远高于多点一次确认。
 *
 * <p>「会不会亏」用保守口径（调后最低售价 − 最高成本），
 * 与列表的「毛利(保守)」列保持一致，避免两处结论打架。
 */
export function BatchAdjustPriceModal({ open, styleIds, styleNoOf, onCancel, onDone }: Props) {
  const [mode, setMode] = useState<BatchPriceMode>('PERCENT_ADJUST');
  const [value, setValue] = useState<number | null>(10);
  const [preview, setPreview] = useState<BatchPricePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => {
    setPreview(null);
    setErr(null);
    setLoading(false);
    setApplying(false);
  };

  const runPreview = async () => {
    setErr(null);
    if (value == null || Number.isNaN(value)) {
      setErr('请输入调价数值');
      return;
    }
    setLoading(true);
    try {
      const res = await shopAdminApi.batchAdjustPrice({
        styleIds, mode, value: value as number, dryRun: true,
      });
      setPreview(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '试算失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    setApplying(true);
    setErr(null);
    try {
      const res = await shopAdminApi.batchAdjustPrice({
        styleIds, mode, value: value as number, dryRun: false,
      });
      reset();
      onDone();
      return res;
    } catch (e) {
      setErr(e instanceof Error ? e.message : '执行失败，请稍后重试');
      return null;
    } finally {
      setApplying(false);
    }
  };

  const lossItems = (preview?.items ?? []).filter((i) => i.becomesLoss);
  const unknownCostItems = (preview?.items ?? []).filter((i) => !i.costKnown);

  const columns = [
    {
      title: '款式',
      dataIndex: 'styleId',
      width: 130,
      render: (_: unknown, r: BatchPriceItem) => styleNoOf(Number(r.styleId)) || `#${r.styleId}`,
    },
    { title: 'SKU 数', dataIndex: 'skuCount', width: 80 },
    {
      title: '调前售价',
      width: 150,
      render: (_: unknown, r: BatchPriceItem) =>
        r.oldMinPrice != null && r.oldMaxPrice != null && r.oldMinPrice !== r.oldMaxPrice
          ? `${money(r.oldMinPrice)} ~ ${money(r.oldMaxPrice)}`
          : money(r.oldMinPrice ?? r.oldMaxPrice),
    },
    {
      title: '调后售价',
      width: 150,
      render: (_: unknown, r: BatchPriceItem) =>
        r.newMinPrice != null && r.newMaxPrice != null && r.newMinPrice !== r.newMaxPrice
          ? `${money(r.newMinPrice)} ~ ${money(r.newMaxPrice)}`
          : money(r.newMinPrice ?? r.newMaxPrice),
    },
    {
      title: '影响',
      width: 150,
      render: (_: unknown, r: BatchPriceItem) => {
        if (!r.costKnown) return <Tag>成本未维护，无法评估</Tag>;
        if (r.becomesLoss) return <Tag color="error">将转为亏损</Tag>;
        if (r.oldProfit != null && r.newProfit != null) {
          const delta = Number(r.newProfit) - Number(r.oldProfit);
          return (
            <Text type={delta >= 0 ? 'success' : 'danger'}>
              毛利 {money(r.oldProfit)} → {money(r.newProfit)}
            </Text>
          );
        }
        return <Text type="secondary">—</Text>;
      },
    },
  ];

  return (
    <Modal
      open={open}
      title={`批量调价（已选 ${styleIds.length} 款）`}
      onCancel={() => { reset(); onCancel(); }}
      width={900}
      footer={[
        <Button key="cancel" onClick={() => { reset(); onCancel(); }}>取消</Button>,
        preview ? (
          <Button key="apply" type="primary" danger loading={applying} onClick={apply}>
            确认执行 {preview.styleCount} 款 / {preview.skuCount} 个 SKU
          </Button>
        ) : (
          <Button key="preview" type="primary" loading={loading} onClick={runPreview}>
            试算（先看影响再改价）
          </Button>
        ),
      ]}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="批量调价直接改动售价，请先试算确认影响"
          description="试算只读不落库，会逐款列出调前/调后售价与毛利变化，并标出将转为亏损的款式。"
        />

        <Space wrap>
          <Radio.Group
            value={mode}
            onChange={(e) => { setMode(e.target.value as BatchPriceMode); setPreview(null); }}
            optionType="button"
            options={[
              { label: '按百分比调整', value: 'PERCENT_ADJUST' },
              { label: '统一设为', value: 'SET' },
            ]}
          />
          <InputNumber
            value={value}
            onChange={(v) => { setValue(v as number | null); setPreview(null); }}
            min={mode === 'PERCENT_ADJUST' ? -100 : 0.01}
            max={mode === 'PERCENT_ADJUST' ? 100 : undefined}
            step={mode === 'PERCENT_ADJUST' ? 1 : 1}
            addonAfter={mode === 'PERCENT_ADJUST' ? '%' : '元'}
            style={{ width: 160 }}
            placeholder={mode === 'PERCENT_ADJUST' ? '如 10 表示涨价10%，-5 表示降价5%' : '所有 SKU 统一设为该售价'}
          />
        </Space>

        <Text type="secondary" style={{ fontSize: 12 }}>
          {mode === 'PERCENT_ADJUST'
            ? '百分比调整会跳过「原价未设置」的 SKU（不猜它该是多少）；未维护成本的款式无法评估盈亏，但售价照改。'
            : '统一设售价会把所有 SKU（含原价未设置的）都改成该价格。'}
        </Text>

        {err ? <Alert type="error" showIcon message={err} /> : null}

        {preview ? (
          <>
            {lossItems.length > 0 ? (
              <Alert
                type="warning"
                showIcon
                icon={<WarningOutlined />}
                message={`有 ${lossItems.length} 款将转为亏损`}
                description={
                  <span>
                    涉及：{lossItems.slice(0, 8).map((i) => styleNoOf(Number(i.styleId))).join('、')}
                    {lossItems.length > 8 ? ' 等' : ''}。
                    判断口径与列表「毛利(保守)」列一致（调后最低售价 − 最高成本）。
                  </span>
                }
              />
            ) : null}
            {unknownCostItems.length > 0 ? (
              <Alert
                type="info"
                showIcon
                message={`有 ${unknownCostItems.length} 款未维护成本，无法评估盈亏`}
                description="这些款式的售价会照改，但无法判断是否赚钱，建议先补成本。"
              />
            ) : null}
            <Divider style={{ margin: '4px 0' }} />
            <Table
              size="small"
              rowKey="styleId"
              columns={columns as never}
              dataSource={preview.items}
              pagination={{ pageSize: 8, hideOnSinglePage: true }}
            />
          </>
        ) : null}
      </Space>
    </Modal>
  );
}

export default BatchAdjustPriceModal;