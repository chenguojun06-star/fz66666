import React from 'react';
import { Button, Input, Space, Table, Tag, message } from 'antd';
import api from '@/utils/api';
import { buildProductionSheetHtml } from '../../DataCenter';
import { formatDateTime } from '@/utils/datetime';
import { safePrint } from '@/utils/safePrint';


interface Props {
  styleId: string | number;
  styleNo?: string;
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
  productionAssignee?: string;
  productionStartTime?: string;
  productionCompletedTime?: string;
}

const StyleProductionTab: React.FC<Props> = ({
  styleId,
  styleNo,
  productionReqRows,
  productionReqRowCount,
  productionReqLocked: _productionReqLocked,
  productionReqEditable,
  productionReqSaving,
  productionReqRollbackSaving,
  onProductionReqChange,
  onProductionReqSave,
  onProductionReqReset,
  onProductionReqRollback,
  productionReqCanRollback,
  productionAssignee,
  productionStartTime,
  productionCompletedTime,
}) => {

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
    const success = safePrint(html, '生产制单');
    if (!success) {
      message.error('浏览器拦截了新窗口');
    }
  };

  const tableData = Array.from({ length: Math.max(1, Number(productionReqRowCount) || 15) }).map((_, idx) => ({
    key: idx + 1,
    index: idx + 1,
    value: productionReqRows[idx] || '',
  }));

  const columns = [
    {
      title: '序号',
      dataIndex: 'index',
      key: 'index',
      width: 80,
      align: 'center' as const,
    },
    {
      title: '生产要求',
      dataIndex: 'value',
      key: 'value',
      render: (_: string, record: { index: number; value: string }) => (
        <Input
          value={record.value}
          onChange={(e) => onProductionReqChange(record.index - 1, e.target.value)}
          placeholder="请输入生产要求"
        />
      ),
    },
  ];

  return (
    <div data-production-req>
      <div style={{ marginBottom: 8, color: '#666', fontSize: 12 }}>
        款号：<span style={{ color: '#333', fontWeight: 500 }}>{styleNo || '-'}</span>
      </div>
      {/* 状态栏 */}
      <div style={{
        marginBottom: 16,
        padding: '12px 16px',
        background: '#f5f5f5',
        borderRadius: 4,
        display: 'flex',
        gap: 24,
      }}>
        <span style={{ color: '#666' }}>
          领取人：<span style={{ color: '#333', fontWeight: 500 }}>{productionAssignee || '-'}</span>
        </span>
        <span style={{ color: '#666' }}>
          开始时间：<span style={{ color: '#333', fontWeight: 500 }}>{formatDateTime(productionStartTime)}</span>
        </span>
        <span style={{ color: '#666' }}>
          完成时间：<span style={{ color: '#333', fontWeight: 500 }}>{formatDateTime(productionCompletedTime)}</span>
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <Space size={8} wrap>
          <span style={{ fontWeight: 500 }}>生产要求</span>
          <Tag color="success">可编辑</Tag>
        </Space>
        <Space size={8} wrap>
          <Button size="small" onClick={downloadWorkorder}>
            下载制单
          </Button>
          <Button size="small" onClick={printWorkorder}>
            打印制单
          </Button>
          <Button
            size="small"
            onClick={onProductionReqRollback}
            loading={Boolean(productionReqRollbackSaving)}
            disabled={!productionReqCanRollback}
          >
            退回编辑
          </Button>
          <Button size="small" onClick={onProductionReqReset} disabled={Boolean(productionReqSaving)}>
            取消
          </Button>
          <Button size="small" type="primary" loading={Boolean(productionReqSaving)} onClick={onProductionReqSave}>
            保存
          </Button>
        </Space>
        <div style={{ marginTop: 8, color: '#666', fontSize: 12 }}>
          💡 提示：相关文件请在"文件管理"标签页统一上传
        </div>
      </div>
      <Table
        size="small"
        bordered
        pagination={false}
        columns={columns}
        dataSource={tableData}
        style={{ marginTop: 8 }}
      />
    </div>
  );
};

export default StyleProductionTab;
