import React, { useCallback, useMemo, useState } from 'react';
import {
  App,
  Button,
  Checkbox,
  Form,
  Image,
  Input,
  InputNumber,
  Select,
  Tag,
  Upload,
} from 'antd';
import { DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import type { TemplateLibrary } from '@/types/style';
import {
  MAIN_PROGRESS_STAGE_OPTIONS,
  convertStyleSizeListToTable,
  getErrorMessage,
  hasErrorFields,
  isBomTableContainer,
  isBomTableData,
  isProcessPriceTableData,
  isProcessTableData,
  isSizeTableData,
  normalizeProcessSteps,
} from '../utils/templateUtils';
import type {
  BomTableRow,
  ProcessPriceRow,
  ProcessStepRow,
  SizeTablePart,
} from '../utils/templateUtils';

const EDITOR_FONT_SIZE = 12;

interface EditTemplateModalProps {
  /** 款号下拉选项 */
  styleNoOptions: Array<{ value: string; label: string }>;
  styleNoLoading: boolean;
  modalWidth: string | number;
  /** 列表刷新回调 */
  onFetchList: (opts?: { page?: number }) => void;
  /** 款号搜索 */
  onStyleNoSearch: (keyword: string) => void;
  onStyleNoDropdownOpen: (open: boolean) => void;
}

/** 暴露给父组件调用 openEdit 方法的 ref 接口 */
export interface EditTemplateModalRef {
  openEdit: (row: TemplateLibrary) => Promise<void>;
}

/**
 * EditTemplateModal
 *
 * 完整管理编辑模板弹窗的所有内部状态（open/saving/editingRow/editTableData/
 * showSizePrices/templateSizes/newSizeName），通过 ref 暴露 openEdit 方法给父组件。
 */
const EditTemplateModal = React.forwardRef<EditTemplateModalRef, EditTemplateModalProps>(
  (
    {
      styleNoOptions,
      styleNoLoading,
      modalWidth,
      onFetchList,
      onStyleNoSearch,
      onStyleNoDropdownOpen,
    },
    ref
  ) => {
    const { modal, message } = App.useApp();
    const [createForm] = Form.useForm();

    const [editOpen, setEditOpen] = useState(false);
    const [editSaving, setEditSaving] = useState(false);
    const [editingRow, setEditingRow] = useState<TemplateLibrary | null>(null);
    const [editTableData, setEditTableData] = useState<any>(null);
    const [showSizePrices, setShowSizePrices] = useState(false);
    const [templateSizes, setTemplateSizes] = useState<string[]>(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
    const [newSizeName, setNewSizeName] = useState('');
    const [imageUrls, setImageUrls] = useState<string[]>([]);
    const [imageUploading, setImageUploading] = useState(false);

    const buildProcessLikeTemplateContent = useCallback((includeSizes: boolean, includeImages: boolean) => {
      if (!editTableData || !isProcessTableData(editTableData)) {
        return null;
      }

      const normalizedSteps = normalizeProcessSteps(editTableData.steps as ProcessStepRow[]).map((step) => {
        const unitPrice = Number(step.unitPrice ?? step.price ?? 0) || 0;
        const normalizedStep: ProcessStepRow = {
          processCode: String(step.processCode || '').trim(),
          processName: String(step.processName || '').trim(),
          progressStage: String(step.progressStage || '').trim(),
          machineType: String(step.machineType || '').trim(),
          difficulty: String(step.difficulty || '').trim(),
          standardTime: Number(step.standardTime || 0) || 0,
          unitPrice,
        };

        if (includeSizes && templateSizes.length > 0) {
          normalizedStep.sizePrices = templateSizes.reduce((acc, size) => {
            const value = Number(step.sizePrices?.[size] ?? unitPrice) || 0;
            acc[size] = value;
            return acc;
          }, {} as Record<string, number>);
        }

        return normalizedStep;
      });

      const nextContent: { steps: ProcessStepRow[]; sizes?: string[] } = {
        steps: normalizedSteps,
      };
      if (includeImages && imageUrls.length > 0) {
        (nextContent as { images?: string[] }).images = imageUrls;
      }
      if (includeSizes && templateSizes.length > 0) {
        nextContent.sizes = templateSizes;
      }
      return nextContent;
    }, [editTableData, imageUrls, templateSizes]);

    const promptSyncProcessPriceOrders = useCallback(async (styleNo: string) => {
      const shouldSync = await new Promise<boolean>((resolve) => {
        modal.confirm({
          width: '30vw',
          title: '独立工序单价已保存',
          content: (
            <div>
              <p style={{ marginBottom: 8 }}>是否同步到该款号已有的未完成生产订单？</p>
              <p style={{ margin: 0, color: '#8c8c8c', fontSize: 12 }}>
                款号：{styleNo}
              </p>
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

      const syncRes = await api.post<{ code: number; data?: Record<string, unknown>; message?: string }>('/template-library/sync-process-prices', {
        styleNo,
      });
      if (syncRes.code !== 200) {
        message.warning(syncRes.message || '模板已保存，但同步订单失败');
        return;
      }

      const result = syncRes.data || {};
      message.success(
        `${result.scopeLabel || '同步完成'}：${result.totalOrders || 0} 个订单，更新 ${result.totalSynced || 0} 条跟踪单价，刷新 ${result.workflowUpdatedNodes || 0} 个订单工价节点`
      );
    }, [message, modal]);

    const handleUploadImage = useCallback(async (file: File) => {
      if (imageUrls.length >= 4) {
        message.warning('最多上传4张图片');
        return Upload.LIST_IGNORE;
      }
      setImageUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post<{ code: number; data: string; message?: string }>('/common/upload', formData);
        if (res.code !== 200 || !res.data) {
          message.error(res.message || '上传失败');
          return Upload.LIST_IGNORE;
        }
        setImageUrls((prev) => [...prev, res.data].slice(0, 4));
        message.success('图片已上传，保存后生效');
      } catch (e: any) {
        message.error(e?.message || '上传失败');
      } finally {
        setImageUploading(false);
      }
      return Upload.LIST_IGNORE;
    }, [imageUrls.length, message]);

    const isLocked = (row?: TemplateLibrary | null) => {
      const v = Number(row?.locked);
      return Number.isFinite(v) && v === 1;
    };

    const openEdit = useCallback(async (row: TemplateLibrary) => {
      let latestRow = row;
      if (row?.id) {
        try {
          const res = await api.get<{ code: number; data: TemplateLibrary }>(`/template-library/${row.id}`);
          if (res.code === 200 && res.data) {
            latestRow = res.data as TemplateLibrary;
          }
        } catch {
          // ignore
        }
      }

      if (isLocked(latestRow)) {
        message.error('模板已锁定，如需修改请先退回');
        return;
      }
      setEditingRow(latestRow);
      let contentData: unknown = row?.templateContent;
      if (row?.id) {
        try {
          const res = await api.get<{ code: number; data: TemplateLibrary }>(`/template-library/${row.id}`);
          if (res.code === 200) {
            contentData = res.data?.templateContent ?? contentData;
          }
        } catch {
          // ignore
        }
      }

      let parsed: unknown = null;
      if (typeof contentData === 'object' && contentData !== null) {
        parsed = contentData;
      } else {
        const content = String(contentData ?? '');
        try {
          parsed = JSON.parse(content);
        } catch {
          setEditTableData(null);
          setTemplateSizes(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
          setShowSizePrices(false);
          setEditOpen(true);
          return;
        }
      }

      const normalizedType = String(latestRow?.templateType || '').trim().toLowerCase();
      const allowProcessPriceImages = normalizedType === 'process_price';
      const isProcessLikeType = normalizedType === 'process' || normalizedType === 'process_price';
      if (isProcessLikeType && Array.isArray(parsed)) {
        parsed = { steps: normalizeProcessSteps(parsed as ProcessStepRow[]) };
      }
      if (
        isProcessLikeType &&
        parsed &&
        typeof parsed === 'object' &&
        Array.isArray((parsed as any).steps)
      ) {
        parsed = {
          ...(parsed as any),
          steps: normalizeProcessSteps((parsed as any).steps as ProcessStepRow[]),
        };
      }
      if (normalizedType === 'size' && Array.isArray(parsed)) {
        parsed = convertStyleSizeListToTable(parsed as any[]);
      }
      setEditTableData(parsed);
      if (allowProcessPriceImages && parsed && typeof parsed === 'object' && Array.isArray((parsed as { images?: unknown[] }).images)) {
        setImageUrls(((parsed as { images?: unknown[] }).images || []).map((item) => String(item || '').trim()).filter(Boolean));
      } else {
        setImageUrls([]);
      }
      if (parsed && typeof parsed === 'object' && 'sizes' in parsed && Array.isArray((parsed as any).sizes)) {
        setTemplateSizes((parsed as any).sizes);
        setShowSizePrices(true);
      } else {
        setTemplateSizes(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
        setShowSizePrices(false);
      }

      setEditOpen(true);

      setTimeout(() => {
        createForm.resetFields();
        createForm.setFieldsValue({
          templateName: latestRow.templateName,
          templateKey: latestRow.templateKey,
          templateType: latestRow.templateType,
          sourceStyleNo: latestRow.sourceStyleNo || undefined,
        });
      }, 50);
    }, [createForm, message]);

    // 暴露 openEdit 给父组件
    React.useImperativeHandle(ref, () => ({ openEdit }), [openEdit]);

    const submitEdit = async () => {
      try {
        const v = await createForm.validateFields();
        const templateName = String(v.templateName || '').trim();
        if (!templateName) {
          message.error('请输入模板名称');
          return;
        }
        const templateType = String(v.templateType || '').trim();
        if (!templateType) {
          message.error('请选择模板类型');
          return;
        }
        const normalizedType = templateType.toLowerCase();
        const isProcessLikeType = normalizedType === 'process' || normalizedType === 'process_price';
        const includeSizes = isProcessLikeType && showSizePrices && templateSizes.length > 0;
        const includeImages = normalizedType === 'process_price';

        let templateContent = '';
        if (editTableData) {
          if (isProcessLikeType) {
            const nextContent = buildProcessLikeTemplateContent(includeSizes, includeImages);
            if (!nextContent) {
              message.error('模板内容无效');
              return;
            }
            templateContent = JSON.stringify(nextContent);
          } else {
            templateContent = JSON.stringify(editTableData);
          }
        } else {
          message.error('模板内容无效');
          return;
        }

        if (normalizedType === 'process') {
          const confirmed = await new Promise<boolean>((resolve) => {
            modal.confirm({
              width: '30vw',
              title: '工序单价自动同步提醒',
              content: (
                <div>
                  <p style={{ marginBottom: 12 }}>保存工序单价后，系统将自动执行以下操作：</p>
                  <ul style={{ paddingLeft: 20, marginBottom: 12 }}>
                    <li>✅ 自动同步所有未完成订单的工序单价</li>
                    <li>✅ 自动更新工序跟踪表中的单价</li>
                    <li>✅ 后续扫码将自动使用最新单价</li>
                  </ul>
                  <p style={{ marginTop: 8, fontSize: 13, color: '#8c8c8c' }}>
                    提示：自动同步过程通常需要 1-3 秒完成
                  </p>
                </div>
              ),
              okText: '确认保存',
              cancelText: '取消',
              onOk: () => resolve(true),
              onCancel: () => resolve(false),
            });
          });
          if (!confirmed) return;
        }

        setEditSaving(true);

        if (normalizedType === 'process_price') {
          const styleNo = String(v.sourceStyleNo || editingRow?.sourceStyleNo || '').trim();
          if (!styleNo) {
            message.error('独立款号模板必须绑定来源款号');
            return;
          }

          const processPriceContent = buildProcessLikeTemplateContent(includeSizes, true);
          if (!processPriceContent) {
            message.error('模板内容无效');
            return;
          }

          const saveRes = await api.post<{ code: number; message?: string }>('/template-library/process-price-template', {
            styleNo,
            templateName,
            templateContent: processPriceContent,
          });
          if (saveRes.code !== 200) {
            message.error(saveRes.message || '更新失败');
            return;
          }

          setEditOpen(false);
          setEditingRow(null);
          setEditTableData(null);
          setImageUrls([]);
          onFetchList({ page: 1 });
          await promptSyncProcessPriceOrders(styleNo);
          return;
        }

        const body = {
          id: editingRow?.id,
          templateName,
          templateKey: String(v.templateKey || '').trim() || null,
          templateType,
          sourceStyleNo: v.sourceStyleNo || null,
          templateContent,
        };

        const res = await api.put<{ code: number; message: string }>(`/template-library/${editingRow?.id}`, body);
        if (res.code !== 200) {
          message.error(res.message || '更新失败');
          return;
        }

        message.success('更新成功');
        setEditOpen(false);
        setEditingRow(null);
        setEditTableData(null);
        setImageUrls([]);
        onFetchList({ page: 1 });
      } catch (e: any) {
        if (hasErrorFields(e)) return;
        message.error(getErrorMessage(e, '更新失败'));
      } finally {
        setEditSaving(false);
      }
    };

    // sizeColumns（仅 size 类型编辑用）
    const sizeColumns = useMemo(() => {
      if (!editTableData) return null;
      if (editingRow?.templateType !== 'size') return null;
      if (!isSizeTableData(editTableData)) return null;
      const sizeTable = editTableData as any;
      const baseColumn = {
        title: '部位',
        dataIndex: 'partName',
        width: 100,
        render: (text: string, _: SizeTablePart, index: number) => (
          <Input
            size="small"
            value={text}
            onChange={(e) => {
              const newData = { ...sizeTable, parts: [...sizeTable.parts] };
              const part = newData.parts[index];
              if (!part) return;
              newData.parts[index] = { ...part, partName: e.target.value };
              setEditTableData(newData);
            }}
            style={{ border: 'none' }}
          />
        ),
      };
      const dynamicColumns = sizeTable.sizes.map((size: string, sIdx: number) => ({
        title: (
          <Input
            size="small"
            value={size}
            onChange={(e) => {
              const newData = { ...sizeTable };
              newData.sizes[sIdx] = e.target.value;
              setEditTableData(newData);
            }}
            style={{ border: 'none', background: 'transparent', textAlign: 'center' }}
          />
        ),
        dataIndex: ['values', size],
        width: 80,
        render: (_: string, record: SizeTablePart, pIdx: number) => (
          <Input
            size="small"
            value={record.values?.[size] || ''}
            onChange={(e) => {
              const newData = { ...sizeTable, parts: [...sizeTable.parts] };
              const part = newData.parts[pIdx];
              if (!part) return;
              const values = { ...(part.values || {}) } as Record<string, string>;
              values[size] = e.target.value;
              newData.parts[pIdx] = { ...part, values };
              setEditTableData(newData);
            }}
            style={{ border: 'none' }}
          />
        ),
      }));
      return [baseColumn, ...dynamicColumns];
    }, [editTableData, editingRow?.templateType]);

    return (
      <ResizableModal
        title={editingRow?.id ? '编辑模板' : '编辑模板'}
        open={editOpen}
        centered
        onCancel={() => {
          setEditOpen(false);
          setEditingRow(null);
          setImageUrls([]);
        }}
        onOk={submitEdit}
        okText="保存"
        cancelText="取消"
        confirmLoading={editSaving}
        width={modalWidth}
        initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
      >
        <Form form={createForm} layout="vertical">
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <Form.Item
              name="templateName"
              label="模板名称"
              rules={[{ required: true, message: '请输入模板名称' }]}
              style={{ flex: 2, marginBottom: 0 }}
            >
              <Input placeholder="例如：外协款-BOM模板" size="small" />
            </Form.Item>
            <Form.Item name="templateKey" label="模板标识(可选)" style={{ flex: 1, marginBottom: 0 }}>
              <Input placeholder="不填则保持原标识" size="small" />
            </Form.Item>
            <Form.Item
              name="templateType"
              label="模板类型"
              rules={[{ required: true, message: '请选择模板类型' }]}
              style={{ flex: 1, marginBottom: 0 }}
            >
              <Select
                placeholder="请选择"
                size="small"
                options={[
                  { value: 'bom', label: 'BOM' },
                  { value: 'size', label: '尺寸' },
                  { value: 'process', label: '工艺' },
                  { value: 'process_price', label: '工序进度单价' },
                ]}
                disabled
              />
            </Form.Item>
            <Form.Item name="sourceStyleNo" label="来源款号(可选)" style={{ flex: 1, marginBottom: 0 }}>
              <Select
                allowClear
                size="small"
                showSearch={{ filterOption: false, onSearch: onStyleNoSearch }}
                loading={styleNoLoading}
                placeholder="搜索/选择款号"
                options={styleNoOptions}
                onOpenChange={onStyleNoDropdownOpen}
              />
            </Form.Item>
          </div>
          <Form.Item label="模板内容">
            {editTableData ? (
              <div style={{ maxHeight: 400, overflow: 'auto', border: '1px solid var(--color-border)', padding: 8, fontSize: EDITOR_FONT_SIZE }}>
                {(() => {
                  const type = editingRow?.templateType;

                  // ---- 尺寸表模板 ----
                  if (type === 'size' && isSizeTableData(editTableData) && sizeColumns) {
                    return (
                      <ResizableTable
                        storageKey="template-size-edit"
                        dataSource={editTableData.parts}
                        columns={sizeColumns}
                        pagination={false}
                        size="small"
                        bordered
                        rowKey={(record) => (record as any).size || `size-${Math.random()}`}
                      />
                    );
                  }

                  // ---- BOM表模板 ----
                  if (type === 'bom' && (isBomTableData(editTableData) || isBomTableContainer(editTableData))) {
                    const bomRows = isBomTableContainer(editTableData) ? editTableData.rows : editTableData;
                    const bomColumns = [
                      {
                        title: '物料名称',
                        dataIndex: 'materialName',
                        width: 150,
                        render: (text: string, _: BomTableRow, idx: number) => (
                          <Input
                            size="small"
                            value={text || ''}
                            onChange={(e) => {
                              const newRows = [...bomRows];
                              newRows[idx] = { ...newRows[idx], materialName: e.target.value };
                              const newData = isBomTableContainer(editTableData) ? { rows: newRows } : newRows;
                              setEditTableData(newData);
                            }}
                            style={{ border: 'none' }}
                          />
                        ),
                      },
                      {
                        title: '规格',
                        dataIndex: 'spec',
                        width: 120,
                        render: (text: string, _: BomTableRow, idx: number) => (
                          <Input
                            size="small"
                            value={text || ''}
                            onChange={(e) => {
                              const newRows = [...bomRows];
                              newRows[idx] = { ...newRows[idx], spec: e.target.value };
                              const newData = isBomTableContainer(editTableData) ? { rows: newRows } : newRows;
                              setEditTableData(newData);
                            }}
                            style={{ border: 'none' }}
                          />
                        ),
                      },
                      {
                        title: '用量',
                        dataIndex: 'quantity',
                        width: 100,
                        render: (text: string, _: BomTableRow, idx: number) => (
                          <Input
                            size="small"
                            value={text || ''}
                            onChange={(e) => {
                              const newRows = [...bomRows];
                              newRows[idx] = { ...newRows[idx], quantity: e.target.value };
                              const newData = isBomTableContainer(editTableData) ? { rows: newRows } : newRows;
                              setEditTableData(newData);
                            }}
                            style={{ border: 'none' }}
                          />
                        ),
                      },
                      {
                        title: '单位',
                        dataIndex: 'unit',
                        width: 80,
                        render: (text: string, _: BomTableRow, idx: number) => (
                          <Input
                            size="small"
                            value={text || ''}
                            onChange={(e) => {
                              const newRows = [...bomRows];
                              newRows[idx] = { ...newRows[idx], unit: e.target.value };
                              const newData = isBomTableContainer(editTableData) ? { rows: newRows } : newRows;
                              setEditTableData(newData);
                            }}
                            style={{ border: 'none' }}
                          />
                        ),
                      },
                    ];
                    return (
                      <ResizableTable
                        storageKey="template-bom-edit"
                        dataSource={bomRows}
                        columns={bomColumns}
                        pagination={false}
                        size="small"
                        bordered
                        rowKey={(record) =>
                          (record as any).materialCode || (record as any).id || `bom-${Math.random()}`
                        }
                      />
                    );
                  }

                  // ---- 工序进度单价模板（合并后的综合模板）----
                  if ((type === 'process' || type === 'process_price') && isProcessTableData(editTableData)) {
                    const allowProcessPriceImages = type === 'process_price';
                    const SizePriceManager = () => (
                      <div style={{ marginBottom: 12, padding: '10px 12px', background: '#f9f9f9', fontSize: EDITOR_FONT_SIZE }}>
                        {allowProcessPriceImages ? (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: EDITOR_FONT_SIZE, fontWeight: 500, marginBottom: 6 }}>款号参考图</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            {imageUrls.map((url) => (
                              <div key={url} style={{ position: 'relative', width: 52, height: 52 }}>
                                <Image
                                  src={getFullAuthedFileUrl(url)}
                                  width={52}
                                  height={52}
                                  style={{ objectFit: 'cover', borderRadius: 4, border: '1px solid #f0f0f0' }}
                                  preview
                                />
                                <Button
                                  type="text"
                                  size="small"
                                  danger
                                  icon={<DeleteOutlined />}
                                  onClick={() => setImageUrls((prev) => prev.filter((item) => item !== url))}
                                  style={{ position: 'absolute', top: -8, right: -8, minWidth: 18, width: 18, height: 18, padding: 0, background: '#fff', borderRadius: '50%', boxShadow: '0 1px 4px rgba(0,0,0,0.12)' }}
                                />
                              </div>
                            ))}
                            {imageUrls.length < 4 && (
                              <Upload
                                accept="image/*"
                                showUploadList={false}
                                beforeUpload={(file) => handleUploadImage(file as File)}
                              >
                                <Button size="small" icon={<UploadOutlined />} loading={imageUploading}>
                                  上传图片
                                </Button>
                              </Upload>
                            )}
                          </div>
                        </div>
                        ) : null}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                          <Checkbox
                            checked={showSizePrices}
                            onChange={(e) => setShowSizePrices(e.target.checked)}
                          >
                            显示多码单价
                          </Checkbox>
                          {showSizePrices && (
                            <span style={{ color: 'var(--neutral-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                              (各尺码单价不同时使用，默认使用工价)
                            </span>
                          )}
                        </div>
                        {showSizePrices && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ color: 'var(--neutral-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                              尺码：
                            </span>
                            {templateSizes.map((s) => (
                              <Tag
                                key={s}
                                closable
                                style={{ fontSize: EDITOR_FONT_SIZE, lineHeight: '18px', marginInlineEnd: 4 }}
                                onClose={() => {
                                  setTemplateSizes((prev) => prev.filter((x) => x !== s));
                                  const newData = {
                                    ...editTableData,
                                    sizes: templateSizes.filter((x) => x !== s),
                                    steps: editTableData.steps.map((step: ProcessStepRow) => {
                                      if (step.sizePrices) {
                                        const { [s]: _, ...rest } = step.sizePrices;
                                        return { ...step, sizePrices: rest };
                                      }
                                      return step;
                                    }),
                                  };
                                  setEditTableData(newData);
                                }}
                              >
                                {s}
                              </Tag>
                            ))}
                            <Input
                              size="small"
                              placeholder="添加尺码"
                              value={newSizeName}
                              onChange={(e) => setNewSizeName(e.target.value)}
                              onPressEnter={() => {
                                const trimmed = newSizeName.trim().toUpperCase();
                                if (!trimmed || templateSizes.includes(trimmed)) return;
                                setTemplateSizes((prev) => [...prev, trimmed]);
                                const newData = {
                                  ...editTableData,
                                  sizes: [...templateSizes, trimmed],
                                  steps: editTableData.steps.map((step: ProcessStepRow) => ({
                                    ...step,
                                    sizePrices: {
                                      ...(step.sizePrices || {}),
                                      [trimmed]: step.unitPrice ?? step.price ?? 0,
                                    },
                                  })),
                                };
                                setEditTableData(newData);
                                setNewSizeName('');
                              }}
                              style={{ width: 100 }}
                            />
                            <Button
                              size="small"
                              type="primary"
                              onClick={() => {
                                const trimmed = newSizeName.trim().toUpperCase();
                                if (!trimmed || templateSizes.includes(trimmed)) return;
                                setTemplateSizes((prev) => [...prev, trimmed]);
                                const newData = {
                                  ...editTableData,
                                  sizes: [...templateSizes, trimmed],
                                  steps: editTableData.steps.map((step: ProcessStepRow) => ({
                                    ...step,
                                    sizePrices: {
                                      ...(step.sizePrices || {}),
                                      [trimmed]: step.unitPrice ?? step.price ?? 0,
                                    },
                                  })),
                                };
                                setEditTableData(newData);
                                setNewSizeName('');
                              }}
                            >
                              添加
                            </Button>
                          </div>
                        )}
                      </div>
                    );

                    const baseColumns = [
                      {
                        title: '排序',
                        width: 44,
                        render: (_: unknown, __: ProcessStepRow, idx: number) => (
                          <span style={{ color: 'var(--neutral-text-disabled)', fontSize: EDITOR_FONT_SIZE }}>
                            {idx + 1}
                          </span>
                        ),
                      },
                      {
                        title: '工序编号',
                        dataIndex: 'processCode',
                        width: 72,
                        render: (text: string, _: ProcessStepRow, idx: number) => (
                          <Input
                            size="small"
                            value={text || ''}
                            onChange={(e) => {
                              const newData = { ...editTableData, steps: [...editTableData.steps] };
                              newData.steps[idx] = { ...newData.steps[idx], processCode: e.target.value };
                              setEditTableData(newData);
                            }}
                            style={{ border: 'none', fontSize: EDITOR_FONT_SIZE, padding: 0 }}
                          />
                        ),
                      },
                      {
                        title: '工序名称',
                        dataIndex: 'processName',
                        width: 110,
                        render: (text: string, _: ProcessStepRow, idx: number) => (
                          <DictAutoComplete
                            dictType="process_name"
                            autoCollect
                            size="small"
                            value={text || ''}
                            onChange={(value) => {
                              const newData = { ...editTableData, steps: [...editTableData.steps] };
                              newData.steps[idx] = { ...newData.steps[idx], processName: value as string };
                              setEditTableData(newData);
                            }}
                            style={{ border: 'none', fontSize: EDITOR_FONT_SIZE }}
                          />
                        ),
                      },
                      {
                        title: '进度节点',
                        dataIndex: 'progressStage',
                        width: 96,
                        render: (value: string, _: ProcessStepRow, idx: number) => (
                          <Select
                            size="small"
                            value={value || undefined}
                            options={MAIN_PROGRESS_STAGE_OPTIONS}
                            placeholder="选择父节点"
                            allowClear
                            onChange={(val) => {
                              const newData = { ...editTableData, steps: [...editTableData.steps] };
                              newData.steps[idx] = { ...newData.steps[idx], progressStage: val || '' };
                              setEditTableData(newData);
                            }}
                            style={{ width: '100%', fontSize: EDITOR_FONT_SIZE }}
                            variant="borderless"
                          />
                        ),
                      },
                      {
                        title: '机器类型',
                        dataIndex: 'machineType',
                        width: 120,
                        render: (text: string, _: ProcessStepRow, idx: number) => (
                          <DictAutoComplete
                            dictType="machine_type"
                            autoCollect
                            size="small"
                            value={text || ''}
                            onChange={(value) => {
                              const newData = { ...editTableData, steps: [...editTableData.steps] };
                              newData.steps[idx] = { ...newData.steps[idx], machineType: value as string };
                              setEditTableData(newData);
                            }}
                            style={{ border: 'none', fontSize: EDITOR_FONT_SIZE }}
                          />
                        ),
                      },
                      {
                        title: '工序难度',
                        dataIndex: 'difficulty',
                        width: 92,
                        render: (value: string, _: ProcessStepRow, idx: number) => (
                          <Select
                            size="small"
                            value={value || undefined}
                            allowClear
                            placeholder="选择"
                            onChange={(val) => {
                              const newData = { ...editTableData, steps: [...editTableData.steps] };
                              newData.steps[idx] = { ...newData.steps[idx], difficulty: val || '' };
                              setEditTableData(newData);
                            }}
                            options={[
                              { value: '易', label: '易' },
                              { value: '中', label: '中' },
                              { value: '难', label: '难' },
                            ]}
                            style={{ width: '100%', fontSize: EDITOR_FONT_SIZE }}
                            variant="borderless"
                          />
                        ),
                      },
                      {
                        title: '工时(秒)',
                        dataIndex: 'standardTime',
                        width: 84,
                        render: (value: number, _: ProcessStepRow, idx: number) => (
                          <InputNumber
                            size="small"
                            value={value || 0}
                            min={0}
                            onChange={(val) => {
                              const newData = { ...editTableData, steps: [...editTableData.steps] };
                              newData.steps[idx] = { ...newData.steps[idx], standardTime: val || 0 };
                              setEditTableData(newData);
                            }}
                            style={{ width: '100%', fontSize: EDITOR_FONT_SIZE }}
                          />
                        ),
                      },
                      {
                        title: '工价(元)',
                        dataIndex: 'unitPrice',
                        width: 88,
                        render: (_: unknown, item: ProcessStepRow, idx: number) => (
                          <InputNumber
                            size="small"
                            value={item.unitPrice ?? item.price ?? 0}
                            min={0}
                            precision={2}
                            onChange={(val) => {
                              const newData = { ...editTableData, steps: [...editTableData.steps] };
                              newData.steps[idx] = { ...newData.steps[idx], unitPrice: val || 0 };
                              setEditTableData(newData);
                            }}
                            style={{ width: '100%', fontSize: EDITOR_FONT_SIZE }}
                          />
                        ),
                      },
                    ];

                    const sizePriceCols = showSizePrices
                      ? templateSizes.map((size) => ({
                          title: `${size}码`,
                          width: 78,
                          render: (_: unknown, item: ProcessStepRow, idx: number) => (
                            <div style={{ background: 'var(--color-bg-container)' }}>
                              <InputNumber
                                size="small"
                                value={item.sizePrices?.[size] ?? item.unitPrice ?? item.price ?? 0}
                                min={0}
                                precision={2}
                                onChange={(val) => {
                                  const newData = { ...editTableData, steps: [...editTableData.steps] };
                                  newData.steps[idx] = {
                                    ...newData.steps[idx],
                                    sizePrices: {
                                      ...(newData.steps[idx].sizePrices || {}),
                                      [size]: val || 0,
                                    },
                                  };
                                  setEditTableData(newData);
                                }}
                                style={{ width: '100%', fontSize: EDITOR_FONT_SIZE }}
                              />
                            </div>
                          ),
                        }))
                      : [];

                    const actionColumn = {
                      title: '操作',
                      width: 44,
                      render: (_: unknown, __: ProcessStepRow, idx: number) => (
                        <Button
                          type="link"
                          danger
                          size="small"
                          icon={<DeleteOutlined style={{ fontSize: EDITOR_FONT_SIZE }} />}
                          onClick={() => {
                            const kept = editTableData.steps.filter((_s: ProcessStepRow, i: number) => i !== idx);
                            const newData = { ...editTableData, steps: normalizeProcessSteps(kept) };
                            setEditTableData(newData);
                          }}
                          style={{ padding: 0 }}
                        />
                      ),
                    };

                    const processColumns = [...baseColumns, ...sizePriceCols, actionColumn];

                    return (
                      <div>
                        <SizePriceManager />
                        <ResizableTable
                          storageKey="template-process-edit"
                          dataSource={editTableData.steps}
                          columns={processColumns}
                          pagination={false}
                          size="small"
                          bordered
                          scroll={{ x: showSizePrices ? 860 + templateSizes.length * 78 : 860 }}
                          rowKey={(record) =>
                            (record as any).processCode || (record as any).id || `process-${Math.random()}`
                          }
                          footer={() => (
                            <Button
                              type="dashed"
                              size="small"
                              style={{ width: '100%' }}
                              onClick={() => {
                                const maxCode = editTableData.steps.reduce((max: number, step: ProcessStepRow) => {
                                  const code = Number.parseInt(String(step.processCode ?? '').trim() || '0', 10);
                                  return Number.isFinite(code) && code > max ? code : max;
                                }, 0);
                                const nextCode = String(maxCode + 1).padStart(2, '0');
                                const newRow: ProcessStepRow = {
                                  processCode: nextCode,
                                  processName: '',
                                  progressStage: '',
                                  machineType: '',
                                  standardTime: 0,
                                  unitPrice: 0,
                                  sizePrices: templateSizes.reduce((acc, size) => ({ ...acc, [size]: 0 }), {}),
                                };
                                const newData = { ...editTableData, steps: [...editTableData.steps, newRow] };
                                setEditTableData(newData);
                              }}
                            >
                              添加工序
                            </Button>
                          )}
                        />
                      </div>
                    );
                  }

                  // ---- 工序单价模板（旧格式，兼容）----
                  if (type === 'process_price' && isProcessPriceTableData(editTableData)) {
                    const processPriceColumns = [
                      {
                        title: '工序编号',
                        dataIndex: 'processCode',
                        width: 100,
                        render: (text: string, _: ProcessPriceRow, idx: number) => (
                          <Input
                            size="small"
                            value={text || ''}
                            onChange={(e) => {
                              const newData = { ...editTableData, steps: [...editTableData.steps] };
                              newData.steps[idx] = { ...newData.steps[idx], processCode: e.target.value };
                              setEditTableData(newData);
                            }}
                            style={{ border: 'none' }}
                          />
                        ),
                      },
                      {
                        title: '工序名称',
                        dataIndex: 'processName',
                        width: 150,
                        render: (text: string, _: ProcessPriceRow, idx: number) => (
                          <DictAutoComplete
                            dictType="process_name"
                            autoCollect
                            size="small"
                            value={text || ''}
                            onChange={(value) => {
                              const newData = { ...editTableData, steps: [...editTableData.steps] };
                              newData.steps[idx] = { ...newData.steps[idx], processName: value as string };
                              setEditTableData(newData);
                            }}
                            style={{ border: 'none' }}
                          />
                        ),
                      },
                      {
                        title: '单价(元)',
                        dataIndex: 'unitPrice',
                        width: 100,
                        render: (value: number, _: ProcessPriceRow, idx: number) => (
                          <InputNumber
                            size="small"
                            value={value || 0}
                            min={0}
                            precision={2}
                            onChange={(val) => {
                              const newData = { ...editTableData, steps: [...editTableData.steps] };
                              newData.steps[idx] = { ...newData.steps[idx], unitPrice: val || 0 };
                              setEditTableData(newData);
                            }}
                            style={{ width: '100%' }}
                          />
                        ),
                      },
                    ];
                    return (
                      <ResizableTable
                        storageKey="template-process-price-edit"
                        dataSource={editTableData.steps}
                        columns={processPriceColumns}
                        pagination={false}
                        size="small"
                        bordered
                        rowKey={(record) =>
                          (record as any).processCode || (record as any).id || `price-${Math.random()}`
                        }
                      />
                    );
                  }

                  // ---- 其他类型：JSON展示 ----
                  return (
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
                      {JSON.stringify(editTableData, null, 2)}
                    </pre>
                  );
                })()}
              </div>
            ) : (
              <div style={{ color: 'var(--neutral-text-disabled)', padding: 8 }}>无效的模板内容</div>
            )}
          </Form.Item>
        </Form>
      </ResizableModal>
    );
  }
);

EditTemplateModal.displayName = 'EditTemplateModal';

export default EditTemplateModal;
