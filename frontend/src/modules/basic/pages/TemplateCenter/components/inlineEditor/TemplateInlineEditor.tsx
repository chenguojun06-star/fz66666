import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Form, Input, Select, Tag, Upload } from 'antd';
import api from '@/utils/api';
import type { TemplateLibrary } from '@/types/style';
import {
  convertStyleSizeListToTable,
  getErrorMessage,
  hasErrorFields,
  isBomTableContainer,
  isBomTableData,
  isProcessTableData,
  isSizeTableData,
  normalizeProcessSteps,
  type BomTableContainer,
  type BomTableData,
  type ProcessStepRow,
  type ProcessTableData,
  type SizeTableData,
  typeColor,
  typeLabel,
} from '../../utils/templateUtils';
import BomInlineTable from './BomInlineTable';
import ProcessInlineTable from './ProcessInlineTable';
import SizeInlineTable from './SizeInlineTable';

interface StyleNoOption {
  value: string;
  label: string;
}

interface TemplateInlineEditorProps {
  row: TemplateLibrary;
  onSaved: () => Promise<void> | void;
  readOnly?: boolean;
  compact?: boolean;
  maintenanceMode?: boolean;
  allowSourceStyleSelection?: boolean;
  styleNoOptions?: StyleNoOption[];
  styleNoLoading?: boolean;
  onStyleNoSearch?: (keyword: string) => void;
  onStyleNoDropdownOpen?: (open: boolean) => void;
}

const parseTemplateContent = (content: unknown) => {
  if (typeof content === 'object' && content !== null) return content;
  const text = String(content ?? '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const TemplateInlineEditor: React.FC<TemplateInlineEditorProps> = ({
  row,
  onSaved,
  readOnly = false,
  compact = false,
  maintenanceMode = false,
  allowSourceStyleSelection = false,
  styleNoOptions = [],
  styleNoLoading = false,
  onStyleNoSearch,
  onStyleNoDropdownOpen,
}) => {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [editTableData, setEditTableData] = useState<unknown>(null);
  const [showSizePrices, setShowSizePrices] = useState(false);
  const [templateSizes, setTemplateSizes] = useState<string[]>(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
  const [newSizeName, setNewSizeName] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);

  useEffect(() => {
    form.setFieldsValue({
      templateName: row.templateName,
      templateKey: row.templateKey,
      sourceStyleNo: row.sourceStyleNo || undefined,
    });

    const normalizedType = String(row.templateType || '').trim().toLowerCase();
    const parsedContent = parseTemplateContent(row.templateContent);

    if (!parsedContent) {
      setEditTableData(null);
      setShowSizePrices(false);
      setTemplateSizes(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
      setImageUrls([]);
      return;
    }

    let nextContent = parsedContent;
    if ((normalizedType === 'process' || normalizedType === 'process_price') && Array.isArray(nextContent)) {
      nextContent = { steps: normalizeProcessSteps(nextContent as ProcessStepRow[]) };
    }
    if ((normalizedType === 'process' || normalizedType === 'process_price') && isProcessTableData(nextContent)) {
      nextContent = { ...nextContent, steps: normalizeProcessSteps(nextContent.steps) };
    }
    if (normalizedType === 'size' && Array.isArray(nextContent)) {
      nextContent = convertStyleSizeListToTable(nextContent as Array<Record<string, unknown>>);
    }

    setEditTableData(nextContent);

    if (isProcessTableData(nextContent) && Array.isArray(nextContent.sizes)) {
      setTemplateSizes(nextContent.sizes);
      setShowSizePrices(nextContent.sizes.length > 0);
    } else {
      setTemplateSizes(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
      setShowSizePrices(false);
    }

    if (
      normalizedType === 'process_price' &&
      nextContent &&
      typeof nextContent === 'object' &&
      Array.isArray((nextContent as { images?: unknown[] }).images)
    ) {
      setImageUrls(
        ((nextContent as { images?: unknown[] }).images || [])
          .map((item) => String(item || '').trim())
          .filter(Boolean)
      );
    } else {
      setImageUrls([]);
    }
  }, [form, row]);

  const buildProcessContent = useCallback(() => {
    if (!isProcessTableData(editTableData)) return null;
    const normalizedSteps = normalizeProcessSteps(editTableData.steps).map((step) => {
      const unitPrice = Number(step.unitPrice ?? step.price ?? 0) || 0;
      const nextStep: ProcessStepRow = {
        processCode: String(step.processCode || '').trim(),
        processName: String(step.processName || '').trim(),
        progressStage: String(step.progressStage || '').trim(),
        machineType: String(step.machineType || '').trim(),
        difficulty: String(step.difficulty || '').trim(),
        standardTime: Number(step.standardTime || 0) || 0,
        unitPrice,
      };
      if (showSizePrices && templateSizes.length > 0) {
        nextStep.sizePrices = templateSizes.reduce((acc, size) => {
          acc[size] = Number(step.sizePrices?.[size] ?? unitPrice) || 0;
          return acc;
        }, {} as Record<string, number>);
      }
      return nextStep;
    });

    const nextContent: ProcessTableData & { images?: string[] } = { steps: normalizedSteps };
    if (showSizePrices && templateSizes.length > 0) {
      nextContent.sizes = templateSizes;
    }
    if (String(row.templateType || '').trim().toLowerCase() === 'process_price' && imageUrls.length > 0) {
      nextContent.images = imageUrls;
    }
    return nextContent;
  }, [editTableData, imageUrls, row.templateType, showSizePrices, templateSizes]);

  const promptProcessSave = async () => {
    return new Promise<boolean>((resolve) => {
      modal.confirm({
        width: '30vw',
        title: '工序单价自动同步提醒',
        content: (
          <div>
            <p style={{ marginBottom: 12 }}>保存工序单价后，系统会同步更新未完成订单的工序单价。</p>
            <p style={{ margin: 0, fontSize: 13, color: '#8c8c8c' }}>通常 1 到 3 秒内完成。</p>
          </div>
        ),
        okText: '确认保存',
        cancelText: '取消',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  };

  const promptSyncProcessPriceOrders = async (styleNo: string) => {
    const shouldSync = await new Promise<boolean>((resolve) => {
      modal.confirm({
        width: '30vw',
        title: '独立工序单价已保存',
        content: (
          <div>
            <p style={{ marginBottom: 8 }}>是否同步到该款号已有的未完成生产订单？</p>
            <p style={{ margin: 0, color: '#8c8c8c', fontSize: 12 }}>款号：{styleNo}</p>
          </div>
        ),
        okText: '保存并同步',
        cancelText: '仅保存',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });

    if (!shouldSync) {
      message.success('更新成功');
      return;
    }

    const response = await api.post<{ code: number; data?: Record<string, unknown>; message?: string }>('/template-library/sync-process-prices', {
      styleNo,
    });
    if (response.code !== 200) {
      message.warning(response.message || '模板已保存，但同步订单失败');
      return;
    }

    const result = response.data || {};
    message.success(
      `${result.scopeLabel || '同步完成'}：${result.totalOrders || 0} 个订单，更新 ${result.totalSynced || 0} 条跟踪单价，刷新 ${result.workflowUpdatedNodes || 0} 个订单工价节点`
    );
  };

  const handleUploadImage = async (file: File) => {
    if (imageUrls.length >= 4) {
      message.warning('最多上传4张图片');
      return Upload.LIST_IGNORE;
    }
    setImageUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post<{ code: number; data: string; message?: string }>('/common/upload', formData);
      if (response.code !== 200 || !response.data) {
        message.error(response.message || '上传失败');
        return Upload.LIST_IGNORE;
      }
      setImageUrls((prev) => [...prev, response.data].slice(0, 4));
      message.success('图片已上传，保存后生效');
    } catch (error: unknown) {
      message.error(getErrorMessage(error, '上传失败'));
    } finally {
      setImageUploading(false);
    }
    return Upload.LIST_IGNORE;
  };

  const addSize = () => {
    const nextSize = newSizeName.trim().toUpperCase();
    if (!nextSize || templateSizes.includes(nextSize) || !isProcessTableData(editTableData)) return;
    const nextSizes = [...templateSizes, nextSize];
    const nextSteps = editTableData.steps.map((step) => ({
      ...step,
      sizePrices: {
        ...(step.sizePrices || {}),
        [nextSize]: step.unitPrice ?? step.price ?? 0,
      },
    }));
    setTemplateSizes(nextSizes);
    setEditTableData({ ...editTableData, sizes: nextSizes, steps: nextSteps });
    setNewSizeName('');
  };

  const removeSize = (size: string) => {
    if (!isProcessTableData(editTableData)) return;
    const nextSizes = templateSizes.filter((item) => item !== size);
    const nextSteps = editTableData.steps.map((step) => {
      const nextSizePrices = { ...(step.sizePrices || {}) };
      delete nextSizePrices[size];
      return { ...step, sizePrices: nextSizePrices };
    });
    setTemplateSizes(nextSizes);
    setEditTableData({ ...editTableData, sizes: nextSizes, steps: nextSteps });
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const templateName = String(values.templateName || row.templateName || '').trim();
      const templateKey = String(values.templateKey || row.templateKey || '').trim();
      const sourceStyleNo = String(values.sourceStyleNo || row.sourceStyleNo || '').trim();
      const normalizedType = String(row.templateType || '').trim().toLowerCase();

      if (!templateName) {
        message.error('请输入模板名称');
        return;
      }
      if (!editTableData) {
        message.error('模板内容无效');
        return;
      }

      let templateContent = '';
      if (normalizedType === 'process' || normalizedType === 'process_price') {
        const nextContent = buildProcessContent();
        if (!nextContent) {
          message.error('模板内容无效');
          return;
        }
        templateContent = JSON.stringify(nextContent);
      } else {
        templateContent = JSON.stringify(editTableData);
      }

      if (normalizedType === 'process') {
        const confirmed = await promptProcessSave();
        if (!confirmed) return;
      }

      setSaving(true);

      if (normalizedType === 'process_price') {
        if (!sourceStyleNo) {
          message.error('独立工序单价模板必须绑定来源款号');
          return;
        }
        const nextContent = buildProcessContent();
        if (!nextContent) {
          message.error('模板内容无效');
          return;
        }
        const response = await api.post<{ code: number; message?: string }>('/template-library/process-price-template', {
          styleNo: sourceStyleNo,
          templateName,
          templateContent: nextContent,
        });
        if (response.code !== 200) {
          message.error(response.message || '更新失败');
          return;
        }
        await onSaved();
        await promptSyncProcessPriceOrders(sourceStyleNo);
        return;
      }

      const response = await api.put<{ code: number; message?: string }>(`/template-library/${row.id}`, {
        id: row.id,
        templateName,
        templateKey: templateKey || null,
        templateType: row.templateType,
        sourceStyleNo: sourceStyleNo || null,
        templateContent,
      });
      if (response.code !== 200) {
        message.error(response.message || '更新失败');
        return;
      }

      message.success('更新成功');
      await onSaved();
    } catch (error: unknown) {
      if (hasErrorFields(error)) return;
      message.error(getErrorMessage(error, '更新失败'));
    } finally {
      setSaving(false);
    }
  };

  const renderEditor = () => {
    const normalizedType = String(row.templateType || '').trim().toLowerCase();
    if (normalizedType === 'size' && isSizeTableData(editTableData)) {
      return <SizeInlineTable value={editTableData as SizeTableData} onChange={setEditTableData} readOnly={readOnly} compact={compact} />;
    }
    if (normalizedType === 'bom' && (isBomTableData(editTableData) || isBomTableContainer(editTableData))) {
      return <BomInlineTable value={editTableData as BomTableData | BomTableContainer} onChange={setEditTableData} readOnly={readOnly} compact={compact} />;
    }
    if ((normalizedType === 'process' || normalizedType === 'process_price') && isProcessTableData(editTableData)) {
      return (
        <ProcessInlineTable
          value={editTableData as ProcessTableData}
          onChange={setEditTableData as (next: ProcessTableData) => void}
          readOnly={readOnly}
          compact={compact}
          allowProcessPriceImages={normalizedType === 'process_price'}
          showSizePrices={showSizePrices}
          onShowSizePricesChange={setShowSizePrices}
          templateSizes={templateSizes}
          newSizeName={newSizeName}
          onNewSizeNameChange={setNewSizeName}
          onAddSize={addSize}
          onRemoveSize={removeSize}
          imageUrls={imageUrls}
          imageUploading={imageUploading}
          onUploadImage={handleUploadImage}
          onRemoveImage={(url) => setImageUrls((prev) => prev.filter((item) => item !== url))}
        />
      );
    }
    return (
      <div style={{ padding: 16, color: 'var(--neutral-text-disabled)' }}>
        当前模板内容无法识别，请联系管理员检查模板数据。
      </div>
    );
  };

  const metaTextStyle = {
    color: 'var(--neutral-text-secondary)',
    fontSize: 12,
    lineHeight: 1.2,
  } as const;

  const compactFieldLabelStyle = {
    marginBottom: 4,
    color: 'var(--neutral-text-secondary)',
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.2,
  } as const;

  const renderCompactField = (
    name: string,
    label: string,
    node: React.ReactNode,
    rules?: Array<{ required?: boolean; message?: string }>,
  ) => (
    <div>
      <div style={compactFieldLabelStyle}>{label}</div>
      <Form.Item name={name} rules={rules} style={{ marginBottom: 0 }}>
        {node}
      </Form.Item>
    </div>
  );

  const showTemplateMetaShell = !maintenanceMode;

  return (
    <div>
      {showTemplateMetaShell ? (
        <div style={{ marginBottom: compact ? 8 : 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Tag color={typeColor(String(row.templateType || ''))} style={{ marginInlineEnd: 0 }}>
              {typeLabel(String(row.templateType || ''))}
            </Tag>
            <span style={metaTextStyle}>款号 {row.sourceStyleNo || '-'}</span>
            {row.operatorName ? <span style={metaTextStyle}>维护 {row.operatorName}</span> : null}
          </div>
          {row.updateTime ? <span style={metaTextStyle}>更新 {row.updateTime}</span> : null}
        </div>
      ) : null}

      <Form form={form} layout="vertical">
        {readOnly && !compact && showTemplateMetaShell ? (
          <div style={{ marginBottom: 12, color: 'var(--neutral-text-secondary)', fontSize: 12 }}>
            当前为只读预览，退回后可直接在此页面编辑。
          </div>
        ) : null}
        {showTemplateMetaShell ? (
          <div style={{ display: 'grid', gridTemplateColumns: allowSourceStyleSelection ? 'minmax(0,1.8fr) minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1.8fr) minmax(0,1fr)', gap: compact ? 8 : 12, marginBottom: compact ? 10 : 16 }}>
            {compact
              ? renderCompactField(
                'templateName',
                '模板名称',
                <Input size="small" placeholder="请输入模板名称" disabled={readOnly} />,
                [{ required: true, message: '请输入模板名称' }],
              )
              : (
                <Form.Item
                  name="templateName"
                  label="模板名称"
                  rules={[{ required: true, message: '请输入模板名称' }]}
                  style={{ marginBottom: 0 }}
                >
                  <Input size="small" placeholder="请输入模板名称" disabled={readOnly} />
                </Form.Item>
              )}
            {compact
              ? renderCompactField('templateKey', '模板标识', <Input size="small" placeholder="可选" disabled={readOnly} />)
              : (
                <Form.Item name="templateKey" label="模板标识" style={{ marginBottom: 0 }}>
                  <Input size="small" placeholder="可选" disabled={readOnly} />
                </Form.Item>
              )}
            {allowSourceStyleSelection ? (compact
              ? renderCompactField(
                'sourceStyleNo',
                '来源款号',
                <Select
                  allowClear
                  size="small"
                  showSearch
                  filterOption={false}
                  disabled={readOnly}
                  loading={styleNoLoading}
                  placeholder="搜索/选择款号"
                  options={styleNoOptions}
                  onSearch={onStyleNoSearch}
                  onOpenChange={onStyleNoDropdownOpen}
                />,
              )
              : (
                <Form.Item name="sourceStyleNo" label="来源款号" style={{ marginBottom: 0 }}>
                  <Select
                    allowClear
                    size="small"
                    showSearch
                    filterOption={false}
                    disabled={readOnly}
                    loading={styleNoLoading}
                    placeholder="搜索/选择款号"
                    options={styleNoOptions}
                    onSearch={onStyleNoSearch}
                    onOpenChange={onStyleNoDropdownOpen}
                  />
                </Form.Item>
              )) : null}
          </div>
        ) : null}
      </Form>

      {renderEditor()}

      {!readOnly ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: compact ? 10 : 16 }}>
          <Button type="primary" size={compact ? 'small' : 'middle'} loading={saving} onClick={handleSave}>
            保存
          </Button>
        </div>
      ) : null}
    </div>
  );
};

export default TemplateInlineEditor;
