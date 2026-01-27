import React, { useEffect, useRef, useState } from 'react';
import { Button, Input, Space, Table, Tag, message } from 'antd';
import api from '@/utils/api';
import { buildProductionSheetHtml } from '../../DataCenter';

interface Props {
  styleId: string | number;
  productionReqRows: string[];
  productionReqRowCount: number;
  productionReqLocked: boolean;
  productionReqEditable: boolean;
  productionReqSaving: boolean;
  productionReqRollbackSaving: boolean;
  onProductionReqChange: (index: number, value: string) => void;
  onProductionReqSave: () => void;
  onProductionReqReset: () => void;
  onProductionReqRollback: () => void;
  productionReqCanRollback: boolean;
}

const StyleProductionTab: React.FC<Props> = ({
  styleId,
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
}) => {
  const productionReqRootRef = useRef<HTMLDivElement | null>(null);
  const [productionReqScrollY, setProductionReqScrollY] = useState<number>(320);

  useEffect(() => {
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
  }, []);

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
      message.error((e as any)?.message || '获取生产制单失败');
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
    const styleNo = String((payload as any)?.style?.styleNo || '').trim() || String(styleId);
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
    <div data-production-req ref={productionReqRootRef}>
      <style>{
        '[data-production-req] .ant-table-thead > tr > th,[data-production-req] .ant-table-tbody > tr > td{padding:4px 6px !important;text-align:center !important;vertical-align:middle !important;}' +
        '[data-production-req] .ant-input{padding:0 6px !important;height:24px !important;line-height:24px !important;}'
      }</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <Space size={8} wrap>
          <span style={{ fontWeight: 500 }}>生产要求</span>
          {productionReqLocked ? <Tag color="warning">已保存</Tag> : <Tag color="default">可编辑</Tag>}
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
  );
};

export default StyleProductionTab;
