import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { App, Button, Card, InputNumber, Space, Spin, Table, Typography } from 'antd';
import api from '@/utils/api';

import type { StyleBom, StyleAttachment } from '@/types/style';
import StyleAttachmentTab from './StyleAttachmentTab';
import StyleStageControlBar from './StyleStageControlBar';

const { Text } = Typography;
type PatternRowMode = 'usage' | 'spec';
type PatternMaterialRow = {
  id: string;
  bomId: string | number;
  mode: PatternRowMode;
  bom: StyleBom;
};

interface SizeColorConfigInput {
  sizes: string[];
  colors: string[];
  quantities: number[];
  commonSizes?: string[];
  commonColors?: string[];
}

interface Props {
  styleId: string | number;
  patternStatus?: string;
  patternStartTime?: string;
  patternCompletedTime?: string;
  patternAssignee?: string;
  readOnly?: boolean;
  onRefresh: () => void;
  /** 从父页面传入的颜色码数配置，用于确定各码列 */
  sizeColorConfig?: SizeColorConfigInput;
}

/** 单位为「米」的物料需要在纸样开发中录入各码用量和损耗率 */
const isMeterUnit = (unit?: string) => String(unit || '').trim() === '米';
const shouldIncludePatternMaterial = (bom: StyleBom) => {
  const unit = String(bom.unit || '').trim();
  const materialType = String(bom.materialType || '').trim().toLowerCase();
  const materialName = String(bom.materialName || '').trim();
  return isMeterUnit(unit)
    || materialType.startsWith('fabric')
    || materialType.startsWith('lining')
    || materialType.startsWith('accessory')
    || /拉链|纽扣|魔术贴|松紧|织带|绳|扣|辅料/.test(materialName);
};
const isZipperMaterial = (bom: StyleBom) => /拉链/.test(String(bom.materialName || '').trim());
const parseNumberMap = (value?: string) => {
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' ? parsed as Record<string, number> : {};
  } catch {
    return {};
  }
};

const StylePatternTab: React.FC<Props> = ({
  styleId,
  patternStatus,
  patternStartTime,
  patternCompletedTime,
  patternAssignee,
  readOnly,
  onRefresh,
  sizeColorConfig,
}) => {
  const { message } = App.useApp();
  const [_sectionKey, _setSectionKey] = useState<'files'>('files');
  const [patternFiles, setPatternFiles] = useState<StyleAttachment[]>([]);
  const [patternCheckResult, setPatternCheckResult] = useState<{ complete: boolean; missingItems: string[] } | null>(null);

  // 各码用量状态
  const [bomList, setBomList] = useState<StyleBom[]>([]);
  const [bomLoading, setBomLoading] = useState(false);
  /** { [bomId]: { [size]: value } } */
  const [usageEdits, setUsageEdits] = useState<Record<string | number, Record<string, number | null>>>({});
  /** { [bomId]: { [size]: specCm } } */
  const [specEdits, setSpecEdits] = useState<Record<string | number, Record<string, number | null>>>({});
  /** { [bomId]: lossRate } */
  const [lossEdits, setLossEdits] = useState<Record<string | number, number | null>>({});
  const [savingUsage, setSavingUsage] = useState(false);

  // 检查纸样是否齐全
  const checkPatternComplete = useCallback(async () => {
    try {
      const res = await api.get<{ code: number; data: { complete: boolean; missingItems: string[] } }>('/style/attachment/pattern/check', { params: { styleId } });
      if (res.code === 200) {
        setPatternCheckResult(res.data);
      }
    } catch {
    // Intentionally empty
      // 忽略错误
      // ignore
    }
  }, [styleId]);

  useEffect(() => {
    checkPatternComplete();
  }, [checkPatternComplete, patternFiles]);

  // 获取 BOM 列表（仅面料/里料类，用于各码用量录入）
  const fetchBomList = useCallback(async () => {
    if (!styleId) return;
    setBomLoading(true);
    try {
      const res = await api.get<StyleBom[]>(`/style/bom/list?styleId=${styleId}`);
      const list = Array.isArray(res) ? res : (res as any)?.data ?? [];
      const sortOrder = (t?: string) => {
        if (!t) return 9;
        if (t.startsWith('fabric')) return 1;
        if (t.startsWith('lining')) return 2;
        return 5;
      };
      const fabricBoms = list
        .filter((b: StyleBom) => shouldIncludePatternMaterial(b))
        .sort((a: StyleBom, b: StyleBom) => {
          const d = sortOrder(a.materialType) - sortOrder(b.materialType);
          if (d !== 0) return d;
          return String(a.materialName || '').localeCompare(String(b.materialName || ''), 'zh');
        });
      setBomList(fabricBoms);
      // 从已保存的 sizeUsageMap 和 lossRate 初始化编辑状态
      const initEdits: Record<string | number, Record<string, number | null>> = {};
      const initSpecEdits: Record<string | number, Record<string, number | null>> = {};
      const initLoss: Record<string | number, number | null> = {};
      for (const b of fabricBoms) {
        if (!b.id) continue;
        const parsed: Record<string, number | null> = {};
        const sourceMap = parseNumberMap(b.patternSizeUsageMap || b.sizeUsageMap);
        for (const [k, v] of Object.entries(sourceMap)) {
          parsed[k] = typeof v === 'number' ? v : null;
        }
        const parsedSpec: Record<string, number | null> = {};
        const sourceSpecMap = parseNumberMap(b.sizeSpecMap);
        for (const [k, v] of Object.entries(sourceSpecMap)) {
          parsedSpec[k] = typeof v === 'number' ? v : null;
        }
        initEdits[b.id] = parsed;
        initSpecEdits[b.id] = parsedSpec;
        initLoss[b.id] = b.lossRate != null ? Number(b.lossRate) : 0;
      }
      setUsageEdits(initEdits);
      setSpecEdits(initSpecEdits);
      setLossEdits(initLoss);
    } catch {
      // ignore – BOM list optional for pattern tab
    } finally {
      setBomLoading(false);
    }
  }, [styleId]);

  useEffect(() => {
    fetchBomList();
  }, [fetchBomList]);

  const locked = useMemo(() => String(patternStatus || '').trim().toUpperCase() === 'COMPLETED', [patternStatus]);
  // 未开始时禁止编辑（需先点击「开始纸样开发」）
  const notStarted = !patternStartTime && !patternCompletedTime;
  const childReadOnly = useMemo(() => Boolean(readOnly) || locked || notStarted, [readOnly, locked, notStarted]);

  const hasValidPatternFile = useMemo(() => {
    const list = Array.isArray(patternFiles) ? patternFiles : [];
    return list.some((f) => {
      const name = String((f as any)?.fileName || '').toLowerCase();
      const url = String((f as any)?.fileUrl || '').toLowerCase();
      return (
        name.endsWith('.dxf') ||
        name.endsWith('.plt') ||
        name.endsWith('.ets') ||
        url.includes('.dxf') ||
        url.includes('.plt') ||
        url.includes('.ets')
      );
    });
  }, [patternFiles]);

  // 当前有效的码数列表：优先用已选码数，兜底用常用码数
  const activeSizes = useMemo<string[]>(() => {
    if (sizeColorConfig?.sizes) {
      return sizeColorConfig.sizes.filter(Boolean);
    }
    if (sizeColorConfig?.commonSizes?.length) {
      return sizeColorConfig.commonSizes.filter(Boolean);
    }
    return [];
  }, [sizeColorConfig]);
  const handleUsageChange = useCallback((bomId: string | number, size: string, val: number | null) => {
    setUsageEdits((prev) => ({
      ...prev,
      [bomId]: { ...(prev[bomId] ?? {}), [size]: val },
    }));
  }, []);
  const handleSpecChange = useCallback((bomId: string | number, size: string, val: number | null) => {
    setSpecEdits((prev) => ({
      ...prev,
      [bomId]: { ...(prev[bomId] ?? {}), [size]: val },
    }));
  }, []);

  const handleLossChange = useCallback((bomId: string | number, val: number | null) => {
    setLossEdits((prev) => ({ ...prev, [bomId]: val }));
  }, []);

  const patternRows = useMemo<PatternMaterialRow[]>(() => bomList.flatMap((bom) => {
    const baseRow: PatternMaterialRow = { id: `${bom.id}-usage`, bomId: String(bom.id || ''), mode: 'usage', bom };
    if (!isZipperMaterial(bom)) return [baseRow];
    return [
      baseRow,
      { id: `${bom.id}-spec`, bomId: String(bom.id || ''), mode: 'spec', bom },
    ];
  }), [bomList]);

  const handleSaveUsage = useCallback(async () => {
    if (bomList.length === 0) return;
    setSavingUsage(true);
    try {
      const promises: Promise<unknown>[] = [];
      for (const bom of bomList) {
        if (!bom.id) continue;
        const edits = usageEdits[bom.id] ?? {};
        const conversionRate = Number(bom.conversionRate ?? 1) || 1;
        const mapObj: Record<string, number> = {};
        for (const [size, val] of Object.entries(edits)) {
          if (val !== null && val !== undefined && val > 0) {
            mapObj[size] = val;
          }
        }
        const specMapObj: Record<string, number> = {};
        for (const [size, val] of Object.entries(specEdits[bom.id] ?? {})) {
          if (val !== null && val !== undefined && val > 0) {
            specMapObj[size] = val;
          }
        }
        const rawMapJson = Object.keys(mapObj).length > 0 ? JSON.stringify(mapObj) : '';
        const newMapJson = rawMapJson;
        const newSpecJson = Object.keys(specMapObj).length > 0 ? JSON.stringify(specMapObj) : '';
        const currentMap = bom.sizeUsageMap ?? '';
        const currentRawMap = bom.patternSizeUsageMap ?? '';
        const currentSpecMap = bom.sizeSpecMap ?? '';
        const newLoss = lossEdits[bom.id] ?? Number(bom.lossRate ?? 0);
        const lossChanged = Number(newLoss) !== Number(bom.lossRate ?? 0);
        const sizeVals = Object.values(mapObj).filter(v => v > 0);
        const avgUsage = sizeVals.length > 0
          ? Math.round((sizeVals.reduce((a, b) => a + b, 0) / sizeVals.length) * 100) / 100
          : null;
        const usageChanged = avgUsage !== null && Number(avgUsage) !== Number(bom.usageAmount ?? 0);
        if (newMapJson !== currentMap || rawMapJson !== currentRawMap || newSpecJson !== currentSpecMap || lossChanged || usageChanged) {
          promises.push(
            api.put('/style/bom', {
              ...bom,
              sizeUsageMap: newMapJson || null,
              patternSizeUsageMap: rawMapJson || null,
              sizeSpecMap: newSpecJson || null,
              patternUnit: '米',
              conversionRate,
              lossRate: newLoss,
              ...(avgUsage !== null ? { usageAmount: avgUsage } : {}),
            })
          );
        }
      }
      if (promises.length === 0) {
        message.info('请先填写各码用量（或修改损耗率）后点击保存');
        return;
      }
      await Promise.all(promises);
      message.success('各码用量已保存');
      fetchBomList();
    } catch (e: unknown) {
      const errMsg = (e as any)?.response?.data?.message ?? (e as any)?.message ?? '保存失败';
      message.error(errMsg);
    } finally {
      setSavingUsage(false);
    }
  }, [bomList, usageEdits, specEdits, lossEdits, message, fetchBomList]);

  // 各码用量配比表格列
  const usageColumns = useMemo(() => {
    const cols: import('antd').TableColumnsType<PatternMaterialRow> = [
      {
        title: '物料名称',
        dataIndex: 'bom',
        width: 180,
        ellipsis: true,
        render: (_: unknown, record: PatternMaterialRow) => (
          <div>
            <div>{record.bom.materialName}{record.mode === 'spec' ? '（规格）' : isZipperMaterial(record.bom) ? '（数量）' : ''}</div>
            {record.bom.color && <Text type="secondary" style={{ fontSize: 12 }}>{record.bom.color}</Text>}
          </div>
        ),
      },
      {
        title: '单位',
        key: 'unit',
        width: 72,
        render: (_: unknown, record: PatternMaterialRow) => record.mode === 'spec' ? 'cm' : (record.bom.patternUnit || record.bom.unit || '-'),
      },
      {
        title: '规格/幅宽',
        key: 'specification',
        width: 120,
        render: (_: unknown, record: PatternMaterialRow) => {
          if (record.mode === 'spec') {
            return '拉链长度';
          }
          return record.bom.specification || record.bom.fabricWeight || '—';
        },
      },
      {
        title: (
          <span>
            平均值
            <br />
            <Text type="secondary" style={{ fontSize: 11 }}>(按码均值)</Text>
          </span>
        ),
        key: 'avgUsage',
        width: 90,
        render: (_: unknown, record: PatternMaterialRow) => {
          const edits = record.mode === 'spec'
            ? (specEdits[record.bomId] ?? {})
            : (usageEdits[record.bomId] ?? {});
          const vals = Object.values(edits).filter((v): v is number => v !== null && v !== undefined && (v as number) > 0);
          if (vals.length === 0) {
            if (record.mode === 'spec') return '—';
            return record.bom.usageAmount != null ? <Text type="secondary">{record.bom.usageAmount}</Text> : '—';
          }
          const avg = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
          if (record.mode === 'spec') return <Text strong>{avg}cm</Text>;
          return <Text strong>{avg}</Text>;
        },
      },
      {
        title: '损耗率(%)',
        key: 'lossRate',
        width: 100,
        render: (_: unknown, record: PatternMaterialRow) => {
          if (record.mode === 'spec') {
            return <Text type="secondary">{Number(record.bom.lossRate ?? 0)}%</Text>;
          }
          const val = lossEdits[record.bomId] ?? Number(record.bom.lossRate ?? 0);
          return (
            <InputNumber
              size="small"
              min={0}
              max={100}
              step={1}
              precision={1}
              value={val}
              onChange={(v) => handleLossChange(record.bomId, v)}
              disabled={childReadOnly}
              style={{ width: '100%' }}
            />
          );
        },
      },
    ];
    // 为每个有效码数添加一列输入
    for (const size of activeSizes) {
      cols.push({
        title: (
          <span style={{ fontWeight: 600, color: 'var(--primary-color, #1677ff)' }}>{size}</span>
        ),
        key: `size_${size}`,
        width: 80,
        render: (_: unknown, record: PatternMaterialRow) => {
          const val = record.mode === 'spec'
            ? (specEdits[record.bomId] ?? {})[size] ?? null
            : (usageEdits[record.bomId] ?? {})[size] ?? null;
          return (
            <InputNumber
              size="small"
              min={0}
              max={record.mode === 'spec' ? 999 : 99}
              step={record.mode === 'spec' ? 1 : 0.05}
              precision={2}
              value={val ?? undefined}
              onChange={(v) => (record.mode === 'spec'
                ? handleSpecChange(record.bomId, size, v)
                : handleUsageChange(record.bomId, size, v))}
              disabled={childReadOnly}
              style={{ width: '100%' }}
            />
          );
        },
      });
    }
    return cols;
  }, [activeSizes, usageEdits, specEdits, lossEdits, handleUsageChange, handleSpecChange, handleLossChange, childReadOnly]);

  return (
    <div>
      {/* 统一状态控制栏 */}
      <StyleStageControlBar
        stageName="纸样开发"
        styleId={styleId}
        apiPath="pattern"
        status={patternStatus}
        assignee={patternAssignee}
        startTime={patternStartTime}
        completedTime={patternCompletedTime}
        readOnly={readOnly}
        onRefresh={onRefresh}
        onBeforeComplete={async () => {
          if (!hasValidPatternFile) {
            message.error('请先上传纸样文件（dxf/plt/ets）');
            return false;
          }
          return true;
        }}
        extraInfo={
          <>
            {/* 纸样齐全检查提示 */}
            {patternCheckResult && !patternCheckResult.complete && (
              <span
                style={{
                  fontSize: '12px',
                  color: 'var(--color-warning)',
                  backgroundColor: '#fffbe6',
                  border: '1px solid #ffe58f',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                ⚠️ 缺少: {patternCheckResult.missingItems.join('、')}
              </span>
            )}
          </>
        }
      />

      {/* 纸样文件上传区域 */}
      <div style={{ marginTop: 16 }}>
        <StyleAttachmentTab
          styleId={styleId}
          bizType="pattern"
          uploadText="上传纸样文件"
          readOnly={childReadOnly}
          onListChange={setPatternFiles}
        />
      </div>

      {/* 各码用量配比 */}
      <Card
        size="small"
        style={{ marginTop: 16 }}
        title={
          <Space>
            <span>各码实际用量</span>
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
              纸样师傅按各码纸样测量填入，下单管理和裁剪管理将依此计算实际面辅料用量，拉链辅料也会自动带入
            </Text>
          </Space>
        }
        extra={
          !childReadOnly && activeSizes.length > 0 && (
            <Button
              type="primary"
              size="small"
              loading={savingUsage}
              onClick={handleSaveUsage}
            >
              保存各码用量
            </Button>
          )
        }
      >
        {notStarted ? (
          <Text type="secondary">请先点击「开始纸样开发」后填写各码用量</Text>
        ) : activeSizes.length === 0 ? (
          <Text type="secondary">款式未配置码数，请先在基本信息中填写码数配置</Text>
        ) : (
          <Spin spinning={bomLoading}>
            {bomList.length === 0 && !bomLoading ? (
              <Text type="secondary">BOM清单中暂无面料/里料，请先在BOM清单中添加面辅料</Text>
            ) : (
              <Table<PatternMaterialRow>
                size="small"
                rowKey={(r) => r.id}
                dataSource={patternRows}
                columns={usageColumns}
                pagination={false}
                scroll={{ x: 'max-content' }}
              />
            )}
          </Spin>
        )}
      </Card>
    </div>
  );
};

export default StylePatternTab;
