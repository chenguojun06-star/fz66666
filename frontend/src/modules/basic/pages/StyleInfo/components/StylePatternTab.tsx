import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { App, Button, Card, Input, InputNumber, Modal, Select, Space, Spin, Typography, Collapse } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import api, { type ApiResult } from '@/utils/api';
import ResizableTable from '@/components/common/ResizableTable';

import type { StyleBom, StyleAttachment } from '@/types/style';
import StyleAttachmentTab from './StyleAttachmentTab';
import StyleStageControlBar from './StyleStageControlBar';
import StyleSizeTab from './StyleSizeTab';

const { Text } = Typography;
type PatternMaterialRow = {
  id: string;
  bomId: string | number;
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
  sizeColorConfig?: SizeColorConfigInput;
  sizeAssignee?: string;
  sizeStartTime?: string;
  sizeCompletedTime?: string;
  linkedSizes?: string[];
}

const isZipperMaterial = (bom: StyleBom) => /拉链/.test(String(bom.materialName || '').trim());
const isCountLikeUnit = (unit?: string) => /^(个|套|条|只|双|粒|枚|包|张|件|根|片|台|桶|卷)$/.test(String(unit || '').trim());
const isMeterPatternMaterial = (bom: StyleBom) => {
  const unit = String(bom.unit || '').trim();
  const materialType = String(bom.materialType || '').trim().toLowerCase();
  const materialName = String(bom.materialName || '').trim();
  const specification = String(bom.specification || '').trim();
  if (isZipperMaterial(bom)) return false;
  if (unit === '米') return true;
  if (isCountLikeUnit(unit)) return false;
  return materialType.startsWith('fabric')
    || materialType.startsWith('lining')
    || /松紧|织带|绳|带|滚条|包边|魔术贴/.test(`${materialName} ${specification}`);
};
const resolvePatternUnit = (bom: StyleBom) => {
  const patternUnit = String(bom.patternUnit || '').trim();
  const bomUnit = String(bom.unit || '').trim();
  if (patternUnit && patternUnit !== '米') {
    return patternUnit;
  }
  if (isMeterPatternMaterial(bom)) {
    return '米';
  }
  return bomUnit || patternUnit || '';
};
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
  sizeAssignee,
  sizeStartTime,
  sizeCompletedTime,
  linkedSizes,
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
  /** { [bomId]: lossRate } */
  const [lossEdits, setLossEdits] = useState<Record<string | number, number | null>>({});
  const [savingUsage, setSavingUsage] = useState(false);
  const [extraSizes, setExtraSizes] = useState<string[]>([]);
  const [sizeOptions, setSizeOptions] = useState<Array<{ value: string; label: string }>>([]);

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

  // 获取 BOM 列表（与 BOM 清单保持一致顺序，纸样实际用量直接按 BOM 行录入）
  const fetchBomList = useCallback(async () => {
    if (!styleId) return;
    setBomLoading(true);
    try {
      const res = await api.get<ApiResult<StyleBom[]>>(`/style/bom/list?styleId=${styleId}`);
      const list = Array.isArray(res?.data) ? res.data : [];
      const patternBoms = list.filter((b: StyleBom) => Boolean(String(b.materialName || b.materialCode || '').trim()));
      setBomList(patternBoms);
      // 从已保存的 sizeUsageMap 和 lossRate 初始化编辑状态
      const initEdits: Record<string | number, Record<string, number | null>> = {};
      const initLoss: Record<string | number, number | null> = {};
      for (const b of patternBoms) {
        if (!b.id) continue;
        const parsed: Record<string, number | null> = {};
        const sourceMap = parseNumberMap(b.patternSizeUsageMap || b.sizeUsageMap);
        for (const [k, v] of Object.entries(sourceMap)) {
          parsed[k] = typeof v === 'number' ? v : null;
        }
        initEdits[b.id] = parsed;
        initLoss[b.id] = b.lossRate != null ? Number(b.lossRate) : 0;
      }
      setUsageEdits(initEdits);
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
  const childReadOnly = useMemo(() => Boolean(readOnly) || locked, [readOnly, locked]);


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

  const allSizes = useMemo<string[]>(
    () => [...activeSizes, ...extraSizes.filter(s => !activeSizes.includes(s))],
    [activeSizes, extraSizes],
  );

  // 从已保存的 patternSizeUsageMap 中恢复 extraSizes，确保页面刷新后用户手动添加的尺码持久化
  // 用 styleId 作为 key，每次切换款式或首次加载只恢复一次，避免覆盖用户正在编辑的状态
  const extraSizesRestoredForRef = useRef<number | string | null>(null);
  useEffect(() => {
    if (!styleId || bomList.length === 0) return;
    if (extraSizesRestoredForRef.current === styleId) return;
    const savedKeys = new Set<string>();
    for (const b of bomList) {
      const m = parseNumberMap(b.patternSizeUsageMap || b.sizeUsageMap);
      Object.keys(m).forEach(k => savedKeys.add(k));
    }
    const restored = [...savedKeys].filter(s => !activeSizes.includes(s));
    setExtraSizes(restored);
    extraSizesRestoredForRef.current = styleId;
  }, [bomList, activeSizes, styleId]);

  const handleUsageChange = useCallback((bomId: string | number, size: string, val: number | null) => {
    setUsageEdits((prev) => ({
      ...prev,
      [bomId]: { ...(prev[bomId] ?? {}), [size]: val },
    }));
  }, []);

  const handleLossChange = useCallback((bomId: string | number, val: number | null) => {
    setLossEdits((prev) => ({ ...prev, [bomId]: val }));
  }, []);

  const handleAddSizes = useCallback((values: string[]) => {
    if (!values.length) return;
    setExtraSizes(prev => [...prev, ...values.filter(v => !prev.includes(v) && !activeSizes.includes(v))]);
  }, [activeSizes]);

  const fetchSizeDictOptions = useCallback(async () => {
    try {
      const res = await api.get<{ code: number; data: { records: any[] } | any[] }>('/system/dict/list', {
        params: { dictType: 'size', page: 1, pageSize: 200 },
      });
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        const data = result.data as { records?: any[] } | any[];
        const records = Array.isArray(data) ? data : ((data as { records?: any[] })?.records || []);
        const options = (Array.isArray(records) ? records : [])
          .filter((item: any) => item.dictLabel)
          .map((item: any) => ({ value: item.dictLabel, label: item.dictLabel }));
        setSizeOptions(options);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchSizeDictOptions();
  }, [fetchSizeDictOptions]);

  const patternRows = useMemo<PatternMaterialRow[]>(
    () => bomList.map((bom) => ({ id: `${bom.id}-usage`, bomId: String(bom.id || ''), bom })),
    [bomList],
  );

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
        const rawMapJson = Object.keys(mapObj).length > 0 ? JSON.stringify(mapObj) : '';
        const newMapJson = rawMapJson;
        const currentMap = bom.sizeUsageMap ?? '';
        const currentRawMap = bom.patternSizeUsageMap ?? '';
        const newLoss = lossEdits[bom.id] ?? Number(bom.lossRate ?? 0);
        const lossChanged = Number(newLoss) !== Number(bom.lossRate ?? 0);
        const sizeVals = Object.values(mapObj).filter(v => v > 0);
        const avgUsage = sizeVals.length > 0
          ? Math.round((sizeVals.reduce((a, b) => a + b, 0) / sizeVals.length) * 100) / 100
          : null;
        const usageChanged = avgUsage !== null && Number(avgUsage) !== Number(bom.usageAmount ?? 0);
        if (newMapJson !== currentMap || rawMapJson !== currentRawMap || lossChanged || usageChanged) {
          promises.push(
            api.put('/style/bom', {
              ...bom,
              sizeUsageMap: newMapJson || null,
              patternSizeUsageMap: rawMapJson || null,
              patternUnit: resolvePatternUnit(bom) || null,
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
  }, [bomList, usageEdits, lossEdits, message, fetchBomList]);

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
            <div>{record.bom.materialName}</div>
            {record.bom.color && <Text type="secondary" style={{ fontSize: 12 }}>{record.bom.color}</Text>}
          </div>
        ),
      },
      {
        title: '单位',
        key: 'unit',
        width: 72,
        render: (_: unknown, record: PatternMaterialRow) => resolvePatternUnit(record.bom) || '-',
      },
      {
        title: '规格/幅宽',
        key: 'specification',
        width: 120,
        render: (_: unknown, record: PatternMaterialRow) => record.bom.specification || record.bom.fabricWeight || '—',
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
          const edits = usageEdits[record.bomId] ?? {};
          const vals = Object.values(edits).filter((v): v is number => v !== null && v !== undefined && (v as number) > 0);
          if (vals.length === 0) {
            return record.bom.usageAmount != null ? <Text type="secondary">{record.bom.usageAmount}</Text> : '—';
          }
          const avg = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
          return <Text strong>{avg}</Text>;
        },
      },
      {
        title: '损耗率(%)',
        key: 'lossRate',
        width: 100,
        render: (_: unknown, record: PatternMaterialRow) => {
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
    for (const size of allSizes) {
      cols.push({
        title: (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontWeight: 600, color: 'var(--primary-color, #1677ff)' }}>{size}</span>
            {!childReadOnly && extraSizes.includes(size) && (
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                title={`删除尺码 ${size}`}
                onClick={() => {
                  Modal.confirm({
                    width: '30vw',
                    title: `确定删除尺码"${size}"？`,
                    onOk: () => {
                      setExtraSizes(prev => prev.filter(s => s !== size));
                      setUsageEdits(prev => {
                        const next = { ...prev };
                        for (const bomId of Object.keys(next)) {
                          if (next[bomId] && size in next[bomId]) {
                            const { [size]: _, ...rest } = next[bomId];
                            next[bomId] = rest;
                          }
                        }
                        return next;
                      });
                    },
                  });
                }}
              />
            )}
          </span>
        ),
        key: `size_${size}`,
        width: 80,
        render: (_: unknown, record: PatternMaterialRow) => {
          const val = (usageEdits[record.bomId] ?? {})[size] ?? null;
          return (
            <InputNumber
              size="small"
              min={0}
              max={99}
              step={0.05}
              precision={2}
              value={val ?? undefined}
              onChange={(v) => handleUsageChange(record.bomId, size, v)}
              disabled={childReadOnly}
              style={{ width: '100%' }}
            />
          );
        },
      });
    }
    return cols;
  }, [allSizes, extraSizes, usageEdits, lossEdits, handleUsageChange, handleLossChange, childReadOnly]);

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
                 缺少: {patternCheckResult.missingItems.join('、')}
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

      {/* 尺寸表模块 */}
      <Collapse
        defaultActiveKey={['size']}
        style={{ marginTop: 16 }}
        items={[
          {
            key: 'size',
            label: <span style={{ fontWeight: 600 }}> 尺寸表</span>,
            children: (
              <StyleSizeTab
                styleId={styleId}
                readOnly={childReadOnly}
                sizeAssignee={sizeAssignee}
                sizeStartTime={sizeStartTime}
                sizeCompletedTime={sizeCompletedTime}
                linkedSizes={linkedSizes}
                hideStageControl
                onRefresh={onRefresh}
              />
            ),
          },
        ]}
      />

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
            <Space>
              <Select
                mode="multiple"
                allowClear
                showSearch
                placeholder="新增尺码(多选)"
                style={{ minWidth: 160 }}
                options={sizeOptions.filter(o => !allSizes.includes(o.value))}
                value={[]}
                onChange={(values: string[]) => handleAddSizes(values)}
                filterOption={(input, option) =>
                  String(option?.value || '').toLowerCase().includes(String(input || '').toLowerCase())
                }
                onSearch={(value) => {
                  // 支持自由输入：输入的尺码不在字典中时，动态追加到选项列表
                  if (value && value.trim() && !sizeOptions.some(opt => opt.value === value.trim()) && !allSizes.includes(value.trim())) {
                    setSizeOptions(prev => [...prev, { value: value.trim(), label: value.trim() }]);
                  }
                }}
                popupRender={(menu) => (
                  <>
                    {menu}
                    <div style={{ padding: '8px', borderTop: '1px solid #f0f0f0' }}>
                      <Input
                        placeholder="输入新码数后回车添加"
                        size="small"
                        onPressEnter={(e) => {
                          const input = e.target as HTMLInputElement;
                          const val = input.value.trim();
                          if (val && !allSizes.includes(val)) {
                            handleAddSizes([val]);
                            input.value = '';
                          }
                        }}
                      />
                    </div>
                  </>
                )}
              />
              <Button
                type="primary"
                size="small"
                loading={savingUsage}
                onClick={handleSaveUsage}
              >
                保存各码用量
              </Button>
            </Space>
          )
        }
      >
        {activeSizes.length === 0 ? (
          <Text type="secondary">款式未配置码数，请先在基本信息中填写码数配置</Text>
        ) : (
          <Spin spinning={bomLoading}>
            {bomList.length === 0 && !bomLoading ? (
              <Text type="secondary">BOM清单中暂无面料/里料，请先在BOM清单中添加面辅料</Text>
            ) : (
              <ResizableTable<PatternMaterialRow>
                storageKey="style-pattern-usage-table"
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
