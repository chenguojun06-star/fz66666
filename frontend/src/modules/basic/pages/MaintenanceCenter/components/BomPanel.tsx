import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Card, Form, Input } from 'antd';
import api from '@/utils/api';
import type { TemplateLibrary } from '@/types/style';
import TemplateInlineEditor from '../../TemplateCenter/components/inlineEditor/TemplateInlineEditor';
import {
  getErrorMessage,
} from '../../TemplateCenter/utils/templateUtils';

const { TextArea } = Input;

const directCardStyle = {
  border: '1px solid #ececec',
  borderRadius: 10,
  padding: 12,
  background: '#fff',
} as const;

const directStackStyle = { display: 'grid', gap: 10 } as const;

const directTitleStyle = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--color-text-primary)',
  lineHeight: 1.2,
} as const;

const directMetaStyle = {
  fontSize: 12,
  color: 'var(--neutral-text-secondary)',
  lineHeight: 1.4,
} as const;

const directFieldLabelStyle = {
  marginBottom: 4,
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--neutral-text-secondary)',
} as const;

const processingBannerStyle = {
  marginBottom: 10,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #ffd591',
  background: '#fff7e6',
  display: 'grid',
  gap: 4,
} as const;

interface PageResp<T> { records: T[]; total: number }

const normalizeTemplateRecords = (payload: unknown, sourceStyleNo?: string) => {
  const records = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as PageResp<TemplateLibrary> | undefined)?.records)
      ? (payload as PageResp<TemplateLibrary>).records
      : [];
  const normalizedStyleNo = String(sourceStyleNo || '').trim();
  return records
    .filter((item): item is TemplateLibrary => !!item)
    .filter((item) => !normalizedStyleNo || String(item.sourceStyleNo || '').trim() === normalizedStyleNo);
};

interface BomPanelProps { styleNo?: string; }

const BomPanel: React.FC<BomPanelProps> = ({ styleNo }) => {
  const { message } = App.useApp();
  const [directRollbackForm] = Form.useForm();

  const directTemplateHydratedRef = useRef(false);
  const [hydratingTemplate, setHydratingTemplate] = useState(false);

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TemplateLibrary[]>([]);

  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [, setCancelLocking] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ code: number; message: string; data: PageResp<TemplateLibrary> }>('/template-library/list', {
        params: { page: 1, pageSize: 100, templateType: 'bom', sourceStyleNo: styleNo || '' },
      });
      if (res.code !== 200) {
        message.error(res.message || '获取BOM模板失败');
        return;
      }
      const records = normalizeTemplateRecords(res.data, styleNo);
      const sortedRecords = [...records].sort((a, b) => String(b.updateTime || '').localeCompare(String(a.updateTime || '')));
      setData(sortedRecords);
    } catch (error: unknown) {
      message.error(getErrorMessage(error, '获取BOM模板失败'));
    } finally {
      setLoading(false);
    }
  }, [message, styleNo]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    if (!styleNo) {
      directTemplateHydratedRef.current = false;
      return;
    }
    if (loading || hydratingTemplate || data.length > 0 || directTemplateHydratedRef.current) return;

    directTemplateHydratedRef.current = true;
    setHydratingTemplate(true);

    void (async () => {
      try {
        const res = await api.post<{ code: number; message?: string }>('/template-library/create-from-style', {
          sourceStyleNo: styleNo,
          templateTypes: ['bom'],
        });
        if (res.code !== 200) {
          message.error(res.message || '自动生成BOM模板失败');
          return;
        }
        await fetchList();
      } catch (error: unknown) {
        message.error(getErrorMessage(error, '自动生成BOM模板失败'));
      } finally {
        setHydratingTemplate(false);
      }
    })();
  }, [data.length, fetchList, hydratingTemplate, loading, message, styleNo]);

  const directRow = useMemo(() => data[0] ?? null, [data]);
  const directProcessing = !!directRow && Number(directRow.locked) !== 1;

  const handleDirectRollback = async () => {
    if (!directRow?.id) return;
    setRollbackLoading(true);
    try {
      const values = await directRollbackForm.validateFields();
      const res = await api.post<{ code: number; message: string }>(`/template-library/${directRow.id}/rollback`, { reason: values.reason });
      if (res.code !== 200) {
        message.error(res.message || '退回失败');
        return;
      }
      message.success('已退回，可直接在当前页面继续编辑');
      directRollbackForm.resetFields();
      await fetchList();
    } catch (error: unknown) {
      message.error(getErrorMessage(error, '退回失败'));
    } finally {
      setRollbackLoading(false);
    }
  };

  return (
    <Card styles={{ body: { padding: '8px 12px' } }}>
      <div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 16, color: 'rgba(0,0,0,0.45)' }}>加载中...</div>
        ) : hydratingTemplate ? (
          <div style={{ textAlign: 'center', padding: 16, color: 'rgba(0,0,0,0.45)' }}>正在根据当前款号生成 BOM 模板...</div>
        ) : !directRow ? (
          <div style={{ textAlign: 'center', padding: 16, color: 'rgba(0,0,0,0.45)' }}>未找到该款号的 BOM 模板</div>
        ) : Number(directRow.locked) === 1 ? (
          <div style={directStackStyle}>
            <div style={directCardStyle}>
              <div style={{ marginBottom: 8 }}>
                <span style={directTitleStyle}>退回后再维护</span>
              </div>
              <Form form={directRollbackForm} layout="vertical">
                <div style={directFieldLabelStyle}>退回原因</div>
                <Form.Item name="reason" rules={[{ required: true, message: '请填写退回原因' }]} style={{ marginBottom: 8 }}>
                  <TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder="请说明本次退回原因" />
                </Form.Item>
              </Form>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  type="default"
                  danger
                 
                  loading={rollbackLoading}
                  onClick={handleDirectRollback}
                  style={{ background: '#fff', color: '#ff4d4f', borderColor: '#ff4d4f' }}
                >
                  确认退回
                </Button>
              </div>
            </div>
            <div style={directCardStyle}>
              <TemplateInlineEditor row={directRow} readOnly compact maintenanceMode onSaved={fetchList} />
            </div>
          </div>
        ) : (
          <div style={directCardStyle}>
              {directProcessing ? (
                <div style={processingBannerStyle}>
                  <div style={{ ...directTitleStyle, color: '#d46b08' }}>处理中</div>
                  <div style={{ ...directMetaStyle, color: '#ad6800' }}>这份 BOM 已退回，当前还没有重新保存提交，保存后会自动重新锁定。</div>
                </div>
              ) : null}
              <TemplateInlineEditor
                row={directRow}
                compact
                maintenanceMode
                onCancel={async () => {
                  if (!directRow?.id) return;
                  setCancelLocking(true);
                  try {
                    await api.post(`/template-library/${directRow.id}/lock`);
                    await fetchList();
                  } catch (error: unknown) {
                    message.error(getErrorMessage(error, '取消修改失败'));
                  } finally {
                    setCancelLocking(false);
                  }
                }}
                onSaved={async () => {
                  await fetchList();
                }}
              />
          </div>
        )}
      </div>
    </Card>
  );
};

export default BomPanel;
