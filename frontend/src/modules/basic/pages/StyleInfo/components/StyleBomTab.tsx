import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Form, Modal, Tag, Upload, Tooltip } from 'antd';
import { BulbOutlined, DeleteOutlined, HistoryOutlined, InboxOutlined, PlusOutlined } from '@ant-design/icons';
import type { UploadFile, UploadProps } from 'antd/es/upload/interface';
import { StyleBom } from '@/types/style';
import api from '@/utils/api';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import ResizableTable from '@/components/common/ResizableTable';
import { isSupervisorOrAboveUser, useUser } from '@/utils/AuthContext';
import { getMaterialSortWeight } from '@/utils/materialType';
import StyleStageControlBar from './StyleStageControlBar';
import useStyleBomActions from './hooks/useStyleBomActions';
import { useBomColumns } from './hooks/useBomColumns';
import useStyleBomEditing from './hooks/useStyleBomEditing';
import useStyleBomData from './hooks/useStyleBomData';
import useStyleBomMaterials from './hooks/useStyleBomMaterials';
import useStyleBomMutations from './hooks/useStyleBomMutations';
import type { MaterialType } from './hooks/useBomColumns';
import StyleBomMaterialModal from './styleBom/StyleBomMaterialModal';
import StyleBomSizeColorSummary from './styleBom/StyleBomSizeColorSummary';
import StyleBomToolbar from './styleBom/StyleBomToolbar';

interface Props {
  styleId: string | number;
  readOnly?: boolean;
  bomAssignee?: string;
  bomStartTime?: string;
  bomCompletedTime?: string;
  onRefresh?: () => void | Promise<void>;
  sizeColorConfig?: {
    sizes?: string[];
    colors?: string[];
    matrixRows?: Array<{ color: string; quantities: number[]; imageUrl?: string }>;
  };
}

// AI 智能识别的物料条目
interface AiBomRecognizedItem {
  id: string;
  sourceImageUrl?: string;
  materialName: string;
  materialCode?: string;
  specification?: string;
  usageAmount?: number;
  rawText?: string;
  createdAt: number;
  joined?: boolean;
}

const normalizeUniqueValues = (values?: string[]) => Array.from(
  new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))
);

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
  const unit = String(bom.unit || '').trim();
  if (patternUnit && patternUnit !== '米') {
    return patternUnit;
  }
  if (isMeterPatternMaterial(bom)) {
    return '米';
  }
  return unit || patternUnit || '';
};

const sortBomRows = (rows: StyleBom[]) => {
  const list = Array.isArray(rows) ? [...rows] : [];
  list.sort((a, b) => {
    const wa = getMaterialSortWeight((a as Record<string, unknown>)?.materialType);
    const wb = getMaterialSortWeight((b as Record<string, unknown>)?.materialType);
    if (wa !== wb) return wa - wb;

    const codeA = String((a as Record<string, unknown>)?.materialCode || '').trim();
    const codeB = String((b as Record<string, unknown>)?.materialCode || '').trim();
    if (codeA && codeB && codeA !== codeB) {
      return codeA.localeCompare(codeB, 'zh-CN');
    }

    const nameA = String((a as Record<string, unknown>)?.materialName || '').trim();
    const nameB = String((b as Record<string, unknown>)?.materialName || '').trim();
    if (nameA !== nameB) {
      return nameA.localeCompare(nameB, 'zh-CN');
    }

    return String((a as Record<string, unknown>)?.id || '').localeCompare(String((b as Record<string, unknown>)?.id || ''), 'zh-CN');
  });
  return list;
};

const StyleBomTab: React.FC<Props> = ({
  styleId,
  readOnly,
  bomAssignee,
  bomStartTime,
  bomCompletedTime,
  onRefresh,
  sizeColorConfig,
}) => {
  const { user } = useUser();
  const { message } = App.useApp();
  const [editingKey, setEditingKey] = useState('');
  const [tableEditable, setTableEditable] = useState(false);
  const [form] = Form.useForm();
  const [bomTemplateId, setBomTemplateId] = useState<string | undefined>(undefined);

  const activeSizes = normalizeUniqueValues(sizeColorConfig?.sizes);
  const activeColors = normalizeUniqueValues(sizeColorConfig?.colors);
  const parseNumberMap = useCallback((value?: string) => {
    try {
      const parsed = JSON.parse(String(value || '{}'));
      return parsed && typeof parsed === 'object' ? parsed as Record<string, number> : {};
    } catch {
      return {};
    }
  }, []);
  const extractSpecLength = useCallback((value?: string) => {
    const matched = String(value || '').match(/(\d+(?:\.\d+)?)/);
    return matched ? Number(matched[1]) : 0;
  }, []);
  const buildSizeUsageMap = useCallback((usageAmount: number, existing?: string) => {
    const parsed = parseNumberMap(existing);
    if (!activeSizes.length) return existing || '';
    return JSON.stringify(
      Object.fromEntries(activeSizes.map((size) => [size, Number(parsed[size] ?? usageAmount ?? 0)]))
    );
  }, [activeSizes, parseNumberMap]);
  const buildSizeSpecMap = useCallback((specification?: string, existing?: string) => {
    const parsed = parseNumberMap(existing);
    const defaultSpec = extractSpecLength(specification);
    if (!activeSizes.length) return existing || '';
    return JSON.stringify(
      Object.fromEntries(activeSizes.map((size) => [size, Number(parsed[size] ?? defaultSpec ?? 0)]))
    );
  }, [activeSizes, extractSpecLength, parseNumberMap]);

  const [checkingStock, setCheckingStock] = useState(false);

  const [aiBomRecognized, setAiBomRecognized] = useState<AiBomRecognizedItem[]>([]);
  const [aiBomModalOpen, setAiBomModalOpen] = useState(false);
  const [aiBomImagePreviewUrl, setAiBomImagePreviewUrl] = useState<string | undefined>(undefined);
  const [aiBomLoading, setAiBomLoading] = useState(false);
  const [aiBomFallbackMessage, setAiBomFallbackMessage] = useState<string>('');

  const locked = Boolean(readOnly);

  const isSupervisorOrAbove = isSupervisorOrAboveUser(user);

  const isTempId = (id: any) => {
    if (typeof id === 'string') return id.startsWith('tmp_');
    if (typeof id === 'number') return id < 0;
    return false;
  };

  const calcTotalPrice = (item: Partial<StyleBom>) => {
    // 与单件用量列显示逻辑保持一致：
    // 无纸样数据时，有效用量 = devUsageAmount（开发采购用量）；有纸样数据时用 usageAmount
    const hasPatternData = (() => {
      try { return item.patternSizeUsageMap ? Object.keys(JSON.parse(item.patternSizeUsageMap as string)).length > 0 : false; } catch { return false; }
    })();
    const effectiveUsage = hasPatternData
      ? (Number(item.usageAmount) || 0)
      : (Number(item.devUsageAmount) || Number(item.usageAmount) || 0);
    const lossRate = Number(item.lossRate) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    // 精度控制：先对含损耗的用量做4位小数舍入，再计算总价，避免浮点精度污染
    const roundedUsage = Math.round(effectiveUsage * (1 + lossRate / 100) * 10000) / 10000;
    return Number((roundedUsage * unitPrice).toFixed(2));
  };

  const {
    data,
    setData,
    loading,
    setLoading,
    bomTemplates,
    templateLoading,
    currentStyleNo,
    fetchBom,
    fetchBomTemplates,
    fetchCurrentStyleNo,
  } = useStyleBomData({
    styleId,
    form,
    sortBomRows,
    onAfterFetchBom: () => {
      setEditingKey('');
    },
  });

  const mapDbTypeToBomType = (mt: any): MaterialType => {
    const t = String(mt || '').trim().toLowerCase();
    if (t.startsWith('fabric')) return 'fabricA';
    if (t.startsWith('lining')) return 'liningA';
    if (t.startsWith('accessory')) return 'accessoryA';
    return 'accessoryA';
  };

  const fillRowFromMaterial = async (rid: string, material: any) => {
    const rowId = String(rid || '').trim();
    if (!rowId) return;
    const m = material || {};
    const patch: any = {
      materialCode: String(m.materialCode || '').trim(),
      materialName: String(m.materialName || '').trim(),
      fabricComposition: String(m.fabricComposition || '').trim(),
      fabricWeight: String(m.fabricWeight || '').trim(),
      unit: String(m.unit || '').trim(),
      patternUnit: String(m.patternUnit || m.unit || '').trim(),
      conversionRate: Number(m.conversionRate ?? 1) || 1,
      supplier: String(m.supplierName || '').trim(),
      specification: String(m.specifications ?? m.specification ?? '').trim(),
      unitPrice: Number(m.unitPrice) || 0,
      materialType: mapDbTypeToBomType(m.materialType),
      // 自动从面辅料资料带出图片（面辅料资料 image 字段，包装成 JSON 数组）
      imageUrls: m.image ? JSON.stringify([String(m.image).trim()]) : undefined,
    };
    const materialColor = String(m.color ?? m.materialColor ?? '').trim();
    if (materialColor) {
      patch.color = materialColor;
    }
    patch.sizeSpecMap = buildSizeSpecMap(patch.specification, m.sizeSpecMap);
    const current = (form.getFieldValue(rowId) || {}) as any;
    const merged = { ...current, ...patch };
    merged.totalPrice = calcTotalPrice(merged);
    form.setFieldsValue({ [rowId]: merged });
    setData((prev) =>
      sortBomRows(
        (Array.isArray(prev) ? prev : []).map((it: any) => {
          if (String(it?.id) !== rowId) return it;
          return { ...it, ...merged };
        })
      )
    );

    // 自动检查该物料的库存状态
    try {
      const materialCode = String(m.materialCode || '').trim();
      const color = String(merged.color || '').trim();

      if (materialCode) {
        // 使用MaterialStockService查询库存（与后端StyleBomService相同逻辑）
        const res = await api.get<{ code: number; data: { records: any[] } }>(
          '/production/material/stock/list',
          { params: {
            materialCode,
            color: color || undefined,  // 如果颜色为空，不传参数
            page: 1,
            pageSize: 1
          } }
        );

        if (res.code === 200 && res.data?.records?.length > 0) {
          const stock = res.data.records[0];
          const availableQty = Number(stock.quantity || 0) - Number(stock.lockedQuantity || 0);
          const usageAmount = Number(merged.usageAmount || 0);
          const requiredQty = Math.ceil(usageAmount);

          const stockStatus = availableQty >= requiredQty ? 'sufficient' : availableQty > 0 ? 'insufficient' : 'none';
          const requiredPurchase = Math.max(0, requiredQty - availableQty);

          // 更新data数组中的对应行
          setData(prev => sortBomRows(
            prev.map(item =>
              String(item.id) === rowId ? {
                ...item,
                ...merged,
                stockStatus,
                availableStock: availableQty,
                requiredPurchase,
              } : item
            )
          ));

          const statusText = stockStatus === 'sufficient' ? '库存充足' : stockStatus === 'insufficient' ? '库存不足' : '无库存';
          message.success(`${materialCode} 库存检查完成：${statusText}（可用：${availableQty}）`);
        } else {
          // 无库存记录
          const usageAmount = Number(merged.usageAmount || 0);
          const requiredQty = Math.ceil(usageAmount);

          setData(prev => sortBomRows(
            prev.map(item =>
              String(item.id) === rowId ? {
                ...item,
                ...merged,
                stockStatus: 'none',
                availableStock: 0,
                requiredPurchase: requiredQty,
              } : item
            )
          ));

          message.warning(`${materialCode} 无库存记录`);
        }
      }
    } catch (error) {
      message.error('库存检查失败，请稍后重试');
    }
  };

  const {
    materialCreateForm,
    materialModalOpen,
    setMaterialModalOpen,
    materialTab,
    setMaterialTab,
    materialLoading,
    materialList,
    materialTotal,
    materialPage,
    materialPageSize,
    materialKeyword,
    setMaterialKeyword,
    setMaterialTargetRowId,
    fetchMaterials,
    handleMaterialPageChange,
    handleUseMaterial,
    handleCreateMaterial,
  } = useStyleBomMaterials({
    currentStyleNo,
    fillRowFromMaterial,
  });

  useEffect(() => {
    fetchBom();
    fetchCurrentStyleNo();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleId]);

  useEffect(() => {
    fetchBomTemplates('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!locked) return;
    if (editingKey) setEditingKey('');
    if (tableEditable) setTableEditable(false);
  }, [editingKey, locked, tableEditable]);

  const {
    isEditing,
    rowName,
    enterTableEdit,
    exitTableEdit,
    edit,
    cancel,
    handleAddRows,
  } = useStyleBomEditing({
    locked,
    styleId,
    editingKey,
    data,
    form,
    activeSizes,
    activeColors,
    setData,
    setEditingKey,
    setTableEditable,
    fetchBom,
    sortBomRows,
    parseNumberMap,
    buildSizeUsageMap,
    buildSizeSpecMap,
    isTempId,
  });

  const {
    save,
    saveAll,
    applyBomTemplate,
  } = useStyleBomMutations({
    locked,
    styleId,
    data,
    bomTemplateId,
    form,
    activeSizes,
    setLoading,
    setEditingKey,
    setTableEditable,
    setBomTemplateId,
    fetchBom,
    enterTableEdit,
    rowName,
    parseNumberMap,
    extractSpecLength,
    calcTotalPrice,
    resolvePatternUnit,
    isTempId,
  });

  const {
    handleGeneratePurchase,
    handleCheckStock,
    handleApplyPickup,
    handleDelete,
  } = useStyleBomActions({
    locked,
    styleId,
    currentStyleNo,
    data,
    tableEditable,
    user,
    form,
    setLoading,
    setCheckingStock,
    setData,
    fetchBom,
    isTempId,
    sortBomRows,
  });

  // ── AI 智能识别 BOM 清单处理 ──
  const handleAiBomRecognize = useCallback(async (file: File): Promise<string | null> => {
    if (!file) return null;
    setAiBomLoading(true);
    setAiBomFallbackMessage('');
    try {
      // 1. 上传图片
      const fd = new FormData();
      fd.append('file', file);
      const uploadRes = await api.post('/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });
      if (uploadRes?.code !== 200 || !uploadRes?.data) {
        setAiBomFallbackMessage('图片上传失败，您可手动在下方添加物料行');
        message.error('图片上传失败');
        return null;
      }
      const imageUrl = uploadRes.data as string;

      // 2. 调用 bom-extract 接口；若 404/非200 则回退到 style-search
      let items: AiBomRecognizedItem[] = [];
      let usedFallback = false;
      try {
        const bomRes = await api.post<{ code: number; data: Array<Record<string, unknown>> }>(
          '/intelligence/visual/bom-extract',
          { imageUrl, styleId: styleId != null ? String(styleId) : undefined }
        );
        if (bomRes?.code === 200 && Array.isArray(bomRes?.data) && bomRes.data.length > 0) {
          items = bomRes.data.map((row, idx) => {
            const name = String((row as any).materialName || (row as any).name || (row as any).物料名称 || '').trim();
            const code = String((row as any).materialCode || (row as any).code || (row as any).物料编码 || '').trim();
            const spec = String((row as any).specification || (row as any).spec || (row as any).规格 || '').trim();
            const qty = Number((row as any).usageAmount || (row as any).quantity || (row as any).数量 || (row as any).用量 || 0) || undefined;
            return {
              id: `ai_${Date.now()}_${idx}`,
              sourceImageUrl: imageUrl,
              materialName: name || '未识别物料',
              materialCode: code || undefined,
              specification: spec || undefined,
              usageAmount: qty,
              rawText: typeof row === 'string' ? row : JSON.stringify(row),
              createdAt: Date.now(),
            };
          }).filter((it) => it.materialName && it.materialName !== '未识别物料');
        } else {
          usedFallback = true;
        }
      } catch {
        usedFallback = true;
      }

      // 3. 回退路径：以图搜款作为视觉接口不可用时的 fallback（仅作提示，不解析为 BOM 行）
      if (usedFallback) {
        try {
          const fallback = await intelligenceApi.styleSearchByImage(imageUrl, 3);
          if (fallback?.success && fallback.matches?.length) {
            setAiBomFallbackMessage('AI 识别功能即将上线，您可手动在下方添加物料行（以图搜款已定位到类似款式供参考）');
          } else {
            setAiBomFallbackMessage('AI 识别功能即将上线，您可手动在下方添加物料行');
          }
        } catch {
          setAiBomFallbackMessage('AI 识别功能即将上线，您可手动在下方添加物料行');
        }
      }

      if (items.length > 0) {
        setAiBomRecognized((prev) => [...items, ...prev]);
        message.success(`识别成功：共解析出 ${items.length} 条物料`);
        return imageUrl;
      }
      if (!usedFallback) {
        message.info('未识别出有效物料行');
      }
      return imageUrl;
    } catch {
      setAiBomFallbackMessage('AI 识别功能即将上线，您可手动在下方添加物料行');
      message.error('AI 识别失败');
      return null;
    } finally {
      setAiBomLoading(false);
    }
  }, [message, styleId]);

  const handleJoinAiBomRow = useCallback((item: AiBomRecognizedItem) => {
    // 创建一个临时的 BOM 行并填入识别到的字段
    const rowId = `tmp_ai_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const patch: Partial<StyleBom> & Record<string, unknown> = {
      id: rowId,
      materialName: item.materialName,
      materialCode: item.materialCode,
      specification: item.specification,
      usageAmount: item.usageAmount,
    };
    form.setFieldsValue({ [rowId]: patch });
    setData((prev) => sortBomRows([...(Array.isArray(prev) ? prev : []), patch as StyleBom]));
    setAiBomRecognized((prev) => prev.map((it) => (it.id === item.id ? { ...it, joined: true } : it)));
    message.success('已加入 BOM，请到下方表格完善其他字段');
  }, [form, message]);

  const handleJoinAllAiBom = useCallback(() => {
    const unjoined = aiBomRecognized.filter((it) => !it.joined);
    if (unjoined.length === 0) {
      message.info('没有可加入的物料');
      return;
    }
    unjoined.forEach((it, idx) => {
      const rowId = `tmp_ai_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 5)}`;
      const patch: Partial<StyleBom> & Record<string, unknown> = {
        id: rowId,
        materialName: it.materialName,
        materialCode: it.materialCode,
        specification: it.specification,
        usageAmount: it.usageAmount,
      };
      form.setFieldsValue({ [rowId]: patch });
    });
    setData((prev) => {
      const next = [...(Array.isArray(prev) ? prev : [])];
      unjoined.forEach((it, idx) => {
        const rowId = `tmp_ai_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 5)}`;
        next.push({
          id: rowId,
          materialName: it.materialName,
          materialCode: it.materialCode,
          specification: it.specification,
          usageAmount: it.usageAmount,
        } as StyleBom);
      });
      return sortBomRows(next);
    });
    setAiBomRecognized((prev) => prev.map((it) => ({ ...it, joined: true })));
    message.success(`已将 ${unjoined.length} 条物料加入 BOM`);
  }, [aiBomRecognized, form, message]);

  // ── AI 智能识别 BOM 清单组件（内联定义） ──
  const AiBomRecognizeBar: React.FC = () => {
    const unjoinedCount = aiBomRecognized.filter((it) => !it.joined).length;

    const onDrop: UploadProps['customRequest'] = async (options) => {
      const file = options?.file as unknown as File;
      if (!file) return;
      await handleAiBomRecognize(file);
    };

    return (
      <Card
        styles={{ body: { padding: '10px 12px' } }}
        style={{
          marginBottom: 12,
          borderRadius: 12,
          border: '1px solid rgba(114,46,209,0.15)',
          background: 'linear-gradient(135deg, #fff7ed 0%, #faf5ff 100%)',
        }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', flexWrap: 'wrap' }}>
          {/* 左：图标 + 标题 */}
          <div style={{ flex: '0 0 220px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BulbOutlined style={{ color: 'var(--color-accent-purple)', fontSize: 18 }} />
              <span style={{ fontWeight: 700, color: '#1f1f1f' }}>AI 智能识别 BOM 清单</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.5, marginTop: 4 }}>
              上传工艺单/面料清单图片，自动解析物料名称、规格、数量
            </div>
            <div style={{ marginTop: 8 }}>
              <Button
                type="link"
                icon={<HistoryOutlined />}
                onClick={() => setAiBomModalOpen(true)}
                style={{ padding: 0, fontSize: 12 }}
              >
                历史识别记录（{aiBomRecognized.length}）
              </Button>
            </div>
          </div>

          {/* 中：拖拽上传区域 */}
          <div style={{ flex: 1, minWidth: 260 }}>
            <Upload.Dragger
              accept="image/*"
              multiple
              showUploadList={false}
              beforeUpload={() => false}
              customRequest={onDrop}
              disabled={aiBomLoading}
              style={{ padding: 8 }}
            >
              <p className="ant-upload-drag-icon" style={{ margin: 0 }}>
                <InboxOutlined style={{ color: 'var(--color-accent-purple)' }} />
              </p>
              <p className="ant-upload-text" style={{ margin: '4px 0 0', fontSize: 13, color: '#1f1f1f' }}>
                {aiBomLoading ? '正在识别中…' : '点击或拖拽图片到此处上传识别'}
              </p>
              <p className="ant-upload-hint" style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                支持 JPG/PNG，每张图片独立解析
              </p>
            </Upload.Dragger>
            {aiBomFallbackMessage && (
              <div
                style={{
                  marginTop: 6,
                  padding: '4px 8px',
                  borderRadius: 6,
                  background: 'rgba(255,193,7,0.08)',
                  border: '1px solid rgba(255,193,7,0.25)',
                  fontSize: 12,
                  color: '#d48806',
                  lineHeight: 1.5,
                }}
              >
                {aiBomFallbackMessage}
              </div>
            )}
          </div>

          {/* 右：已识别结果摘要 + 一键加入 */}
          <div style={{ flex: '0 0 260px', minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>
              已识别 <b style={{ color: 'var(--color-accent-purple)' }}>{aiBomRecognized.length}</b> 条，待加入 <b>{unjoinedCount}</b> 条
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 110, overflowY: 'auto' }}>
              {aiBomRecognized.slice(0, 4).map((it) => (
                <div
                  key={it.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 6px',
                    background: 'var(--color-bg-base)',
                    borderRadius: 6,
                    border: '1px solid rgba(0,0,0,0.05)',
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontSize: 12 }}>
                    {it.materialName}
                    {it.specification ? ` · ${it.specification}` : ''}
                  </span>
                  {it.joined ? (
                    <Tag color="success" style={{ margin: 0, fontSize: 11 }}>已加入</Tag>
                  ) : (
                    <Button
                      size="small"
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => handleJoinAiBomRow(it)}
                      style={{ fontSize: 11, height: 20, padding: '0 6px' }}
                    >
                      加入 BOM
                    </Button>
                  )}
                </div>
              ))}
              {aiBomRecognized.length === 0 && !aiBomLoading && (
                <div style={{ fontSize: 11, color: 'var(--color-text-quaternary)', padding: '8px 4px', textAlign: 'center' }}>
                  还未识别任何物料
                </div>
              )}
            </div>
            <div style={{ marginTop: 6, textAlign: 'right' }}>
              <Button
                size="small"
                type="primary"
                disabled={unjoinedCount === 0}
                onClick={handleJoinAllAiBom}
                style={{ fontSize: 12, height: 24 }}
              >
                一键全部加入 BOM（{unjoinedCount}）
              </Button>
            </div>
          </div>
        </div>

        {/* 历史识别记录弹窗 */}
        <Modal
          title="历史识别记录"
          open={aiBomModalOpen}
          onCancel={() => setAiBomModalOpen(false)}
          footer={[
            <Button
              key="clear"
              danger
              icon={<DeleteOutlined />}
              disabled={aiBomRecognized.length === 0}
              onClick={() => {
                setAiBomRecognized([]);
                message.success('已清空历史识别记录');
              }}
            >
              清空记录
            </Button>,
            <Button key="close" type="primary" onClick={() => setAiBomModalOpen(false)}>关闭</Button>,
          ]}
          width={640}
        >
          {aiBomRecognized.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
              本次会话还没有识别记录
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
              {aiBomRecognized.map((it) => (
                <div
                  key={it.id}
                  style={{
                    display: 'flex',
                    gap: 10,
                    padding: 8,
                    border: '1px solid var(--color-border-antd)',
                    borderRadius: 8,
                    background: 'var(--color-bg-container)',
                  }}
                >
                  {it.sourceImageUrl && (
                    <div style={{ flex: '0 0 96px' }}>
                      <img
                        src={it.sourceImageUrl}
                        alt={it.materialName}
                        style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 6, cursor: 'pointer' }}
                        onClick={() => setAiBomImagePreviewUrl(it.sourceImageUrl)}
                      />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1f1f1f' }}>{it.materialName}</div>
                    {it.materialCode && (
                      <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>编码：{it.materialCode}</div>
                    )}
                    {it.specification && (
                      <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>规格：{it.specification}</div>
                    )}
                    {it.usageAmount != null && (
                      <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>用量：{it.usageAmount}</div>
                    )}
                    <div style={{ marginTop: 6 }}>
                      {it.joined ? (
                        <Tag color="success" style={{ margin: 0, fontSize: 11 }}>已加入 BOM</Tag>
                      ) : (
                        <Button
                          size="small"
                          type="primary"
                          icon={<PlusOutlined />}
                          onClick={() => handleJoinAiBomRow(it)}
                          style={{ fontSize: 11, height: 22, padding: '0 8px' }}
                        >
                          加入 BOM
                        </Button>
                      )}
                      <Tooltip title="查看原图">
                        <Button
                          size="small"
                          type="link"
                          onClick={() => setAiBomImagePreviewUrl(it.sourceImageUrl)}
                          style={{ padding: '0 6px', fontSize: 11 }}
                        >
                          查看原图
                        </Button>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>

        {/* 图片预览 */}
        <Modal
          title="原始图片"
          open={!!aiBomImagePreviewUrl}
          onCancel={() => setAiBomImagePreviewUrl(undefined)}
          footer={null}
          width={640}
        >
          {aiBomImagePreviewUrl && (
            <img src={aiBomImagePreviewUrl} alt="preview" style={{ width: '100%', borderRadius: 6 }} />
          )}
        </Modal>
      </Card>
    );
  };

  // 列定义
  const columns = useBomColumns({
    locked,
    tableEditable,
    editingKey,
    data,
    form,
    isEditing,
    rowName,
    save,
    cancel,
    edit,
    handleDelete,
    isTempId,
    fetchMaterials,
    materialCreateForm,
    calcTotalPrice,
    isSupervisorOrAbove,
    setMaterialKeyword,
    setMaterialModalOpen,
    setMaterialTab,
    setMaterialTargetRowId,
    onApplyPickup: handleApplyPickup,
    activeSizes,
  });

  return (
    <div>
      {/* 统一状态控制栏 */}
      <StyleStageControlBar
        stageName="BOM清单"
        styleId={styleId}
        apiPath="bom"
        status={bomCompletedTime ? 'COMPLETED' : bomStartTime ? 'IN_PROGRESS' : 'NOT_STARTED'}
        assignee={bomAssignee}
        startTime={bomStartTime}
        completedTime={bomCompletedTime}
        readOnly={readOnly}
        onRefresh={onRefresh ?? (() => {})}
        onBeforeComplete={async () => {
          if (!data || data.length === 0) {
            message.error('请先配置BOM物料');
            return false;
          }
          if (tableEditable) {
            message.error('请先点击"保存全部"保存单价数据，再完成BOM配置');
            return false;
          }
          const hasZeroPrices = data.some(item => !Number(item.unitPrice));
          if (hasZeroPrices) {
            const confirmed = await new Promise<boolean>((resolve) => {
              Modal.confirm({
                width: '30vw',
                title: '部分单价为0',
                content: '存在单价为0的BOM物料，确认仍然完成BOM配置？',
                okText: '确认完成',
                cancelText: '返回填写',
                onOk: () => resolve(true),
                onCancel: () => resolve(false),
              });
            });
            if (!confirmed) return false;
          }
          // 标记完成前自动同步BOM到物料数据库（尽力而为，重复自动过滤）
          try {
            await api.post(`/style/bom/${styleId}/sync-material-database`);
          } catch {
            // 尽力而为：同步失败不阻断完成操作
          }
          return true;
        }}
      />
      <AiBomRecognizeBar />
      <StyleBomSizeColorSummary sizes={activeSizes} colors={activeColors} />
      <StyleBomToolbar
        dataLength={data.length}
        locked={locked}
        loading={loading}
        checkingStock={checkingStock}
        tableEditable={tableEditable}
        templateLoading={templateLoading}
        editingKey={editingKey}
        bomTemplateId={bomTemplateId}
        bomTemplates={bomTemplates}
        onBomTemplateIdChange={setBomTemplateId}
        onTemplateOpenChange={(open) => {
          if (open && !bomTemplates.length) fetchBomTemplates('');
        }}
        onApplyTemplate={(mode) => {
          if (editingKey) {
            message.error('请先完成当前编辑再导入模板');
            return;
          }
          if (tableEditable) {
            message.error('请先保存或取消编辑后再导入模板');
            return;
          }
          if (!bomTemplateId) {
            message.error('请选择模板');
            return;
          }
          void applyBomTemplate(mode);
        }}
        onCheckStock={handleCheckStock}
        onGeneratePurchase={handleGeneratePurchase}
        onToggleEdit={() => {
          if (tableEditable) {
            void saveAll();
            return;
          }
          enterTableEdit();
        }}
        onCancelEdit={exitTableEdit}
        onAddRows={handleAddRows}
      />

      <StyleBomMaterialModal
        open={materialModalOpen}
        modalWidth={'98vw'}
        materialTab={materialTab}
        materialKeyword={materialKeyword}
        materialLoading={materialLoading}
        materialList={materialList}
        materialTotal={materialTotal}
        materialPage={materialPage}
        materialPageSize={materialPageSize}
        materialCreateForm={materialCreateForm}
        onTabChange={setMaterialTab}
        onKeywordChange={setMaterialKeyword}
        onSearch={() => {
          void fetchMaterials(1, materialKeyword);
        }}
        onPageChange={handleMaterialPageChange}
        onClose={() => setMaterialModalOpen(false)}
        onUseMaterial={handleUseMaterial}
        onCreateMaterial={handleCreateMaterial}
      />
      <Form form={form} component={false}>
        {data.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-secondary)' }}>
            暂无BOM数据，请点击"添加物料"开始配置
          </div>
        ) : (
          <ResizableTable
            components={{
              body: {
                cell: ({ children, ...restProps }: any) => <td {...restProps}>{children}</td>,
              },
            }}
            bordered
            dataSource={data}
            columns={columns}
            rowClassName="editable-row"
            pagination={false}
            loading={loading}
            rowKey="id"
            scroll={{ x: 'max-content' }}
            storageKey={`style-bom-v2-${String(styleId)}`}
          />
        )}
      </Form>
    </div>
  );
};

export default StyleBomTab;
