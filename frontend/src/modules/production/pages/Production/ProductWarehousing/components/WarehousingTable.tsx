import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Space, Tag, Tooltip } from 'antd';
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
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>入库二维码</title>
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
  </div></body></html>`;
  safePrint(html);
}
import { StyleCoverThumb } from '@/components/StyleAssets';
import { formatDateTime } from '@/utils/datetime';
import { ProductWarehousing as WarehousingType, WarehousingQueryParams } from '@/types/production';
import { getQualityStatusConfig } from '../utils';
import { analyzeQuality, renderQualityTooltip } from '../utils/qualityIntelligence';
import { message } from '@/utils/antdStatic';
import { safePrint } from '@/utils/safePrint';

const getUrgencyTag = (value: unknown): { text: string; color: string } | null => {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'urgent') return { text: '急', color: 'red' };
  if (key === 'normal') return { text: '普', color: 'default' };
  return null;
};

const getPlateTypeTag = (value: unknown): { text: string; color: string } | null => {
  const key = String(value || '').trim().toUpperCase();
  if (key === 'FIRST') return { text: '首', color: 'blue' };
  if (key === 'REORDER' || key === 'REPLATE') return { text: '翻', color: 'purple' };
  return null;
};

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
    if (!orderId) {
      message.warning('该记录缺少订单信息，无法跳转详情');
      return;
    }
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
      width: 150,
      render: (v: any, record: WarehousingType) => {
        const text = String(v || '').trim();
        if (!text) return '-';
        return (
          <Button type="link" size="small" style={{ padding: 0, fontSize: 12 }} onClick={() => goToDetail(record, 'inspect')} title={text}>
            {text}
          </Button>
        );
      },
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 190,
      render: (v: unknown, record: WarehousingType) => {
        const text = String(v || '').trim();
        if (!text) return '-';
        const urgencyTag = getUrgencyTag((record as any).urgencyLevel);
        const plateTag = getPlateTypeTag((record as any).plateType);

        // 智能质检分析（风险 + 瓶颈 + 建议 + 预计影响）
        const orderRecs = (dataSource as WarehousingType[]).filter(r => r.orderNo === text);
        let tooltipContent: React.ReactNode = null;
        if (orderRecs.length > 0) {
          const isUrgent = String((record as any).urgencyLevel || '').toLowerCase() === 'urgent';
          const insight = analyzeQuality(orderRecs, isUrgent);
          tooltipContent = renderQualityTooltip(insight, text);
        }

        const inner = (
          <div style={{ fontSize: 12 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              <span style={tooltipContent ? { borderBottom: '1px dotted var(--color-primary)', cursor: 'help' } : undefined}>{text}</span>
              {plateTag && <Tag color={plateTag.color} style={{ marginInlineEnd: 0, fontSize: 11 }}>{plateTag.text}</Tag>}
              {urgencyTag && <Tag color={urgencyTag.color} style={{ marginInlineEnd: 0, fontSize: 11 }}>{urgencyTag.text}</Tag>}
            </div>
            {(record as any).orgPath || (record as any).parentOrgUnitName ? (
              <div style={{ color: 'var(--neutral-text-secondary)', marginTop: 2 }}>
                {(record as any).orgPath || (record as any).parentOrgUnitName}
              </div>
            ) : null}
          </div>
        );

        return tooltipContent
          ? <Tooltip title={tooltipContent} placement="right" color="white" styles={{ container: { color: '#333', boxShadow: '0 3px 12px rgba(0,0,0,0.12)' } }}>{inner}</Tooltip>
          : inner;
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
      title: '生产方',
      key: 'factoryName',
      width: 120,
      render: (_: any, record: any) => {
        const name = String(record.factoryName || '').trim();
        const type = record.factoryType as string | undefined;
        if (!name) return '-';
        return (
          <Space size={4}>
            {type === 'INTERNAL' && <Tag color="blue" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px', height: 16 }}>内</Tag>}
            {type === 'EXTERNAL' && <Tag color="purple" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px', height: 16 }}>外</Tag>}
            <span style={{ fontSize: 12 }}>{name}</span>
          </Space>
        );
      },
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
        // 菲号格式: {订单号}-{款号}-{颜色}-{尺码}-{数量}-{扎号}|SKU-...|SIG-...
        // 提取核心信息：颜色-尺码-扎号
        const pipeIndex = text.indexOf('|');
        const mainPart = pipeIndex > 0 ? text.substring(0, pipeIndex) : text;
        const parts = mainPart.split('-');
        // parts: [订单号, 款号, 颜色, 尺码, 数量, 扎号]
        let short = text;
        if (parts.length >= 6) {
          const color = parts[2] || '';
          const size = parts[3] || '';
          const bundleNo = parts[5] || '';
          short = `${color}-${size}#${bundleNo}`;
        } else if (parts.length >= 4) {
          short = parts.slice(2, 5).join('-');
        } else if (text.length > 14) {
          short = '...' + text.slice(-12);
        }
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
      title: '扫码方式',
      dataIndex: 'scanMode',
      key: 'scanMode',
      width: 80,
      render: (v: unknown) => {
        const mode = String(v || '').trim().toLowerCase();
        if (mode === 'ucode') return <Tag color="green" style={{ marginInlineEnd: 0, fontSize: 11 }}>U编码</Tag>;
        return <Tag color="blue" style={{ marginInlineEnd: 0, fontSize: 11 }}>菲号</Tag>;
      },
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
