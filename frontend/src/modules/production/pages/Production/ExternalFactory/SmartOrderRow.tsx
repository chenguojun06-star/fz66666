import React from 'react';
import { Popover, Progress, Tag } from 'antd';
import dayjs from 'dayjs';
import { SMART_CARD_OVERLAY_WIDTH } from '@/components/common/DecisionInsightCard';
import SmartOrderHoverCard from '../ProgressDetail/components/SmartOrderHoverCard';
import { ProductionOrder } from '@/types/production';
import RowActions, { type RowAction } from '@/components/common/RowActions';
import { isOrderFrozenByStatus, isOrderFrozenByStatusOrStock, withQuery } from '@/utils/api';
import { buildCommonOrderActions } from '../components/buildCommonOrderActions';
import { useNavigate } from 'react-router-dom';
import StageNode from './StageNode';
import type { SmartStage, DeliveryTone } from './types';
import type { OrderColorSizeMatrixModel } from '@/components/common/OrderColorSizeMatrix';
import { StyleCoverThumb } from '@/components/StyleAssets';
import { ColorSizeMatrixPopoverContent } from '@/components/common/OrderColorSizeMatrix';
import FactoryTypeTag from '@/components/common/FactoryTypeTag';

interface SmartOrderRowProps {
  record: ProductionOrder;
  deliveryMeta: { tone: DeliveryTone; label: string };
  stages: SmartStage[];
  overallProgress: number;
  statusInfo: { text: string; color: string };
  sizeMatrix: OrderColorSizeMatrixModel;
  totalQty: number;
  STAGE_MIN_SLOT_WIDTH: number;
  fmtTime: (t?: string) => string;
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

const SmartOrderRow: React.FC<SmartOrderRowProps> = ({
  record, deliveryMeta, stages, overallProgress, statusInfo, sizeMatrix, totalQty,
  STAGE_MIN_SLOT_WIDTH, fmtTime,
  handleCloseOrder, handleScrapOrder, handleTransferOrder,
  openProcessDetail, syncProcessFromTemplate,
  setPrintModalVisible, setPrintingRecord,
  quickEditModal, handleShareOrder, onOpenRemark, handlePrintLabel,
  canManageOrderLifecycle, isSupervisorOrAbove,
  openSubProcessRemap, isFactoryAccount,
  openNodeDetail,
}) => {
  const navigate = useNavigate();
  const isScrapped = record.status === 'scrapped' || record.status === 'cancelled';
  const doneCount = stages.filter(s => s.status === 'done').length;
  const timelinePercent = ((doneCount + 1) / (stages.length + 1)) * 100;
  const shipDate = (record as any).expectedShipDate || record.plannedEndDate;
  const factoryTag = <FactoryTypeTag factoryType={record.factoryType} style={{ marginLeft: 4 }} />;

  return (
    <div className={`style-smart-row style-smart-row--${deliveryMeta.tone}`}>
      <div className="style-smart-row__cover">
        <StyleCoverThumb
          styleId={record.styleId}
          styleNo={record.styleNo}
          src={record.styleCover || null}
          size="fill"
          borderRadius={8}
        />
        <div className="ef-cover-below">
          <div className="ef-cover-tags">
            <Tag color={statusInfo.color}>{statusInfo.text}</Tag>
            {record.urgencyLevel === 'urgent' && <Tag color="red">急单</Tag>}
            {record.plateType === 'REORDER' && <Tag color="blue">翻单</Tag>}
            <span className={`ef-delivery-badge ef-delivery-badge--${deliveryMeta.tone}`}>
              {deliveryMeta.label}
            </span>
          </div>
          <div className="ef-date-stack" />
        </div>
      </div>

      <div className="style-smart-row__body">
        <div className="style-smart-row__layout">
          <div className="style-smart-row__identity">
            <div className="ef-info-fields">
              <div className="ef-field-row">
                <span className="ef-field-label">订单号</span>
                <Popover
                  content={<SmartOrderHoverCard order={record} />}
                  overlayStyle={{ width: SMART_CARD_OVERLAY_WIDTH }}
                  trigger="hover" placement="rightTop" mouseEnterDelay={0.3}
                >
                  <span className="ef-field-value ef-order-no">{record.orderNo}</span>
                </Popover>
              </div>
              <div className="ef-field-row">
                <span className="ef-field-label">款号</span>
                <span className="ef-field-value">{record.styleNo}{record.styleName && ` · ${record.styleName}`}</span>
              </div>
              <div className="ef-field-row">
                <span className="ef-field-label">跟单员</span>
                <span className="ef-field-value">{record.merchandiser || '-'}</span>
              </div>
              <div className="ef-field-row">
                <span className="ef-field-label">加工厂</span>
                <span className="ef-field-value">{record.factoryName || '-'}{factoryTag}</span>
              </div>
              <div className="ef-field-row">
                <span className="ef-field-label">客户</span>
                <span className="ef-field-value">{record.company || '-'}</span>
              </div>
            </div>
            <div className="ef-field-row" style={{ marginTop: 4 }}>
              <span className="ef-field-label">总数</span>
              <span className="ef-field-value" style={{ fontWeight: 700 }}>{totalQty}件</span>
            </div>
            <div className="ef-field-row">
              <span className="ef-field-label">交期</span>
              <span className="ef-field-value">{shipDate ? dayjs(shipDate).format('YYYY-MM-DD') : '-'}</span>
            </div>
          </div>

          <div className="style-smart-row__timeline-shell" style={{ '--ef-stage-count': stages.length + 1 } as React.CSSProperties}>
            <div className="style-smart-row__timeline-track" />
            <div className="style-smart-row__timeline-progress" style={{
              width: `calc((100% - 100% / ${stages.length + 1}) * ${timelinePercent / 100})`,
            }} />
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${stages.length + 1}, minmax(${STAGE_MIN_SLOT_WIDTH}px, 1fr))`,
              position: 'relative',
            }}>
              <Popover
                content={<ColorSizeMatrixPopoverContent model={sizeMatrix} />}
                trigger="hover" placement="top" mouseEnterDelay={0.1}
                overlayStyle={{ maxWidth: 320, zIndex: 1100 }}
                open={sizeMatrix.hasData ? undefined : false}
                getPopupContainer={() => document.body}
              >
                <div className="style-smart-stage style-smart-stage--done" style={{ cursor: sizeMatrix.hasData ? 'pointer' : 'default' }}>
                  <div className="style-smart-stage__time">{fmtTime(record.createTime)}</div>
                  <div className="style-smart-stage__node">
                    <span className="style-smart-stage__ring" />
                    <span className="style-smart-stage__orbit" />
                    <span className="style-smart-stage__core" />
                    <span className="style-smart-stage__check" />
                  </div>
                  <div className="style-smart-stage__label">下单</div>
                </div>
              </Popover>
              {stages.map(stage => (
                <StageNode key={stage.key} stage={stage} record={record} totalQty={totalQty} openNodeDetail={openNodeDetail} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="style-smart-row__aside">
        {(setPrintModalVisible || quickEditModal || handleCloseOrder || handleShareOrder) && (() => {
          const frozen = isOrderFrozenByStatusOrStock(record);
          const completed = isOrderFrozenByStatus(record);
          const cardActions: RowAction[] = [
            ...(setPrintModalVisible && setPrintingRecord ? [{
              key: 'print',
              label: '打印',
              title: frozen ? '打印（订单已关单）' : '打印生产制单',
              disabled: frozen,
              onClick: () => { setPrintingRecord(record); setPrintModalVisible(true); },
            }] : []),
            ...(handlePrintLabel ? [{
              key: 'printLabel',
              label: '打印标签',
              title: '打印洗水唛 / 吊牌',
              onClick: () => handlePrintLabel(record),
            }] : []),
            ...(!isFactoryAccount && openProcessDetail ? [{
              key: 'process',
              label: '工序',
              disabled: frozen,
              children: [
                { key: 'all', label: ' 全部工序', disabled: frozen, onClick: () => openProcessDetail(record, 'all') },
                ...(syncProcessFromTemplate ? [{
                  key: 'syncProcess',
                  label: '单价同步',
                  disabled: frozen,
                  onClick: () => syncProcessFromTemplate(record),
                }] : []),
              ],
            }] : []),
            ...(isFactoryAccount && openSubProcessRemap ? [{
              key: 'subProcessRemap',
              label: '子工序',
              title: frozen ? '子工序单价配置（订单已关单）' : '子工序单价配置',
              disabled: frozen,
              onClick: () => openSubProcessRemap(record),
            }] : []),
            ...buildCommonOrderActions({
              record, frozen, completed,
              canManageOrderLifecycle: !!canManageOrderLifecycle,
              isSupervisorOrAbove: !!isSupervisorOrAbove,
              onQuickEdit: quickEditModal ? (r) => quickEditModal.open(r) : undefined,
              handleCloseOrder, handleScrapOrder, handleTransferOrder, handleShareOrder, onOpenRemark,
            }),
            ...(isFactoryAccount ? [{
              key: 'orderFlow',
              label: '全流程',
              title: '查看订单全流程记录',
              onClick: () => navigate(withQuery('/production/order-flow', {
                orderId: record.id, orderNo: record.orderNo, styleNo: record.styleNo,
              })),
            }] : []),
          ];
          return cardActions.length > 0 ? (
            <div className="ef-card-actions">
              <RowActions className="ef-card-row-actions" maxInline={1} actions={cardActions} />
            </div>
          ) : null;
        })()}
        <div className="style-smart-row__overview">
          <span className="style-smart-row__overview-value">{overallProgress}%</span>
          <Progress percent={overallProgress} showInfo={false} size="small" strokeColor={isScrapped ? '#9ca3af' : '#2d7ff9'} />
        </div>
      </div>
    </div>
  );
};

export default SmartOrderRow;
