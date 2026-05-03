import React, { useMemo, useCallback } from 'react';
import { Empty, Skeleton } from 'antd';
import dayjs from 'dayjs';
import { Virtuoso } from 'react-virtuoso';
import StandardPagination from '@/components/common/StandardPagination';
import { ProductionOrder } from '@/types/production';
import { isDirectCuttingOrder } from '@/utils/api';
import { getOrderCardSizeQuantityItems } from '@/utils/cardSizeQuantity';
import { getOrderStatusConfig } from '@/components/common/OrderStatusTag';
import { buildOrderColorSizeMatrixModel } from '@/components/common/OrderColorSizeMatrix';
import { calcOrderProgress } from '@/modules/production/utils/calcOrderProgress';
import SmartOrderRow from './SmartOrderRow';
import type { SmartStage, StageStatus, DeliveryTone } from './types';
import '../../../../basic/pages/StyleInfo/styles.css';
import './externalFactory.css';

const STAGE_MIN_SLOT_WIDTH = 128;

const PRODUCTION_STAGES: readonly {
  key: string; label: string; rateField: string; startFields: string[]; endFields: string[];
}[] = [
  { key: 'procurement', label: '采购', rateField: 'procurementCompletionRate', startFields: ['procurementStartTime'], endFields: ['procurementConfirmedAt', 'procurementEndTime'] },
  { key: 'cutting', label: '裁剪', rateField: 'cuttingCompletionRate', startFields: ['cuttingStartTime'], endFields: ['cuttingEndTime'] },
  { key: 'secondary', label: '二次工艺', rateField: 'secondaryProcessCompletionRate', startFields: ['secondaryProcessStartTime'], endFields: ['secondaryProcessEndTime'] },
  { key: 'sewing', label: '车缝', rateField: 'carSewingCompletionRate', startFields: ['sewingStartTime', 'carSewingStartTime'], endFields: ['sewingEndTime', 'carSewingEndTime'] },
  { key: 'tail', label: '尾部', rateField: 'tailProcessRate', startFields: ['packagingStartTime', 'ironingStartTime'], endFields: ['packagingEndTime', 'ironingEndTime'] },
  { key: 'warehousing', label: '入库', rateField: 'warehousingCompletionRate', startFields: ['warehousingStartTime'], endFields: ['warehousingEndTime'] },
];

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

function getDeliveryMeta(r: ProductionOrder): { tone: DeliveryTone; label: string } {
  if (r.status === 'scrapped' || r.status === 'cancelled' || r.status === 'closed' || r.status === 'archived') return { tone: 'scrapped', label: r.status === 'closed' ? '已关单' : r.status === 'archived' ? '已归档' : '已废弃' };
  if (r.status === 'completed') return { tone: 'success', label: '已完成' };
  const target = (r as any).expectedShipDate || r.plannedEndDate;
  if (!target) return { tone: 'normal', label: '未定' };
  const diff = dayjs(target).diff(dayjs(), 'day');
  if (diff < 0) return { tone: 'danger', label: `逾期${Math.abs(diff)}天` };
  if (diff <= 7) return { tone: 'warning', label: `剩${diff}天` };
  return { tone: 'normal', label: `剩${diff}天` };
}

function fmtTime(t?: string): string {
  return t ? dayjs(t).format('MM-DD') : '';
}

function buildStages(r: ProductionOrder, isOverdue: boolean): SmartStage[] {
  const isScrapped = r.status === 'scrapped' || r.status === 'cancelled';
  const stages: SmartStage[] = [];
  for (const def of PRODUCTION_STAGES) {
    if (def.key === 'secondary' && r.hasSecondaryProcess === false) continue;
    if (def.key === 'procurement' && isDirectCuttingOrder(r)) continue;
    const rate = clamp(Number((r as any)[def.rateField]) || 0);
    const start: string | undefined = def.startFields.reduce<string | undefined>((acc, f) => acc || (r as any)[f], undefined);
    const end: string | undefined = def.endFields.reduce<string | undefined>((acc, f) => acc || (r as any)[f], undefined);
    let status: StageStatus;
    if (isScrapped) status = 'scrapped';
    else if (rate >= 100) status = 'done';
    else if (rate > 0) status = isOverdue ? 'risk' : 'active';
    else status = 'waiting';
    stages.push({
      key: def.key,
      label: def.label,
      helper: rate > 0 && rate < 100 ? `${rate}%` : '',
      startTimeLabel: start ? fmtTime(start) : '',
      timeLabel: end ? fmtTime(end) : '',
      status,
      progress: rate,
    });
  }
  return stages;
}

interface Props {
  data: ProductionOrder[];
  loading: boolean;
  total: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number, pageSize: number) => void;
  handleCloseOrder?: (record: ProductionOrder) => void;
  handleScrapOrder?: (record: ProductionOrder) => void;
  handleTransferOrder?: (record: ProductionOrder) => void;
  openProcessDetail?: (record: ProductionOrder, type: string) => void;
  syncProcessFromTemplate?: (record: ProductionOrder) => void;
  setPrintModalVisible?: (v: boolean) => void;
  setPrintingRecord?: (r: ProductionOrder | null) => void;
  quickEditModal?: { open: (r: ProductionOrder) => void };
  handleShareOrder?: (record: ProductionOrder) => void;
  onOpenRemark?: (record: ProductionOrder) => void;
  handlePrintLabel?: (record: ProductionOrder) => void;
  canManageOrderLifecycle?: boolean;
  isSupervisorOrAbove?: boolean;
  openSubProcessRemap?: (record: ProductionOrder) => void;
  isFactoryAccount?: boolean;
  openNodeDetail?: (
    order: ProductionOrder,
    nodeType: string,
    nodeName: string,
    stats?: { done: number; total: number; percent: number; remaining: number },
    unitPrice?: number,
    processList?: Array<{ id?: string; name: string; unitPrice?: number }>
  ) => void;
}

const ExternalFactorySmartView: React.FC<Props> = ({
  data, loading, total, pageSize, currentPage, onPageChange,
  handleCloseOrder, handleScrapOrder, handleTransferOrder,
  openProcessDetail, syncProcessFromTemplate,
  setPrintModalVisible, setPrintingRecord,
  quickEditModal, handleShareOrder, onOpenRemark, handlePrintLabel,
  canManageOrderLifecycle, isSupervisorOrAbove,
  openSubProcessRemap, isFactoryAccount,
  openNodeDetail,
}) => {
  const rows = useMemo(() => data.map(record => {
    const deliveryMeta = getDeliveryMeta(record);
    const stages = buildStages(record, deliveryMeta.tone === 'danger');
    const overallProgress = calcOrderProgress(record);
    const statusInfo = getOrderStatusConfig(record.status);
    const sizeQtyItems = getOrderCardSizeQuantityItems(record);
    const sizeMatrix = buildOrderColorSizeMatrixModel({
      items: sizeQtyItems,
      fallbackColor: record.color,
      fallbackSize: record.size,
      fallbackQuantity: record.orderQuantity,
    });
    const totalQty = (record as any).cuttingQuantity || record.orderQuantity || 0;
    return { record, deliveryMeta, stages, overallProgress, statusInfo, sizeMatrix, totalQty };
  }), [data]);

  const rowRenderer = useCallback((index: number) => {
    const row = rows[index];
    if (!row) return null;
    return (
      <SmartOrderRow
        key={row.record.id}
        record={row.record}
        deliveryMeta={row.deliveryMeta}
        stages={row.stages}
        overallProgress={row.overallProgress}
        statusInfo={row.statusInfo}
        sizeMatrix={row.sizeMatrix}
        totalQty={row.totalQty}
        STAGE_MIN_SLOT_WIDTH={STAGE_MIN_SLOT_WIDTH}
        fmtTime={fmtTime}
        handleCloseOrder={handleCloseOrder}
        handleScrapOrder={handleScrapOrder}
        handleTransferOrder={handleTransferOrder}
        openProcessDetail={openProcessDetail}
        syncProcessFromTemplate={syncProcessFromTemplate}
        setPrintModalVisible={setPrintModalVisible}
        setPrintingRecord={setPrintingRecord}
        quickEditModal={quickEditModal}
        handleShareOrder={handleShareOrder}
        onOpenRemark={onOpenRemark}
        handlePrintLabel={handlePrintLabel}
        canManageOrderLifecycle={canManageOrderLifecycle}
        isSupervisorOrAbove={isSupervisorOrAbove}
        openSubProcessRemap={openSubProcessRemap}
        isFactoryAccount={isFactoryAccount}
        openNodeDetail={openNodeDetail}
      />
    );
  }, [rows, handleCloseOrder, handleScrapOrder, handleTransferOrder,
    openProcessDetail, syncProcessFromTemplate, setPrintModalVisible,
    setPrintingRecord, quickEditModal, handleShareOrder, onOpenRemark,
    handlePrintLabel, canManageOrderLifecycle, isSupervisorOrAbove,
    openSubProcessRemap, isFactoryAccount, openNodeDetail]);

  if (loading) return <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 6 }} /></div>;
  if (data.length === 0) return <Empty description="暂无订单数据" style={{ padding: '80px 0' }} />;

  return (
    <div className="style-smart-list ef-compact">
      <div style={{ flex: 1, minHeight: 0 }}>
        <Virtuoso
          totalCount={rows.length}
          itemContent={rowRenderer}
          style={{ height: '100%' }}
          overscan={400}
        />
      </div>
      <div className="style-smart-list__pagination">
        <StandardPagination
          current={currentPage}
          pageSize={pageSize}
          total={total}
          onChange={onPageChange}
        />
      </div>
    </div>
  );
};

export default ExternalFactorySmartView;
