import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Empty, InputNumber, Select, Space, Tag, Tooltip } from 'antd';
import { SettingOutlined, WarningOutlined } from '@ant-design/icons';
import AttributeGroupLibraryModal from '@/components/common/AttributeGroupLibraryModal';
import api from '@/utils/api';
import type { OrderLine } from '../types';

interface MultiColorOrderEditorProps {
  styleId: string | number | null;
  styleNo?: string | null;
  availableColors: string[];
  availableSizes: string[];
  orderLines: OrderLine[];
  totalQuantity: number;
  isMobile: boolean;
  onChange: (lines: OrderLine[]) => void;
}

interface FullAvailabilityResponse {
  code: number;
  data: {
    matrix?: Record<string, Record<string, Record<string, number>>>;
    summary?: {
      totalInProduction?: number;
      totalStock?: number;
      totalPendingSales?: number;
    };
    colors?: string[];
    sizes?: string[];
  };
}

interface AvailabilityInfo {
  inProduction: number;
  stock: number;
  pendingSales: number;
}

/**
 * D-800 销量趋势（来自真实出库台账，仅销售口径）
 *
 * ⚠️ 数据真实性约定：`hasData=false` 表示**没有销售记录**，
 * 与「有记录但当天卖了 0 件」是两回事 —— 前者必须显示「暂无数据」，
 * 绝不能画一条平的零线，否则下单人员会误判成「这款卖不动」。
 */
interface SalesTrendPoint {
  date: string;
  qty: number;
}

interface SalesTrendCell {
  totalQty?: number | null;
  recordDays?: number | null;
  hasData?: boolean;
  avgQty?: number | null;
  points?: SalesTrendPoint[];
}

interface SalesTrendBySizeColorResponse {
  code: number;
  data: {
    hasData?: boolean;
    matrix?: Record<string, Record<string, SalesTrendCell>>;
    dataRange?: string | null;
    recordCount?: number | null;
    noColorSizeReason?: string | null;
    source?: string;
  };
}

const normalizeKey = (value: unknown) => String(value || '').trim().toLowerCase();

const uniq = (values: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = String(value || '').trim();
    if (!text) continue;
    const key = normalizeKey(text);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
};

const buildComboKey = (color: string, size: string) => `${normalizeKey(color)}__${normalizeKey(size)}`;

/**
 * 迷你销量柱状趋势（D-800）
 *
 * ⚠️ 防伪造设计（与 LinkPanelParts.MiniTrendBars 同口径）：
 *  - 全部为 0 时**只画基线不画柱子** —— 0 是事实，不应被放大成「有数据的样子」；
 *  - 无销售记录（hasData=false）时根本不渲染，由调用方显示「—」；
 *  - 柱高按本组最大值归一化，避免绝对值大小影响视觉误判。
 */
const MiniSalesBars: React.FC<{ points: SalesTrendPoint[]; width?: number; height?: number }> = ({
  points,
  width = 96,
  height = 20,
}) => {
  const bars = useMemo(() => {
    if (!points || points.length === 0) return [];
    const max = Math.max(...points.map((p) => p.qty || 0), 0);
    const n = points.length;
    const barWidth = Math.max(1, width / n - 1);
    return points.map((p, i) => ({
      x: (width / n) * i,
      h: max > 0 && (p.qty || 0) > 0 ? Math.max(1.5, ((p.qty || 0) / max) * (height - 2)) : 0,
      w: barWidth,
      qty: p.qty || 0,
    }));
  }, [points, width, height]);

  const hasAny = bars.some((b) => b.h > 0);
  return (
    <svg width={width} height={height} style={{ display: 'block' }} aria-label="销量趋势">
      <line x1={0} y1={height - 1} x2={width} y2={height - 1} stroke="var(--color-border)" strokeWidth={1} />
      {hasAny && bars.map((b, i) => (
        <rect key={i} x={b.x} y={height - 1 - b.h} width={b.w} height={b.h} fill="var(--color-primary)" opacity={0.75} />
      ))}
    </svg>
  );
};

const buildLinesFromSelection = (colors: string[], sizes: string[], previousLines: OrderLine[]) => {
  if (!colors.length || !sizes.length) return [] as OrderLine[];
  const aggregated = new Map<string, OrderLine>();
  previousLines.forEach((line, index) => {
    const key = buildComboKey(line.color, line.size);
    const prev = aggregated.get(key);
    if (prev) {
      prev.quantity += Number(line.quantity) || 0;
      return;
    }
    aggregated.set(key, {
      id: String(line.id || `${Date.now()}-${index}`),
      color: String(line.color || '').trim(),
      size: String(line.size || '').trim(),
      quantity: Number(line.quantity) || 1,
    });
  });

  return colors.flatMap((color, colorIndex) => sizes.map((size, sizeIndex) => {
    const key = buildComboKey(color, size);
    const matched = aggregated.get(key);
    return matched || {
      id: `${Date.now()}-${colorIndex}-${sizeIndex}`,
      color,
      size,
      quantity: 1,
    };
  }));
};

const MultiColorOrderEditor: React.FC<MultiColorOrderEditorProps> = ({
  styleId,
  styleNo,
  availableColors,
  availableSizes,
  orderLines,
  totalQuantity,
  isMobile,
  onChange,
}) => {
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  // D-206：基础属性库——颜色/码数成组选择（与样衣开发同组件）
  const [attrLibOpen, setAttrLibOpen] = useState(false);
  // attrLibTarget 只用于打开弹层时区分来源（读取处用 handleApplyAttrGroup 的 groupKey），
  // 故只保留 setter，避免 ESLint 未使用变量报错
  const [, setAttrLibTarget] = useState<'color' | 'size'>('size');
  const handleApplyAttrGroup = (groupKey: string, values: string[], mode: 'replace' | 'append') => {
    const incoming = values.map((v) => String(v || '').trim()).filter(Boolean);
    if (!incoming.length) return;
    if (groupKey === 'color') {
      const base = mode === 'replace' ? [] : selectedColors;
      syncSelection(Array.from(new Set([...base, ...incoming])), selectedSizes);
    } else {
      const base = mode === 'replace' ? [] : selectedSizes;
      syncSelection(selectedColors, Array.from(new Set([...base, ...incoming])));
    }
  };
  const [quickFillQty, setQuickFillQty] = useState<number>(1);
  const [availabilityMatrix, setAvailabilityMatrix] = useState<Record<string, Record<string, AvailabilityInfo>>>({});
  const [summary, setSummary] = useState<{ inProduction: number; stock: number; pendingSales: number } | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  // D-800：销量趋势（真实出库台账）。matrix 里没有的色码 = 无销售记录 → 显示「—」
  const [salesTrendMatrix, setSalesTrendMatrix] = useState<Record<string, Record<string, SalesTrendCell>>>({});
  const [salesTrendMeta, setSalesTrendMeta] = useState<{ hasData: boolean; dataRange: string | null; reason: string | null }>(
    { hasData: false, dataRange: null, reason: null },
  );
  const [styleNoForTrend, setStyleNoForTrend] = useState<string>('');
  const [trendExpanded, setTrendExpanded] = useState(false);

  // 查询综合可用性（在途+库存+欠数）
  useEffect(() => {
    if (!styleId) {
      setAvailabilityMatrix({});
      setSummary(null);
      return;
    }
    let cancelled = false;
    setAvailabilityLoading(true);
    api.get<FullAvailabilityResponse>(`/order-management/full-availability`, {
      params: { styleId: String(styleId) },
    }).then((res) => {
      if (cancelled) return;
      if (res.code === 200 && res.data) {
        // 对 matrix 做 key 归一化（颜色/尺码大小写、空格差异）
        const normalized: Record<string, Record<string, AvailabilityInfo>> = {};
        const rawMatrix = res.data.matrix || {};
        Object.entries(rawMatrix).forEach(([color, sizes]) => {
          const ck = normalizeKey(color);
          normalized[ck] = normalized[ck] || {};
          Object.entries(sizes).forEach(([size, info]) => {
            const sk = normalizeKey(size);
            normalized[ck][sk] = normalized[ck][sk] || { inProduction: 0, stock: 0, pendingSales: 0 };
            const rawInfo = info as Record<string, number>;
            normalized[ck][sk].inProduction += rawInfo.inProduction || 0;
            normalized[ck][sk].stock += rawInfo.stock || 0;
            normalized[ck][sk].pendingSales += rawInfo.pendingSales || 0;
          });
        });
        setAvailabilityMatrix(normalized);
        const s = res.data.summary || {};
        setSummary({
          inProduction: s.totalInProduction || 0,
          stock: s.totalStock || 0,
          pendingSales: s.totalPendingSales || 0,
        });
      }
    }).catch(() => {
      if (cancelled) return;
      setAvailabilityMatrix({});
      setSummary(null);
    }).finally(() => {
      if (!cancelled) setAvailabilityLoading(false);
    });
    return () => { cancelled = true; };
  }, [styleId]);

  // D-800：查询色码级销量趋势（默认收起，不干扰正常下单；用户需要时再展开）
  useEffect(() => {
    if (!styleNo) {
      setSalesTrendMatrix({});
      setSalesTrendMeta({ hasData: false, dataRange: null, reason: null });
      return;
    }
    let cancelled = false;
    api.get<SalesTrendBySizeColorResponse>('/order-management/sales-trend-by-size-color', {
      params: { styleNo, days: 30 },
    }).then((res) => {
      if (cancelled) return;
      if (res.code === 200 && res.data) {
        const normalized: Record<string, Record<string, SalesTrendCell>> = {};
        Object.entries(res.data.matrix || {}).forEach(([color, sizes]) => {
          const ck = normalizeKey(color);
          normalized[ck] = normalized[ck] || {};
          Object.entries(sizes).forEach(([size, cell]) => {
            normalized[ck][normalizeKey(size)] = cell as SalesTrendCell;
          });
        });
        setSalesTrendMatrix(normalized);
        setSalesTrendMeta({
          hasData: !!res.data.hasData,
          dataRange: res.data.dataRange ?? null,
          reason: res.data.noColorSizeReason ?? null,
        });
      } else {
        setSalesTrendMatrix({});
        setSalesTrendMeta({ hasData: false, dataRange: null, reason: null });
      }
    }).catch(() => {
      if (cancelled) return;
      // 查询失败：显示「暂无数据」，不保留上一次款式的趋势，避免张冠李戴
      setSalesTrendMatrix({});
      setSalesTrendMeta({ hasData: false, dataRange: null, reason: null });
    });
    return () => { cancelled = true; };
  }, [styleNo]);

  useEffect(() => { setStyleNoForTrend(styleNo || ''); }, [styleNo]);

  const getAvailability = (color: string, size: string): AvailabilityInfo => {
    const byColor = availabilityMatrix[normalizeKey(color)];
    if (!byColor) return { inProduction: 0, stock: 0, pendingSales: 0 };
    return byColor[normalizeKey(size)] || { inProduction: 0, stock: 0, pendingSales: 0 };
  };
  const optionSignature = useMemo(
    () => `${availableColors.map((item) => normalizeKey(item)).join('|')}::${availableSizes.map((item) => normalizeKey(item)).join('|')}`,
    [availableColors, availableSizes],
  );
  const optionSignatureRef = useRef(optionSignature);
  const hasSyncedFromLines = useRef(false);

  // 只在 orderLines 首次有数据时同步颜色和尺码（编辑已有订单场景），
  // 后续数量变化不应反向影响已选颜色/尺码
  useEffect(() => {
    if (hasSyncedFromLines.current) return;
    const nextColors = uniq(orderLines.map((line) => line.color).filter(Boolean));
    const nextSizes = uniq(orderLines.map((line) => line.size).filter(Boolean));
    if (nextColors.length || nextSizes.length) {
      setSelectedColors(nextColors);
      setSelectedSizes(nextSizes);
      hasSyncedFromLines.current = true;
    }
  }, [orderLines]);

  // 款式切换时清空颜色和尺码
  useEffect(() => {
    if (optionSignatureRef.current !== optionSignature) {
      optionSignatureRef.current = optionSignature;
      setSelectedColors([]);
      setSelectedSizes([]);
      hasSyncedFromLines.current = false;
    }
  }, [optionSignature]);

  const matrixRows = useMemo(() => {
    return selectedColors.map((color) => ({
      key: color,
      color,
      total: orderLines
        .filter((line) => normalizeKey(line.color) === normalizeKey(color))
        .reduce((sum, line) => sum + (Number(line.quantity) || 0), 0),
    }));
  }, [orderLines, selectedColors]);

  const sizeTotals = useMemo(() => {
    return selectedSizes.reduce<Record<string, number>>((acc, size) => {
      acc[size] = orderLines
        .filter((line) => normalizeKey(line.size) === normalizeKey(size))
        .reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
      return acc;
    }, {});
  }, [orderLines, selectedSizes]);

  const syncSelection = (colors: string[], sizes: string[]) => {
    setSelectedColors(colors);
    setSelectedSizes(sizes);
    if (colors.length === 0 || sizes.length === 0) {
      onChange([]);
      return;
    }
    const newLines = buildLinesFromSelection(colors, sizes, orderLines);
    onChange(newLines);
  };

  const updateMatrixQty = (color: string, size: string, quantity: number) => {
    const normalizedQty = Math.max(0, Number(quantity) || 0);
    const targetKey = buildComboKey(color, size);
    const matched = orderLines.find((line) => buildComboKey(line.color, line.size) === targetKey);
    if (matched) {
      if (normalizedQty <= 0) {
        onChange(orderLines.filter((line) => buildComboKey(line.color, line.size) !== targetKey));
        return;
      }
      onChange(orderLines.map((line) => (
        buildComboKey(line.color, line.size) === targetKey
          ? { ...line, quantity: normalizedQty }
          : line
      )));
      return;
    }
    if (normalizedQty <= 0) return;
    onChange([
      ...orderLines,
      { id: `${Date.now()}-${Math.random()}`, color, size, quantity: normalizedQty },
    ]);
  };

  const applyQuickFill = (quantity: number) => {
    const normalizedQty = Math.max(1, Number(quantity) || 1);
    onChange(buildLinesFromSelection(selectedColors, selectedSizes, orderLines).map((line) => ({
      ...line,
      quantity: normalizedQty,
    })));
  };

  return (
    <div>
      <div className="u-d-flex u-jc-between u-gap-12 u-ai-center u-mb-12 u-fwrap-wrap">
        <div className="u-d-flex u-gap-6 u-fwrap-wrap">
<Tag style={{ marginInlineEnd: 0, color: 'var(--color-primary)', background: 'var(--status-processing-bg)', borderColor: 'var(--status-processing-border)' }}>开发色 {availableColors.length}</Tag>
              <Tag style={{ marginInlineEnd: 0, color: 'var(--color-primary)', background: 'var(--status-processing-bg)', borderColor: 'var(--status-processing-border)' }}>开发码 {availableSizes.length}</Tag>
              <Tag style={{ marginInlineEnd: 0, color: 'var(--color-primary)', background: 'var(--status-processing-bg)', borderColor: 'var(--status-processing-border)' }}>已选 {selectedColors.length} 色 / {selectedSizes.length} 码</Tag>
              <Tag style={{ marginInlineEnd: 0, color: 'var(--color-primary)', background: 'var(--status-processing-bg)', borderColor: 'var(--status-processing-border)' }}>组合 {orderLines.length}</Tag>
        </div>
        <div style={{ color: 'var(--neutral-text-light)' }}>
          总数量：<span className="u-fw-600">{totalQuantity}</span>
        </div>
      </div>
      <div className="u-d-flex u-gap-8 u-fwrap-wrap u-mb-10" style={{ color: 'var(--color-text-tertiary)' }}>
        <span>开发颜色：{availableColors.join(' / ') || '-'}</span>
        <span>可手动加色</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <Select
          mode="tags"
          placeholder="选择或输入下单颜色"
          value={selectedColors}
          options={availableColors.map((value) => ({ label: value, value }))}
          onChange={(values) => syncSelection(uniq(values as string[]), selectedSizes)}
          maxTagCount="responsive"
          suffix={(
            <Tooltip title="基础属性库——成组选择颜色">
              <SettingOutlined
                style={{ color: 'rgba(0,0,0,0.45)', cursor: 'pointer' }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAttrLibTarget('color'); setAttrLibOpen(true); }}
              />
            </Tooltip>
          )}
        />
        <Select
          mode="tags"
          placeholder="选择或输入下单码数"
          value={selectedSizes}
          options={availableSizes.map((value) => ({ label: value, value }))}
          onChange={(values) => syncSelection(selectedColors, uniq(values as string[]))}
          maxTagCount="responsive"
          suffix={(
            <Tooltip title="基础属性库——成组选择码数">
              <SettingOutlined
                style={{ color: 'rgba(0,0,0,0.45)', cursor: 'pointer' }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAttrLibTarget('size'); setAttrLibOpen(true); }}
              />
            </Tooltip>
          )}
        />
      </div>
      <AttributeGroupLibraryModal
        open={attrLibOpen}
        onClose={() => setAttrLibOpen(false)}
        onApply={handleApplyAttrGroup}
      />

      <Space size={8} style={{ marginBottom: 12 }}>
        <Button onClick={() => syncSelection(availableColors, selectedSizes)}>全选颜色</Button>
        <Button onClick={() => syncSelection(selectedColors, availableSizes)}>全选码数</Button>
        <Button onClick={() => syncSelection([], [])}>清空</Button>
        <InputNumber min={1} value={quickFillQty} onChange={(value) => setQuickFillQty(Math.max(1, Number(value) || 1))} />
        <Button type="primary" ghost onClick={() => applyQuickFill(quickFillQty)}>全部铺量</Button>
        {/* D-800：销量趋势开关。默认收起，避免干扰正常下单；需要决策时才展开 */}
        <Button
          type={trendExpanded ? 'primary' : 'default'}
          onClick={() => setTrendExpanded((v) => !v)}
        >
          {trendExpanded ? '收起销量趋势' : '查看销量趋势'}
        </Button>
      </Space>

      {trendExpanded ? (
        <div
          className="u-fs-12 u-mb-8 u-p-8"
          style={{
            background: 'var(--color-bg-subtle)',
            border: '1px solid var(--color-border-light)',
            borderRadius: 4,
            color: 'var(--color-text-secondary)',
          }}
        >
          <strong>销量趋势（近30天，来自真实出库台账）</strong>
          <div className="u-mt-4">
            {styleNoForTrend ? (
              salesTrendMeta.hasData ? (
                <>数据区间：{salesTrendMeta.dataRange || '—'}。每格下方柱状图为该色码逐日出库量，悬停可看累计件数。</>
              ) : (
                <>
                  该款式暂无可用的销售出库记录
                  {salesTrendMeta.reason ? `（${salesTrendMeta.reason}）` : ''}
                  ，单元格显示「—」表示<b>没有销售数据</b>，而非「销量为零」。
                </>
              )
            ) : (
              '请先选择款式'
            )}
          </div>
        </div>
      ) : null}

      {(summary && (summary.inProduction > 0 || summary.stock > 0 || summary.pendingSales > 0)) || availabilityLoading ? (
        <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 6, background: summary && (summary.inProduction > 0 || summary.pendingSales > 0) ? 'var(--status-warning-bg)' : 'var(--color-bg-container)', border: `1px solid ${summary && (summary.inProduction > 0 || summary.pendingSales > 0) ? 'var(--status-warning-border)' : 'var(--color-border-light)'}`, color: 'var(--color-warning-deep)' }}>
          {availabilityLoading ? (
            <span>正在查询该款式的在途、库存、销售欠数...</span>
          ) : summary ? (
            <span>
              <WarningOutlined /> 该款式当前：
              {summary.inProduction > 0 && <strong className="u-fs-15">在途 {summary.inProduction}</strong>}
              {summary.stock > 0 && <strong className="u-fs-15 u-ml-8">库存 {summary.stock}</strong>}
              {summary.pendingSales > 0 && <strong className="u-fs-15 u-ml-8" style={{ color: 'var(--color-error)' }}>欠数 {summary.pendingSales}</strong>}
              ，请合理安排本次下单数量
            </span>
          ) : null}
        </div>
      ) : null}

      {!selectedColors.length || !selectedSizes.length ? (
        <div className="u-br-8" style={{ border: '1px dashed var(--color-border-antd)', padding: '24px 12px', background: 'var(--color-bg-container)' }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="先选颜色和码数" />
        </div>
      ) : (
        <div className="u-br-8 u-ov-auto u-w-full" style={{ border: '1px solid var(--color-border-light)' }}>
          <table className="u-w-full" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th className="u-ta-left" style={{ padding: '8px 6px', borderBottom: '1px solid var(--color-border-light)', background: 'var(--color-bg-container)', width: '15%' }}>颜色</th>
                {selectedSizes.map((size) => (
                  <th key={size} style={{ textAlign: 'center', padding: '8px 2px', borderBottom: '1px solid var(--color-border-light)', background: 'var(--color-bg-container)', width: `${70 / selectedSizes.length}%` }}>{size}</th>
                ))}
                <th className="u-ta-center" style={{ padding: '8px 4px', borderBottom: '1px solid var(--color-border-light)', background: 'var(--color-bg-container)', width: '15%' }}>小计</th>
              </tr>
            </thead>
            <tbody>
              {matrixRows.map((row) => (
                <tr key={row.key}>
                  <td className="u-fw-600 u-ov-hidden u-ws-nowrap" style={{ padding: '6px 6px', borderBottom: '1px solid var(--color-bg-subtle)', textOverflow: 'ellipsis' }}>{row.color}</td>
                  {selectedSizes.map((size) => {
                    const matched = orderLines.find((line) => buildComboKey(line.color, line.size) === buildComboKey(row.color, size));
const avail = getAvailability(row.color, size);
                    const hasInfo = avail.inProduction > 0 || avail.stock > 0 || avail.pendingSales > 0;
                    // D-800：该色码没有销售流水时 trendCell 为 undefined —— 显示「—」而不是零线
                    const trendCell = trendExpanded
                      ? salesTrendMatrix[normalizeKey(row.color)]?.[normalizeKey(size)]
                      : undefined;
                    return (
                      <td key={`${row.key}-${size}`} style={{ padding: 2, borderBottom: '1px solid var(--color-bg-subtle)' }}>
                        <div className="u-d-flex u-fd-column" style={{ gap: 2 }}>
                          <InputNumber
                            min={0}
                            value={matched?.quantity || 0}
                            style={{ width: '100%' }}
                            controls={false}
                            
                            onChange={(value) => updateMatrixQty(row.color, size, Number(value) || 0)}
                          />
                          {hasInfo ? (
                            <div className="u-fs-11 u-ta-center u-d-flex u-gap-4 u-jc-center" style={{ lineHeight: 1.4 }}>
                              {avail.inProduction > 0 && <span style={{ color: 'var(--color-warning-deep)' }}>在途{avail.inProduction}</span>}
                              {avail.stock > 0 && <span style={{ color: 'var(--color-success)' }}>库存{avail.stock}</span>}
                              {avail.pendingSales > 0 && <span style={{ color: 'var(--color-error)' }}>欠{avail.pendingSales}</span>}
                            </div>
                          ) : null}
                          {trendExpanded && (
                            <div className="u-ta-center" style={{ lineHeight: 1.2 }}>
                              {trendCell && trendCell.hasData && trendCell.points && trendCell.points.length > 0 ? (
                                <Tooltip
                                  title={`近30天累计售出 ${trendCell.totalQty ?? 0} 件，出库台账记录 ${trendCell.recordDays ?? 0} 天`}
                                >
                                  <span><MiniSalesBars points={trendCell.points} /></span>
                                </Tooltip>
                              ) : (
                                <span className="u-fs-11" style={{ color: 'var(--color-text-tertiary)' }} title="该色码近30天没有销售出库记录">—</span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                  <td className="u-ta-center u-fw-600" style={{ padding: '6px 6px', borderBottom: '1px solid var(--color-bg-subtle)' }}>{row.total}</td>
                </tr>
              ))}
              <tr>
                <td className="u-fw-700" style={{ padding: '6px 6px', background: 'var(--color-bg-container)' }}>码数合计</td>
                {selectedSizes.map((size) => (
                  <td key={`total-${size}`} className="u-ta-center u-fw-700" style={{ padding: '6px 2px', background: 'var(--color-bg-container)' }}>
                    {sizeTotals[size] || 0}
                  </td>
                ))}
                <td className="u-ta-center u-fw-700" style={{ padding: '6px 6px', background: 'var(--color-bg-container)' }}>{totalQuantity}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default MultiColorOrderEditor;
