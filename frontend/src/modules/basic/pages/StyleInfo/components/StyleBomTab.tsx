import React, { useCallback, useEffect, useState } from 'react';
import { App, Form, Modal } from 'antd';
import { StyleBom } from '@/types/style';
import api from '@/utils/api';
import ResizableTable from '@/components/common/ResizableTable';
import { isSupervisorOrAboveUser, useAuth } from '@/utils/AuthContext';
import { getMaterialSortWeight } from '@/utils/materialType';
import { useViewport } from '@/utils/useViewport';
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
  const { user } = useAuth();
  const { message } = App.useApp();
  const { modalWidth } = useViewport();
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
    const qty = effectiveUsage * (1 + lossRate / 100);
    return Number((qty * unitPrice).toFixed(2));
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
  }, [styleId]);

  useEffect(() => {
    fetchBomTemplates('');
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
        modalWidth={modalWidth}
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
