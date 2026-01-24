import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Button, Input, Modal, Space, Table, Tabs, Tag, message } from 'antd';
import api from '../../../utils/api';
import { isSupervisorOrAboveUser, useAuth } from '../../../utils/authContext';
import { formatDateTime } from '../../../utils/datetime';
import type { StyleAttachment } from '../../../types/style';
import { buildProductionSheetHtml } from '../../DataCenter';
import StyleAttachmentTab from './StyleAttachmentTab';
import StyleSizeTab from './StyleSizeTab';
import StyleProcessTab from './StyleProcessTab';

interface Props {
  styleId: string | number;
  patternStatus?: string;
  patternStartTime?: string;
  patternCompletedTime?: string;
  activeSectionKey?: 'files' | 'size' | 'process' | 'workorder';
  readOnly?: boolean;
  productionReqRows?: string[];
  productionReqRowCount?: number;
  productionReqLocked?: boolean;
  productionReqEditable?: boolean;
  productionReqSaving?: boolean;
  productionReqRollbackSaving?: boolean;
  onProductionReqChange?: (index: number, value: string) => void;
  onProductionReqSave?: () => void;
  onProductionReqReset?: () => void;
  onProductionReqRollback?: () => void;
  productionReqCanRollback?: boolean;
  onRefresh: () => void;
}

const StylePatternTab: React.FC<Props> = ({
  styleId,
  patternStatus,
  patternStartTime,
  patternCompletedTime,
  activeSectionKey,
  readOnly,
  productionReqRows,
  productionReqRowCount,
  productionReqLocked,
  productionReqEditable,
  productionReqSaving,
  productionReqRollbackSaving,
  onProductionReqChange,
  onProductionReqSave,
  onProductionReqReset,
  onProductionReqRollback,
  productionReqCanRollback,
  onRefresh,
}) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [sectionKey, setSectionKey] = useState<'files' | 'grading' | 'size' | 'process' | 'workorder'>(activeSectionKey || 'files');
  const [patternFiles, setPatternFiles] = useState<StyleAttachment[]>([]);
  const [gradingFiles, setGradingFiles] = useState<StyleAttachment[]>([]);
  const [patternCheckResult, setPatternCheckResult] = useState<{ complete: boolean; missingItems: string[] } | null>(null);

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
  }, [checkPatternComplete, patternFiles, gradingFiles]);

  useEffect(() => {
    if (!activeSectionKey) return;
    setSectionKey(activeSectionKey);
  }, [activeSectionKey]);

  const status = useMemo(() => String(patternStatus || '').trim().toUpperCase(), [patternStatus]);
  const locked = useMemo(() => status === 'COMPLETED', [status]);
  const childReadOnly = useMemo(() => Boolean(readOnly) || locked, [readOnly, locked]);

  const canRollback = useMemo(() => isSupervisorOrAboveUser(user), [user]);

  const statusTag = useMemo(() => {
    if (status === 'COMPLETED') return <Tag color="green">已完成</Tag>;
    if (status === 'IN_PROGRESS') return <Tag color="gold">开发中</Tag>;
    return <Tag>未开始</Tag>;
  }, [status]);

  const startTimeText = useMemo(() => {
    return formatDateTime(patternStartTime);
  }, [patternStartTime]);

  const completedTimeText = useMemo(() => {
    return formatDateTime(patternCompletedTime);
  }, [patternCompletedTime]);

  const hasValidPatternFile = useMemo(() => {
    const list = Array.isArray(patternFiles) ? patternFiles : [];
    return list.some((f) => {
      const name = String((f as Record<string, unknown>)?.fileName || '').toLowerCase();
      const url = String((f as Record<string, unknown>)?.fileUrl || '').toLowerCase();
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

  const call = async (url: string, body?: any) => {
    setSaving(true);
    try {
      const res = await api.post(url, body);
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        message.success('操作成功');
        onRefresh();
        return;
      }
      message.error(result.message || '操作失败');
    } catch {
    // Intentionally empty
      // 忽略错误
      message.error('操作失败');
    } finally {
      setSaving(false);
    }
  };

  const openMaintenance = () => {
    let reason = '';
    Modal.confirm({
      title: '维护',
      content: (
        <div>
          <div style={{ marginBottom: 12, fontWeight: 600 }}>维护原因</div>
          <Input.TextArea
            placeholder="请输入维护原因"
            autoSize={{ minRows: 3, maxRows: 6 }}
            maxLength={200}
            showCount
            onChange={(e) => {
              reason = String(e?.target?.value || '');
            }}
          />
        </div>
      ),
      okText: '确认维护',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const remark = String(reason || '').trim();
        if (!remark) {
          message.error('请输入维护原因');
          return Promise.reject(new Error('请输入维护原因'));
        }
        await call(`/style/info/${styleId}/pattern/reset`, { reason: remark });
      },
    });
  };

  const productionReqRootRef = useRef<HTMLDivElement | null>(null);
  const [productionReqScrollY, setProductionReqScrollY] = useState<number>(320);

  useEffect(() => {
    if (sectionKey !== 'workorder') return;
    const root = productionReqRootRef.current;
    if (!root) return;

    const target = (root.closest('.ant-modal-body') as HTMLElement | null) ?? root;

    const compute = () => {
      const h = Math.floor(target.getBoundingClientRect().height || 0);
      const y = Math.max(180, h - 260);
      setProductionReqScrollY((prev) => (prev === y ? prev : y));
    };

    compute();

    if (typeof ResizeObserver === 'undefined') {
      if (typeof window === 'undefined') return;
      window.addEventListener('resize', compute);
      return () => window.removeEventListener('resize', compute);
    }

    const ro = new ResizeObserver(() => compute());
    ro.observe(target);
    return () => ro.disconnect();
  }, [sectionKey]);

  const downloadHtmlFile = (fileName: string, html: string) => {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const fetchProductionSheetPayload = async () => {
    try {
      const res = await api.get<{ code: number; message: string; data: unknown }>('/data-center/production-sheet', { params: { styleId } });
      if (res.code !== 200) {
        message.error(res.message || '获取生产制单失败');
        return null;
      }
      return res.data;
    } catch (e: unknown) {
      message.error(e?.message || '获取生产制单失败');
      return null;
    }
  };

  const buildWorkorderHtml = (payload: any) => {
    if (!productionReqEditable) return buildProductionSheetHtml(payload);
    const count = Math.max(0, Number(productionReqRowCount) || 15);
    const rows = Array.isArray(productionReqRows) ? productionReqRows : [];
    const list = rows.slice(0, count).map((x) => String(x ?? '').replace(/\r/g, '').trim());
    while (list.length && !String(list[list.length - 1] || '').trim()) list.pop();
    const desc = list.join('\n');
    const next = {
      ...(payload || {}),
      style: {
        ...((payload || {})?.style || {}),
        description: desc,
      },
    };
    return buildProductionSheetHtml(next);
  };

  const downloadWorkorder = async () => {
    const payload = await fetchProductionSheetPayload();
    if (!payload) return;
    const styleNo = String(payload?.style?.styleNo || '').trim() || String(styleId);
    const html = buildWorkorderHtml(payload);
    downloadHtmlFile(`生产制单-${styleNo}.html`, html);
    message.success('已下载生产制单');
  };

  const printWorkorder = async () => {
    const payload = await fetchProductionSheetPayload();
    if (!payload) return;
    const html = buildWorkorderHtml(payload);
    const w = window.open('', '_blank');
    if (!w) {
      message.error('浏览器拦截了新窗口');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
    }, 200);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
        <Space size="large" wrap>
          <span>纸样状态：</span>
          {statusTag}
          <span>开始时间：{startTimeText}</span>
          <span>完成时间：{completedTimeText}</span>
          {/* 纸样齐全检查提示 */}
          {patternCheckResult && !patternCheckResult.complete && (
            <span style={{
              fontSize: '12px',
              color: '#faad14',
              backgroundColor: '#fffbe6',
              border: '1px solid #ffe58f',
              padding: '2px 8px',
              borderRadius: '4px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              ⚠️ 缺少: {patternCheckResult.missingItems.join('、')}
            </span>
          )}
        </Space>

        <Space size="large" wrap>
          {locked ? (
            <>
              <Tag color="green">已完成</Tag>
              <span style={{ color: 'var(--neutral-text-lighter)' }}>无法操作</span>
              {canRollback ? (
                <Button danger loading={saving} onClick={openMaintenance}>维护</Button>
              ) : null}
            </>
          ) : (
            <>
              <Button loading={saving} onClick={() => call(`/style/info/${styleId}/pattern/start`)}>纸样开发</Button>
              <Button
                type="primary"
                loading={saving}
                disabled={!hasValidPatternFile}
                onClick={() => {
                  if (!hasValidPatternFile) {
                    message.error('请先上传纸样文件（dxf/plt/ets）');
                    return;
                  }
                  call(`/style/info/${styleId}/pattern/complete`);
                }}
              >
                标记完成
              </Button>
              {canRollback ? (
                <Button danger loading={saving} onClick={openMaintenance}>维护</Button>
              ) : null}
              {!hasValidPatternFile ? <span style={{ color: 'var(--neutral-text-lighter)' }}>需先上传纸样(dxf/plt/ets)</span> : null}
            </>
          )}
        </Space>
      </div>

      <Tabs
        activeKey={sectionKey}
        onChange={(k) => setSectionKey(k as Record<string, unknown>)}
        items={[
          {
            key: 'files',
            label: '纸样文件',
            children: (
              <StyleAttachmentTab
                styleId={styleId}
                bizType="pattern"
                uploadText="上传纸样文件"
                readOnly={childReadOnly}
                onListChange={setPatternFiles}
              />
            ),
          },
          {
            key: 'grading',
            label: '放码文件',
            children: (
              <StyleAttachmentTab
                styleId={styleId}
                bizType="pattern_grading"
                uploadText="上传放码文件"
                readOnly={childReadOnly}
                onListChange={setGradingFiles}
              />
            ),
          },
          {
            key: 'size',
            label: '尺寸表',
            children: <StyleSizeTab styleId={styleId} readOnly={childReadOnly} />,
          },
          {
            key: 'process',
            label: '工序表',
            children: <StyleProcessTab styleId={styleId} readOnly={childReadOnly} />,
          },
          {
            key: 'workorder',
            label: '生产制单',
            children: (
              <div data-production-req ref={productionReqRootRef}>
                <style>{
                  '[data-production-req] .ant-table-thead > tr > th,[data-production-req] .ant-table-tbody > tr > td{padding:4px 6px !important;text-align:center !important;vertical-align:middle !important;}' +
                  '[data-production-req] .ant-input{padding:0 6px !important;height:24px !important;line-height:24px !important;}'
                }</style>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <Space size={8} wrap>
                    <span style={{ fontWeight: 500 }}>生产要求</span>
                    {productionReqLocked ? <Tag color="gold">已保存</Tag> : <Tag color="blue">可编辑</Tag>}
                  </Space>
                  <Space size={8} wrap>
                    <Button size="small" onClick={downloadWorkorder}>
                      下载制单
                    </Button>
                    <Button size="small" onClick={printWorkorder}>
                      打印制单
                    </Button>
                    {productionReqEditable ? (
                      <>
                        <Button size="small" onClick={onProductionReqReset} disabled={Boolean(productionReqSaving)}>
                          取消
                        </Button>
                        <Button size="small" type="primary" loading={Boolean(productionReqSaving)} onClick={onProductionReqSave}>
                          保存
                        </Button>
                      </>
                    ) : productionReqLocked && productionReqCanRollback ? (
                      <Button size="small" danger loading={Boolean(productionReqRollbackSaving)} onClick={onProductionReqRollback}>
                        退回修改
                      </Button>
                    ) : null}
                  </Space>
                </div>

                <Table
                  size="small"
                  rowKey={(r) => String((r as Record<string, unknown>).key)}
                  pagination={false}
                  scroll={{ y: productionReqScrollY, x: 'max-content' }}
                  sticky
                  dataSource={Array.from({ length: Math.max(0, Number(productionReqRowCount) || 15) }).map((_, idx) => ({
                    key: String(idx + 1),
                    no: idx + 1,
                    text: (Array.isArray(productionReqRows) ? productionReqRows[idx] : '') || '',
                  }))}
                  columns={[
                    { title: '序号', dataIndex: 'no', key: 'no', width: 56 },
                    {
                      title: '内容',
                      dataIndex: 'text',
                      key: 'text',
                      render: (v: any, record: any) => {
                        const idx = Number(record?.no || 1) - 1;
                        const t = String(v || '');
                        if (productionReqEditable) {
                          return (
                            <Input
                              size="small"
                              value={t}
                              placeholder={`第${record?.no}条`}
                              onChange={(e) => onProductionReqChange?.(idx, e.target.value)}
                            />
                          );
                        }
                        const txt = t.trim();
                        return txt ? txt : <span style={{ color: 'rgba(0,0,0,0.35)' }}>-</span>;
                      },
                    },
                  ]}
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
};

export default StylePatternTab;
