import React, { useCallback, useEffect, useState } from 'react';
import { Button, Input, Pagination, Radio, Space, Spin, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import SideDrawer from '@/components/common/SideDrawer';
import SheetRichViewer from '@/components/common/SheetRichViewer';
import StyleCoverThumb from '@/components/StyleAssets/StyleCoverThumb';
import api from '@/utils/api';

const { Text } = Typography;

interface StyleBrief {
  id: string | number;
  styleNo?: string;
  styleName?: string;
  cover?: string;
  styleCover?: string;
  description?: string;
}

interface TemplateBrief {
  id: string | number;
  templateName?: string;
  sourceStyleNo?: string;
}

interface CopyCraftNotesDrawerProps {
  open: boolean;
  onClose: () => void;
  currentStyleId: string | number;
  submitting?: boolean;
  /** 确认导入：把来源款工艺说明 HTML 交给父级（onContentChange + 保存） */
  onConfirm: (html: string) => Promise<void> | void;
}

/**
 * D-340 拷贝其他款工艺说明（侧滑抽屉）：
 * 工艺说明是整篇富文本（非行结构），不走勾选表格——
 * 左栏选来源款/通用模板，右栏富文本预览，确认后整篇导入（父级会再保存）。
 */
const CopyCraftNotesDrawer: React.FC<CopyCraftNotesDrawerProps> = ({
  open,
  onClose,
  currentStyleId,
  submitting = false,
  onConfirm,
}) => {
  const [sourceMode, setSourceMode] = useState<'style' | 'template'>('style');

  const [styleKeywordNo, setStyleKeywordNo] = useState('');
  const [styleKeywordName, setStyleKeywordName] = useState('');
  const [stylePage, setStylePage] = useState(1);
  const stylePageSize = 20;
  const [styles, setStyles] = useState<StyleBrief[]>([]);
  const [styleTotal, setStyleTotal] = useState(0);
  const [styleLoading, setStyleLoading] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<StyleBrief | null>(null);

  const [templates, setTemplates] = useState<TemplateBrief[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateBrief | null>(null);

  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchStyles = useCallback(async (page: number, kwNo?: string, kwName?: string) => {
    setStyleLoading(true);
    try {
      const params: Record<string, unknown> = { page, pageSize: stylePageSize };
      const fkNo = (kwNo ?? styleKeywordNo).trim();
      const fkName = (kwName ?? styleKeywordName).trim();
      if (fkNo) params.styleNo = fkNo;
      if (fkName) params.styleName = fkName;
      const res = await api.get<{ code: number; data: { records?: StyleBrief[]; total?: number } }>('/style/info/list', { params });
      if (res.code === 200) {
        const records = (res.data?.records || []).filter((r) => String(r.id) !== String(currentStyleId));
        setStyles(records);
        setStyleTotal(res.data?.total || records.length);
      } else {
        setStyles([]);
        setStyleTotal(0);
      }
    } catch {
      setStyles([]);
      setStyleTotal(0);
    } finally {
      setStyleLoading(false);
    }
  }, [currentStyleId, styleKeywordName, styleKeywordNo]);

  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const res = await api.get<{ code: number; data: unknown }>('/template-library/list', {
        params: { page: 1, pageSize: 200, templateType: 'craft', keyword: '' },
      });
      if (res.code === 200) {
        const remote = res.data as any;
        setTemplates(Array.isArray(remote) ? remote : (remote?.records || []));
      } else {
        setTemplates([]);
      }
    } catch {
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  /** 拉来源款工艺说明（详情接口含 description 富文本） */
  const fetchDescription = useCallback(async (sourceStyleId: string | number) => {
    setPreviewLoading(true);
    try {
      const res = await api.get<{ code: number; data: StyleBrief & { description?: string } }>(`/style/info/${sourceStyleId}`);
      if (res.code === 200) {
        setPreviewHtml(String(res.data?.description || ''));
      } else {
        setPreviewHtml('');
      }
    } catch {
      setPreviewHtml('');
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const resolveIdByStyleNo = useCallback(async (styleNo: string): Promise<string | number | undefined> => {
    const res = await api.get<{ code: number; data: { records?: StyleBrief[] } }>('/style/info/list', {
      params: { page: 1, pageSize: 1, styleNo },
    });
    return res.code === 200 ? (res.data?.records || [])[0]?.id : undefined;
  }, []);

  useEffect(() => {
    if (open) {
      setSourceMode('style');
      setStyleKeywordNo('');
      setStyleKeywordName('');
      setStylePage(1);
      setSelectedStyle(null);
      setSelectedTemplate(null);
      setPreviewHtml('');
      void fetchTemplates();
      void fetchStyles(1, '', '');
    }
  }, [open, fetchTemplates, fetchStyles]);

  const handlePickStyle = (record: StyleBrief) => {
    setSelectedStyle(record);
    setSelectedTemplate(null);
    // 列表记录可能已带 description；没有再拉详情
    if (record.description != null) {
      setPreviewHtml(String(record.description));
    } else {
      void fetchDescription(record.id);
    }
  };

  const handlePickTemplate = async (record: TemplateBrief) => {
    setSelectedTemplate(record);
    const sourceStyleNo = String(record.sourceStyleNo || '').trim();
    if (!sourceStyleNo) {
      setPreviewHtml('');
      return;
    }
    const id = await resolveIdByStyleNo(sourceStyleNo);
    if (id != null) {
      await fetchDescription(id);
    } else {
      setPreviewHtml('');
    }
  };

  const handleConfirm = async () => {
    if (!previewHtml.trim()) return;
    await onConfirm(previewHtml);
  };

  const listStyle: React.CSSProperties = {
    flex: 1, minHeight: 0, overflowY: 'auto',
    border: '1px solid var(--color-border)', borderRadius: 6,
  };
  const itemStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 10px', cursor: 'pointer',
    borderBottom: '1px solid var(--color-border-light)',
    background: active ? 'var(--color-primary-bg, #e6f4ff)' : undefined,
  });

  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      width="80%"
      title="拷贝其他款工艺说明"
      footer={
        <Space>
          <Text type="secondary" style={{ fontSize: 12, marginInlineEnd: 12 }}>
            确认后整篇替换当前工艺说明（当前内容会被覆盖，替换后自动保存）
          </Text>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={submitting} disabled={!previewHtml.trim()} onClick={handleConfirm}>
            导入此工艺说明
          </Button>
        </Space>
      }
    >
      <div style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', gap: 16, alignItems: 'stretch', minHeight: 0, overflow: 'hidden' }}>
        {/* ── 左：来源选择 ── */}
        <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            {sourceMode === 'style' ? '选择款' : '选择通用模板'}
          </Text>
          <Radio.Group
            value={sourceMode}
            optionType="button"
            buttonStyle="solid"
            style={{ marginBottom: 8 }}
            onChange={(e) => {
              setSourceMode(e.target.value);
              setSelectedStyle(null);
              setSelectedTemplate(null);
              setPreviewHtml('');
            }}
            options={[
              { value: 'style', label: '按款号' },
              { value: 'template', label: '通用模板' },
            ]}
          />
          {sourceMode === 'style' && (
            <>
              <Space direction="vertical" size={6} style={{ width: '100%', marginBottom: 8 }}>
                <Input
                  placeholder="款号"
                  allowClear
                  value={styleKeywordNo}
                  onChange={(e) => setStyleKeywordNo(e.target.value)}
                  onPressEnter={() => { setStylePage(1); void fetchStyles(1); }}
                />
                <Input
                  placeholder="商品名称"
                  allowClear
                  value={styleKeywordName}
                  onChange={(e) => setStyleKeywordName(e.target.value)}
                  onPressEnter={() => { setStylePage(1); void fetchStyles(1); }}
                />
                <Space>
                  <Button type="primary" icon={<SearchOutlined />} onClick={() => { setStylePage(1); void fetchStyles(1); }}>搜索</Button>
                  <Button onClick={() => { setStyleKeywordNo(''); setStyleKeywordName(''); setStylePage(1); void fetchStyles(1); }}>重置</Button>
                </Space>
              </Space>
              <div style={listStyle}>
                {styles.map((s) => (
                  <div key={String(s.id)} onClick={() => handlePickStyle(s)} style={itemStyle(Boolean(selectedStyle && String(selectedStyle.id) === String(s.id)))}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <StyleCoverThumb src={s.cover || s.styleCover || null} styleId={s.id} styleNo={String(s.styleNo || '')} size={40} borderRadius={4} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{s.styleNo || '-'}</div>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.styleName || '-'}
                        </Text>
                      </div>
                    </div>
                  </div>
                ))}
                {!styles.length && !styleLoading && (
                  <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>暂无款式</div>
                )}
              </div>
              <Pagination
                size="small"
                current={stylePage}
                pageSize={stylePageSize}
                total={styleTotal}
                onChange={(p) => { setStylePage(p); void fetchStyles(p); }}
                style={{ marginTop: 8, textAlign: 'right' }}
                showSizeChanger={false}
              />
            </>
          )}
          {sourceMode === 'template' && (
            <div style={listStyle}>
              {templates.map((t) => (
                <div key={String(t.id)} onClick={() => void handlePickTemplate(t)} style={itemStyle(Boolean(selectedTemplate && String(selectedTemplate.id) === String(t.id)))}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{t.templateName || '-'}</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {t.sourceStyleNo ? `来源款 ${t.sourceStyleNo}` : '未关联来源款'}
                  </Text>
                </div>
              ))}
              {!templates.length && !templatesLoading && (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>暂无通用模板</div>
              )}
            </div>
          )}
        </div>

        {/* ── 右：富文本预览 ── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          <Space wrap style={{ marginBottom: 12 }}>
            <Text strong>
              工艺说明预览
              {selectedStyle ? `（${selectedStyle.styleNo || ''}）` : selectedTemplate ? `（${selectedTemplate.templateName || ''}）` : ''}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>确认导入后整篇替换当前工艺说明</Text>
          </Space>
          {!selectedStyle && !selectedTemplate ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 14 }}>
              {sourceMode === 'template' ? '请先在左侧选择通用模板' : '请先在左侧选择要拷贝的款'}
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 6, padding: 16, background: 'var(--color-bg-container)' }}>
              <Spin spinning={previewLoading}>
                <SheetRichViewer content={previewHtml} minHeight={320} />
              </Spin>
            </div>
          )}
        </div>
      </div>
    </SideDrawer>
  );
};

export default CopyCraftNotesDrawer;
