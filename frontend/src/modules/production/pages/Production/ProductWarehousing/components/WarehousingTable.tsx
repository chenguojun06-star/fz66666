import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Tag, message } from 'antd';
import QRCode from 'qrcode';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';

/** 打印入库二维码（传入质检入库号） */
async function printWarehousingQr(warehousingNo: string, orderNo?: string) {
  if (!warehousingNo) { message.warning('二维码内容为空'); return; }
  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(warehousingNo, { width: 200, margin: 2, errorCorrectionLevel: 'M' });
  } catch {
    message.error('生成二维码失败');
    return;
  }
  const html = `<!DOCTYPE html><html><head><title>入库二维码</title>
    <style>
      body { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif; }
      .qr-wrap { text-align: center; border: 1px solid #ddd; padding: 16px; border-radius: 8px; width: 240px; }
      img { display: block; }
      .no { font-size: 13px; color: #333; margin-top: 8px; word-break: break-all; }
      .order { font-size: 11px; color: #888; margin-top: 4px; }
      @media print { body { min-height: unset; } }
    </style>
  </head><body><div class="qr-wrap">
    <img src="${qrDataUrl}" width="200" height="200" />
    <div class="no">${warehousingNo}</div>
    ${orderNo ? `<div class="order">订单号：${orderNo}</div>` : ''}
  </div><script>window.onload=()=>{ window.print(); window.close(); }</script></body></html>`;
  const win = window.open('', '_blank', 'width=400,height=400');
  if (win) { win.document.write(html); win.document.close(); }
}
import { StyleAttachmentsButton, StyleCoverThumb } from '@/components/StyleAssets';
import { formatDateTime } from '@/utils/datetime';
import { ProductWarehousing as WarehousingType, WarehousingQueryParams } from '@/types/production';
import { getQualityStatusConfig } from '../utils';

interface WarehousingTableProps {
  loading: boolean;
  dataSource: WarehousingType[];
  total: number;
  queryParams: WarehousingQueryParams;
  setQueryParams: (params: WarehousingQueryParams) => void;
  isOrderFrozen: (orderId: string) => boolean;
  isMobile?: boolean;
}

const WarehousingTable: React.FC<WarehousingTableProps> = ({
  loading,
  dataSource,
  total,
  queryParams,
  setQueryParams,
  isOrderFrozen,
  isMobile: _isMobile,
}) => {
  const navigate = useNavigate();

  /** 跳转到统一质检入库内部页面 */
  const goToDetail = (record: WarehousingType, tab = 'records') => {
    const orderId = String((record as any)?.orderId || '').trim();
    if (!orderId) return;
    const warehousingNo = String(record.warehousingNo || '').trim();
    const params = new URLSearchParams({ tab });
    if (warehousingNo && tab === 'records') params.set('warehousingNo', warehousingNo);
    navigate(`/production/warehousing/inspect/${orderId}?${params.toString()}`);
  };
  const columns = [
    {
      title: '图片',
      key: 'cover',
      width: 56,
      render: (_: any, record: any) => (
        <StyleCoverThumb styleId={record.styleId} styleNo={record.styleNo} size={40} borderRadius={4} />
      )
    },
    {
      title: '入库号',
      dataIndex: 'warehousingNo',
      key: 'warehousingNo',
      width: 100,
      ellipsis: true,
      render: (v: any, record: WarehousingType) => {
        const text = String(v || '').trim();
        if (!text) return '-';
        // 只显示后8位，悬停看全文
        const short = text.length > 10 ? '...' + text.slice(-8) : text;
        return (
          <Button type="link" size="small" style={{ padding: 0, fontSize: 12 }} onClick={() => goToDetail(record, 'inspect')} title={text}>
            {short}
          </Button>
        );
      },
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 110,
      ellipsis: true,
      render: (v: unknown) => {
        const text = String(v || '').trim();
        if (!text) return '-';
        const short = text.length > 10 ? '...' + text.slice(-8) : text;
        return <span title={text} style={{ fontSize: 12 }}>{short}</span>;
      },
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 80,
      ellipsis: true,
    },
    {
      title: '款名',
      dataIndex: 'styleName',
      key: 'styleName',
      width: 80,
      ellipsis: true,
    },
    {
      title: '附件',
      key: 'attachments',
      width: 60,
      render: (_: any, record: any) => (
        <StyleAttachmentsButton
          styleId={record.styleId}
          styleNo={record.styleNo}
          onlyActive
        />
      )
    },
    {
      title: '菲号',
      dataIndex: 'cuttingBundleQrCode',
      key: 'cuttingBundleQrCode',
      width: 130,
      ellipsis: true,
      render: (v: unknown) => {
        const text = String(v || '').trim();
        if (!text) return '-';
        // 提取核心信息：颜色-尺码-序号
        const parts = text.split('-');
        const short = parts.length >= 4 ? parts.slice(-3).join('-') : (text.length > 14 ? '...' + text.slice(-12) : text);
        return <span title={text} style={{ fontSize: 12 }}>{short}</span>;
      },
    },
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 60,
      ellipsis: true,
      render: (v: unknown) => v || '-',
    },
    {
      title: '尺码',
      dataIndex: 'size',
      key: 'size',
      width: 50,
      render: (v: unknown) => v || '-',
    },
    {
      title: '裁剪',
      dataIndex: 'cuttingQuantity',
      key: 'cuttingQuantity',
      width: 55,
      align: 'right' as const,
      render: (v: unknown) => v ?? '-',
    },
    {
      title: '质检',
      dataIndex: 'warehousingQuantity',
      key: 'warehousingQuantity',
      width: 55,
      align: 'right' as const,
    },
    {
      title: '合格',
      dataIndex: 'qualifiedQuantity',
      key: 'qualifiedQuantity',
      width: 55,
      align: 'right' as const,
    },
    {
      title: '不合格',
      dataIndex: 'unqualifiedQuantity',
      key: 'unqualifiedQuantity',
      width: 60,
      align: 'right' as const,
    },
    {
      title: '状态',
      dataIndex: 'qualityStatus',
      key: 'qualityStatus',
      width: 72,
      render: (status: any) => {
        const { text, color } = getQualityStatusConfig(status);
        return <Tag color={color} style={{ marginInlineEnd: 0, fontSize: 11 }}>{text}</Tag>;
      },
    },
    {
      title: '质检人',
      key: 'qualityOperatorName',
      width: 70,
      ellipsis: true,
      render: (_: any, record: any) => {
        const name = String(record?.qualityOperatorName || record?.receiverName || record?.warehousingOperatorName || '').trim();
        return name || '-';
      },
    },
    {
      title: '时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 90,
      render: (value: unknown) => {
        const s = formatDateTime(value);
        // 只显示月-日 时:分
        if (!s || s === '-') return '-';
        const m = s.match(/(\d{2}-\d{2})\s+(\d{2}:\d{2})/);
        return m ? <span title={s} style={{ fontSize: 12 }}>{m[1]} {m[2]}</span> : <span style={{ fontSize: 12 }}>{s}</span>;
      },
    },

    {
      title: '操作',
      key: 'action',
      width: 110,
      fixed: 'right' as const,
      render: (_: any, record: WarehousingType) => {
        const orderId = String((record as any)?.orderId || '').trim();
        const frozen = isOrderFrozen(orderId);

        // 判断是否已入库：有仓库信息或有入库结束时间
        const hasWarehouse = Boolean(record.warehouse?.trim());
        const hasWarehousingEndTime = Boolean(record.warehousingEndTime?.trim());
        const isWarehoused = hasWarehouse || hasWarehousingEndTime;

        return (
          <RowActions
            actions={[
              {
                key: 'inspect',
                label: '质检',
                title: frozen ? '质检（订单已关单）' : '质检查看',
                disabled: frozen,
                onClick: () => goToDetail(record, 'inspect'),
                primary: true,
              },
              {
                key: 'complete',
                label: '入库',
                title: isWarehoused ? '已入库' : (frozen ? '入库（订单已关单）' : '入库'),
                disabled: frozen || !orderId || isWarehoused,
                onClick: () => goToDetail(record, 'warehousing'),
                primary: true,
              },
              ...(isWarehoused ? [{
                key: 'printQr',
                label: '打印二维码',
                onClick: () => printWarehousingQr(
                  String(record.warehousingNo || '').trim(),
                  String((record as any).orderNo || '').trim()
                ),
              }] : []),
            ]}
          />
        );
      },
    },
  ];

  return (
    <ResizableTable
      storageKey="warehousing-table"
      columns={columns as any}
      dataSource={dataSource as any[]}
      rowKey="id"
      loading={loading}
      scroll={{ x: 'max-content' }}
      rowClassName={() => 'clickable-row'}
      onRow={(record: unknown) => {
        return {
          onClick: (e) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;
            const interactive = target.closest(
              'a,button,input,textarea,select,option,[role="button"],[role="menuitem"],.ant-dropdown-trigger,.ant-btn'
            );
            if (interactive) return;
            goToDetail(record as WarehousingType, 'inspect');
          },
        };
      }}
      pagination={{
        current: queryParams.page,
        pageSize: queryParams.pageSize,
        total: total,
        showTotal: (total) => `共 ${total} 条`,
        showSizeChanger: true,
        pageSizeOptions: ['10', '20', '50', '100'],
        onChange: (page, pageSize) => setQueryParams({ ...queryParams, page, pageSize })
      }}
    />
  );
};

export default WarehousingTable;
