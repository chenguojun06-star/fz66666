import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Empty, Image, Spin, Tag } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import { warehouseLocationMapApi } from '@/services/warehouse/warehouseLocationMapApi';

/** 库位实际存放货物明细（后端 /warehouse/location/items 统一返回） */
interface LocationItemsResp {
  locationCode?: string;
  locationName?: string;
  zoneName?: string;
  warehouseType?: string;
  warehouseTypeLabel?: string;
  capacity?: number;
  usedCapacity?: number;
  actualUsedCapacity?: number;
  itemCount?: number;
  items?: Record<string, any>[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  locationCode: string;
  locationName?: string;
  /** MATERIAL(面料/物料) / FINISHED(成品) / SAMPLE(样衣) */
  warehouseType: string;
}

const num = (v: unknown) => Number(v ?? 0);

/** 图片列（三端统一占位样式） */
const imageCol = {
  title: '图片',
  dataIndex: 'imageUrl',
  width: 52,
  render: (v: string) => (v
    ? <Image src={v} width={36} height={36} style={{ objectFit: 'cover', borderRadius: 4 }} />
    : <span style={{ display: 'inline-block', width: 36, height: 36, borderRadius: 4, background: 'var(--color-fill-secondary, #f5f5f5)' }} />),
};

/**
 * 按仓库类型生成明细列（面料/成品/样衣统一弹窗，列不同）。
 * D-894：列宽必须能塞进弹窗宽度——只有小定宽列（类型/颜色/数量），
 * 编码/名称列不设宽度自动分摊剩余空间，禁止出现左右滑动。
 */
function buildColumns(warehouseType: string): any[] {
  if (warehouseType === 'SAMPLE') {
    return [
      imageCol,
      { title: '样衣编号', dataIndex: 'styleNo', width: 120 },
      { title: '样衣名称', dataIndex: 'styleName', ellipsis: true },
      { title: '类型', dataIndex: 'sampleType', width: 70, render: (v: string) => v || '-' },
      { title: '颜色', dataIndex: 'color', width: 70, render: (v: string) => v || '-' },
      { title: '尺码', dataIndex: 'size', width: 60, render: (v: string) => v || '-' },
      { title: '在库', dataIndex: 'stockQuantity', width: 60, render: (v: number) => num(v) },
      { title: '借出', dataIndex: 'loanedQuantity', width: 60, render: (v: number) => num(v) },
    ];
  }
  if (warehouseType === 'FINISHED') {
    return [
      imageCol,
      { title: '款号', dataIndex: 'styleNo', width: 120 },
      { title: 'SKU编码', dataIndex: 'skuCode', ellipsis: true },
      { title: '颜色', dataIndex: 'color', width: 80, render: (v: string) => v || '-' },
      { title: '尺码', dataIndex: 'size', width: 80, render: (v: string) => v || '-' },
      { title: '剩余量', dataIndex: 'stockQuantity', width: 80, render: (v: number) => num(v) },
      { title: '累计入库', dataIndex: 'warehousedQty', width: 80, render: (v: number) => num(v) },
    ];
  }
  // MATERIAL（面料/辅料等物料）
  return [
    imageCol,
    { title: '物料编码', dataIndex: 'materialCode', ellipsis: true },
    { title: '物料名称', dataIndex: 'materialName', ellipsis: true },
    { title: '类型', dataIndex: 'materialType', width: 70, render: (v: string) => v || '-' },
    { title: '颜色', dataIndex: 'color', width: 70, render: (v: string) => v || '-' },
    { title: '规格', dataIndex: 'specifications', width: 90, render: (v: string) => v || '-' },
    { title: '库存量', dataIndex: 'stockQuantity', width: 85, render: (v: number, r: any) => `${num(v)}${r.unit || ''}` },
    { title: '锁定量', dataIndex: 'lockedQuantity', width: 75, render: (v: number, r: any) => `${num(v)}${r.unit || ''}` },
  ];
}

/**
 * 库位货物明细弹窗（D-893）。
 * 面料/成品/样衣统一入口：点库位旁的蓝色容量文字即弹出，
 * 展示该库位实际存放了什么货、各多少。
 */
const LocationItemsModal: React.FC<Props> = ({ open, onClose, locationCode, locationName, warehouseType }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<LocationItemsResp | null>(null);

  useEffect(() => {
    if (!open || !locationCode) return;
    let cancelled = false;
    setLoading(true);
    setData(null);
    warehouseLocationMapApi.getLocationItems(locationCode, warehouseType)
      .then((res: any) => {
        if (cancelled) return;
        setData(res?.data?.data || res?.data || null);
      })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, locationCode, warehouseType]);

  const columns = useMemo(() => buildColumns(warehouseType), [warehouseType]);

  const cap = num(data?.capacity);
  const used = num(data?.usedCapacity ?? data?.actualUsedCapacity);
  const remain = Math.max(0, cap - used);

  return (
    <ResizableModal
      open={open}
      onCancel={onClose}
      footer={null}
      width={880}
      initialHeight={460}
      title={
        <span>
          库位明细 · {locationName || data?.locationName || locationCode}
          {data?.warehouseTypeLabel && <Tag style={{ marginLeft: 8 }}>{data.warehouseTypeLabel}</Tag>}
          {data?.zoneName && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--color-text-secondary)' }}>{data.zoneName}</span>}
        </span>
      }
    >
      <div className="u-mb-12" style={{ color: 'var(--color-primary)', fontSize: 13 }}>
        {cap > 0
          ? `容量 ${cap} · 已用 ${used} · 剩余 ${remain}`
          : `已用 ${used}（未设置容量上限）`}
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}><Spin /></div>
      ) : (
        <ResizableTable
          size="small"
          showIndex={false}
          disableFillScrollY
          rowKey={(r: any, idx?: number) => String(r.skuCode || r.materialCode || r.styleNo || `row-${idx}`)}
          columns={columns}
          dataSource={data?.items || []}
          pagination={false}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该库位暂无货物（或库位编码未匹配到库存记录）" /> }}
        />
      )}
      {!loading && data === null && (
        <Alert type="info" showIcon message="未能加载库位明细，请稍后重试" />
      )}
    </ResizableModal>
  );
};

export default LocationItemsModal;
