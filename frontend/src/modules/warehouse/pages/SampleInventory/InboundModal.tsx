import React, { useEffect, useRef } from 'react';
import { Form, Input, Select, Row, Col, Image, Tag, Table, Alert } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import type { InputRef } from 'antd';
import { SampleTypeMap } from './types';
import api from '@/utils/api';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { message } from '@/utils/antdStatic';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';

interface InboundModalProps {
  visible: boolean;
  onCancel: () => void;
  onSuccess: () => void;
  initialValues?: Record<string, any>;
}

const { Option } = Select;
type SizeColorMatrixRow = { color?: string; quantities?: number[] };
type StyleSnapshot = {
  styleId: string;
  styleNo: string;
  styleName: string;
  patternNo: string;
  sampleCompletedTime: string;
  cover: string;
  colors: string[];
  sizes: string[];
  planRows: InboundPlanRow[];
};
type InboundPlanRow = { key: string; color: string; size: string; quantity: number };
type ExistingStockRow = { color?: string; size?: string; inventoryStatus?: string };

const normalizeText = (value: unknown) => String(value || '').trim();

const uniqueValues = (values: unknown[]) => {
  const seen = new Set<string>();
  return values
    .map((item) => normalizeText(item))
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
};

const splitCandidateValues = (value: unknown) => uniqueValues(
  normalizeText(value)
    .split(/[/,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
);

const parseSizeColorConfig = (raw: unknown) => {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
    const sizes = Array.isArray((parsed as any)?.sizes)
      ? (parsed as any).sizes.map((item: unknown) => normalizeText(item)).filter(Boolean)
      : [];
    const colors = Array.isArray((parsed as any)?.colors)
      ? (parsed as any).colors.map((item: unknown) => normalizeText(item)).filter(Boolean)
      : [];
    const quantities = Array.isArray((parsed as any)?.quantities)
      ? (parsed as any).quantities.map((item: unknown) => Number(item || 0))
      : [];
    const matrixRows = Array.isArray((parsed as any)?.matrixRows) ? (parsed as any).matrixRows : [];
    return { sizes, colors, quantities, matrixRows };
  } catch {
    return { sizes: [] as string[], colors: [] as string[], quantities: [] as number[], matrixRows: [] as SizeColorMatrixRow[] };
  }
};

const buildInboundPlanRows = (detail?: Record<string, any> | null): InboundPlanRow[] => {
  if (!detail) return [];
  const config = parseSizeColorConfig(detail?.sizeColorConfig);
  const matrixRows = config.matrixRows
    .map((row: SizeColorMatrixRow) => ({
      color: normalizeText(row?.color),
      quantities: Array.isArray(row?.quantities) ? row.quantities.map((qty: number) => Number(qty || 0)) : [],
    }))
    .filter((row: { color: string; quantities: number[] }) => row.color);

  const rowsFromMatrix = matrixRows.flatMap((row: { color: string; quantities: number[] }) =>
    row.quantities
      .map((qty: number, index: number) => ({
        key: `${row.color}-${normalizeText(config.sizes[index])}`,
        color: row.color,
        size: normalizeText(config.sizes[index]),
        quantity: Number(qty || 0),
      }))
      .filter((item: InboundPlanRow) => item.color && item.size && item.quantity > 0)
  );
  if (rowsFromMatrix.length) {
    return rowsFromMatrix;
  }

  const directColor = normalizeText(detail?.color) || (config.colors.length === 1 ? config.colors[0] : '');
  const normalizedTopLevelRows = config.sizes
    .map((size: string, index: number) => ({
      key: `${directColor}-${size}`,
      color: directColor,
      size,
      quantity: Number(config.quantities[index] || 0),
    }))
    .filter((item: InboundPlanRow) => item.color && item.size && item.quantity > 0);
  if (normalizedTopLevelRows.length) {
    return normalizedTopLevelRows;
  }

  const directColorFallback = normalizeText(detail?.color);
  const directSize = normalizeText(detail?.size);
  const directQuantity = Number(detail?.sampleQuantity || detail?.quantity || 0);
  if (directColorFallback && directSize && directQuantity > 0 && splitCandidateValues(detail?.size).length <= 1 && splitCandidateValues(detail?.color).length <= 1) {
    return [{ key: `${directColorFallback}-${directSize}`, color: directColorFallback, size: directSize, quantity: directQuantity }];
  }
  return [];
};

const buildInboundSeedFromStyle = (detail: Record<string, any>) => {
  const planRows = buildInboundPlanRows(detail);
  const colorCandidates = uniqueValues([
    ...planRows.map((row) => row.color),
  ]);
  const sizeCandidates = uniqueValues([
    ...planRows.map((row) => row.size),
  ]);
  const color = colorCandidates.length === 1 ? colorCandidates[0] : '';
  const size = sizeCandidates.length === 1 ? sizeCandidates[0] : '';

  return {
    styleId: normalizeText(detail?.id),
    styleNo: normalizeText(detail?.styleNo),
    styleName: normalizeText(detail?.styleName),
    sampleType: normalizeText(detail?.sampleType) || 'development',
    color,
    size,
  };
};

const buildStyleSnapshot = (detail?: Record<string, any> | null): StyleSnapshot | null => {
  if (!detail) return null;
  const config = parseSizeColorConfig(detail?.sizeColorConfig);
  const matrixRows = config.matrixRows as Array<SizeColorMatrixRow & { imageUrl?: string }>;
  const cover = normalizeText(detail?.cover)
    || matrixRows
      .map((row) => normalizeText(row?.imageUrl))
      .find(Boolean)
    || '';
  return {
    styleId: normalizeText(detail?.id),
    styleNo: normalizeText(detail?.styleNo),
    styleName: normalizeText(detail?.styleName),
    patternNo: normalizeText(detail?.patternNo),
    sampleCompletedTime: normalizeText(detail?.sampleCompletedTime || detail?.completedTime),
    cover,
    colors: uniqueValues(buildInboundPlanRows(detail).map((row) => row.color)),
    sizes: uniqueValues(buildInboundPlanRows(detail).map((row) => row.size)),
    planRows: buildInboundPlanRows(detail),
  };
};

const isNotFoundError = (error: unknown) => {
  const status = Number((error as { response?: { status?: number } })?.response?.status || 0);
  return status === 404;
};

const InboundModal: React.FC<InboundModalProps> = ({ visible, onCancel, onSuccess, initialValues }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = React.useState(false);
  const [smartError, setSmartError] = React.useState<SmartErrorInfo | null>(null);
  const [prefillLoading, setPrefillLoading] = React.useState(false);
  const [styleSnapshot, setStyleSnapshot] = React.useState<StyleSnapshot | null>(null);
  const showSmartErrorNotice = React.useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code, actionText: '重试提交' });
  };

  // Refs for focus management (better for scanner)
  const styleNoRef = useRef<InputRef>(null);
  const latestHydratedRef = useRef('');

  const applySeedValues = React.useCallback((seed?: Record<string, any>, overwrite = false) => {
    if (!seed) return;
    const current = form.getFieldsValue();
    const nextValues: Record<string, any> = {};
    Object.entries(seed).forEach(([key, value]) => {
      const normalizedCurrent = typeof current[key] === 'string' ? normalizeText(current[key]) : current[key];
      const normalizedValue = typeof value === 'string' ? normalizeText(value) : value;
      const shouldSet = overwrite
        || normalizedCurrent === undefined
        || normalizedCurrent === null
        || normalizedCurrent === ''
        || (key === 'quantity' && Number(normalizedCurrent || 0) <= 1 && Number(normalizedValue || 0) > 1);
      if (shouldSet && normalizedValue !== undefined && normalizedValue !== null && normalizedValue !== '') {
        nextValues[key] = normalizedValue;
      }
    });
    if (Object.keys(nextValues).length) {
      form.setFieldsValue(nextValues);
    }
  }, [form]);

  const hydrateStyleFields = React.useCallback(async (source?: string, overwrite = false) => {
    const styleKey = normalizeText(source);
    if (!styleKey || latestHydratedRef.current === styleKey) return;
    setPrefillLoading(true);
    try {
      const res = await api.get(`/style/info/${encodeURIComponent(styleKey)}`);
      if ((res as any)?.code === 200 && (res as any)?.data) {
        const nextSnapshot = buildStyleSnapshot((res as any).data);
        applySeedValues(buildInboundSeedFromStyle((res as any).data), overwrite);
        setStyleSnapshot(nextSnapshot);
        latestHydratedRef.current = styleKey;
      }
    } catch {
      setStyleSnapshot(null);
    } finally {
      setPrefillLoading(false);
    }
  }, [applySeedValues]);

  useEffect(() => {
    if (visible) {
      latestHydratedRef.current = '';
      const nextSnapshot = buildStyleSnapshot(initialValues);
      setStyleSnapshot(nextSnapshot);
      form.resetFields();
      applySeedValues(initialValues, true);
      const styleKey = normalizeText(initialValues?.styleId) || normalizeText(initialValues?.styleNo);
      if (styleKey) {
        void hydrateStyleFields(styleKey, true);
      }
      // Auto focus on styleNo when modal opens
      setTimeout(() => styleNoRef.current?.focus(), 100);
    } else {
      setStyleSnapshot(null);
    }
  }, [applySeedValues, form, hydrateStyleFields, initialValues, visible]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      if (!styleSnapshot?.planRows?.length) {
        message.error('未识别到系统可入库明细，请先补齐样衣生产码数与数量');
        return;
      }
      setLoading(true);

      const payload = {
        styleId: styleSnapshot.styleId || values.styleId,
        styleNo: values.styleNo,
        styleName: values.styleName,
        sampleType: values.sampleType,
        location: values.location,
        remark: values.remark,
        imageUrl: styleSnapshot.cover,
        rows: styleSnapshot.planRows.map((row) => ({
          color: row.color,
          size: row.size,
          quantity: row.quantity,
        })),
      };
      let res: { code?: number; message?: string };
      try {
        res = await api.post('/stock/sample/inbound/batch', payload);
      } catch (error) {
        if (!isNotFoundError(error)) {
          throw error;
        }

        const stockRes = await api.get('/stock/sample/list', {
          params: {
            page: 1,
            pageSize: 200,
            styleNo: payload.styleNo,
            sampleType: payload.sampleType,
            recordStatus: 'active',
          },
        }) as { code?: number; data?: { records?: ExistingStockRow[] } };
        const existingRows = Array.isArray(stockRes?.data?.records) ? stockRes.data.records : [];
        const duplicated = payload.rows.find((row) => existingRows.some((item) =>
          String(item?.inventoryStatus || 'active') !== 'destroyed'
          && String(item?.color || '').trim() === row.color
          && String(item?.size || '').trim() === row.size
        ));
        if (duplicated) {
          message.error(`库存已存在：${duplicated.color} / ${duplicated.size}，不能重复入库`);
          return;
        }

        for (const row of payload.rows) {
          const legacyRes = await api.post('/stock/sample/inbound', {
            styleId: payload.styleId,
            styleNo: payload.styleNo,
            styleName: payload.styleName,
            sampleType: payload.sampleType,
            location: payload.location,
            remark: payload.remark,
            imageUrl: payload.imageUrl,
            color: row.color,
            size: row.size,
            quantity: row.quantity,
          });
          if ((legacyRes as { code?: number; message?: string })?.code !== 200) {
            throw new Error((legacyRes as { message?: string })?.message || '入库失败');
          }
        }
        res = { code: 200 };
      }
      if (res.code === 200) {
        message.success('入库成功');
        if (showSmartErrorNotice) setSmartError(null);
        onSuccess();
      } else {
        reportSmartError('样衣入库失败', res.message || '请检查输入后重试', 'SAMPLE_INBOUND_SUBMIT_FAILED');
        message.error(res.message || '入库失败');
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in (error as Record<string, unknown>)) {
        return;
      }
      const errorMessage = (error as Error)?.message || '网络异常或服务不可用，请稍后重试';
      reportSmartError('样衣入库失败', errorMessage, 'SAMPLE_INBOUND_SUBMIT_EXCEPTION');
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ResizableModal
      title="样衣入库 (支持扫码)"
      open={visible}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={loading}
      width="60vw"
      initialHeight={Math.round(window.innerHeight * 0.82)}
    >
      {showSmartErrorNotice && smartError ? (
        <div style={{ marginBottom: 12 }}>
          <SmartErrorNotice
            error={smartError}
            onFix={() => {
              void handleOk();
            }}
          />
        </div>
      ) : null}

      <Form form={form} layout="vertical">
        {(styleSnapshot?.styleNo || styleSnapshot?.styleName || styleSnapshot?.cover) ? (
          <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: 'var(--color-bg-subtle)' }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ width: 96, minWidth: 96 }}>
                {styleSnapshot.cover ? (
                  <Image
                    src={getFullAuthedFileUrl(styleSnapshot.cover)}
                    alt={styleSnapshot.styleName || styleSnapshot.styleNo || '样衣'}
                    width={96}
                    height={96}
                    style={{ objectFit: 'cover', borderRadius: 8 }}
                  />
                ) : (
                  <div style={{ width: 96, height: 96, borderRadius: 8, background: '#f3f4f6', color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>
                    暂无图片
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Row gutter={[12, 8]}>
                  <Col span={8}>
                    <div style={{ color: 'var(--neutral-text-secondary)', fontSize: 12 }}>款号</div>
                    <div>{styleSnapshot.styleNo || '-'}</div>
                  </Col>
                  <Col span={8}>
                    <div style={{ color: 'var(--neutral-text-secondary)', fontSize: 12 }}>款式名称</div>
                    <div>{styleSnapshot.styleName || '-'}</div>
                  </Col>
                  <Col span={8}>
                    <div style={{ color: 'var(--neutral-text-secondary)', fontSize: 12 }}>纸样号</div>
                    <div>{styleSnapshot.patternNo || '-'}</div>
                  </Col>
                  <Col span={8}>
                    <div style={{ color: 'var(--neutral-text-secondary)', fontSize: 12 }}>样衣完成时间</div>
                    <div>{styleSnapshot.sampleCompletedTime || '-'}</div>
                  </Col>
                  <Col span={16}>
                    <div style={{ color: 'var(--neutral-text-secondary)', fontSize: 12, marginBottom: 4 }}>开发颜色 / 尺码</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {(styleSnapshot.colors.length ? styleSnapshot.colors : ['无颜色配置']).map((item) => (
                        <Tag key={`color-${item}`}>{item}</Tag>
                      ))}
                      {(styleSnapshot.sizes.length ? styleSnapshot.sizes : ['无尺码配置']).map((item) => (
                        <Tag key={`size-${item}`} color="blue">{item}</Tag>
                      ))}
                    </div>
                  </Col>
                </Row>
              </div>
            </div>
          </div>
        ) : null}

        {/* 第一行：款号、款式名称、样衣类型 */}
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              name="styleNo"
              label="款号"
              rules={[{ required: true, message: '请输入款号' }]}
              help="扫码枪可直接录入"
            >
              <Input
                ref={styleNoRef}
                placeholder="请输入款号 / 扫码"
                onBlur={() => {
                  const styleNo = normalizeText(form.getFieldValue('styleNo'));
                  if (styleNo) {
                    void hydrateStyleFields(styleNo);
                  }
                }}
                onPressEnter={async (e) => {
                  e.preventDefault();
                  const styleNo = normalizeText(form.getFieldValue('styleNo'));
                  if (styleNo) {
                    await hydrateStyleFields(styleNo);
                  }
                }}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="styleName" label="款式名称">
              <Input placeholder="自动带入款式名称" readOnly />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="sampleType"
              label="样衣类型"
              rules={[{ required: true, message: '请选择样衣类型' }]}
              initialValue="development"
            >
              <Select disabled>
                {Object.entries(SampleTypeMap).map(([key, label]) => (
                  <Option key={key} value={key}>{label}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>系统匹配入库明细</div>
          {prefillLoading ? (
            <Alert type="info" showIcon title="正在从样衣开发与码数配置中匹配颜色、尺码、数量…" />
          ) : styleSnapshot?.planRows?.length ? (
            <Table<InboundPlanRow>
              rowKey="key"
              size="small"
              pagination={false}
              dataSource={styleSnapshot.planRows}
              columns={[
                { title: '颜色', dataIndex: 'color', key: 'color', width: 160 },
                { title: '尺码', dataIndex: 'size', key: 'size', width: 160 },
                { title: '系统入库数量', dataIndex: 'quantity', key: 'quantity', width: 160 },
              ]}
            />
          ) : (
            <Alert
              type="warning"
              showIcon
              title="未识别到样衣生产的颜色、尺码、数量配置，当前不允许手工填写入库明细。请先回样衣开发补齐码数配置后再入库。"
            />
          )}
        </div>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="location" label="存放位置">
              <Input placeholder="例如: A-01-02" />
            </Form.Item>
          </Col>
          <Col span={16}>
            <Form.Item name="remark" label="备注">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </ResizableModal>
  );
};

export default InboundModal;
