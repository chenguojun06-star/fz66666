import React from 'react';
import { Button, Empty, Pagination, Popover, Progress, Tag } from 'antd';
import dayjs from 'dayjs';
import { SMART_CARD_OVERLAY_WIDTH } from '@/components/common/DecisionInsightCard';
import AttachmentThumb from '../components/AttachmentThumb';
import SmartStyleHoverCard from './SmartStyleHoverCard';
import { StyleInfo } from '@/types/style';
import { getStyleSourceMeta } from '@/utils/styleSource';
import { useNavigate } from 'react-router-dom';
import { withQuery } from '@/utils/api';
import { isSupervisorOrAboveUser, useAuth } from '@/utils/AuthContext';

interface StyleTableViewProps {
  data: StyleInfo[];
  loading: boolean;
  total: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number, pageSize: number) => void;
  onScrap: (id: string) => void;
  onPrint: (record: StyleInfo) => void;
  onMaintenance: (record: StyleInfo) => void;
  categoryOptions: { label: string; value: string }[];
}

type StageStatus = 'done' | 'active' | 'waiting' | 'risk';

interface SmartStage {
  key: string;
  label: string;
  helper: string;
  timeLabel: string;
  status: StageStatus;
  progress: number;
}

const CATEGORY_MAP: Record<string, string> = {
  WOMAN: '女装',
  WOMEN: '女装',
  MAN: '男装',
  MEN: '男装',
  KID: '童装',
  KIDS: '童装',
  WCMAN: '女童装',
  UNISEX: '男女同款',
};

const SEASON_MAP: Record<string, string> = {
  SPRING: '春季',
  SUMMER: '夏季',
  AUTUMN: '秋季',
  WINTER: '冬季',
  SPRING_SUMMER: '春夏',
  AUTUMN_WINTER: '秋冬',
};

const ORDER_DONE_STATUS = ['COMPLETED', 'COMPLETE', 'FINISHED', 'FINISH', 'DONE', 'CLOSED'];
const ORDER_RISK_STATUS = ['CANCELLED', 'CANCELED', 'SCRAPPED', 'PAUSED', 'ON_HOLD', 'ABNORMAL'];

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const formatNodeTime = (value?: unknown) => {
  if (!value) return '待启动';
  const instance = dayjs(value);
  if (instance.isValid()) {
    return instance.format('MM-DD HH:mm');
  }
  return String(value);
};

const getLatestTimeLabel = (values: unknown[]) => {
  const valid = values
    .map((item) => dayjs(item))
    .filter((item) => item.isValid())
    .sort((a, b) => b.valueOf() - a.valueOf());

  if (!valid.length) return '待启动';
  return valid[0].format('MM-DD HH:mm');
};

const getDeliveryMeta = (deliveryDate?: string) => {
  if (!deliveryDate) {
    return { tone: 'normal', label: '待补交期' };
  }

  const diffDays = dayjs(deliveryDate).startOf('day').diff(dayjs().startOf('day'), 'day');
  if (diffDays < 0) {
    return { tone: 'danger', label: `延期 ${Math.abs(diffDays)} 天` };
  }
  if (diffDays <= 3) {
    return { tone: 'warning', label: `${diffDays} 天内交板` };
  }
  return { tone: 'normal', label: `${diffDays} 天后交板` };
};

const getProgressNodeColor = (node: string) => {
  if (/报废|驳回|不通过|异常|失败/.test(node)) return 'error';
  if (/返修|紧急/.test(node)) return 'warning';
  if (/完成|通过/.test(node)) return 'success';
  if (/中|待审|确认/.test(node)) return 'processing';
  return 'default';
};

const buildSmartStages = (record: StyleInfo): SmartStage[] => {
  const raw = record as StyleInfo & Record<string, unknown>;
  const progressNode = String(raw.progressNode || '').trim();
  const patternStatus = String(raw.patternStatus || '').trim().toUpperCase();
  const sampleStatus = String(raw.sampleStatus || '').trim().toUpperCase();
  const sampleReviewStatus = String(raw.sampleReviewStatus || '').trim().toUpperCase();
  const latestOrderStatus = String(raw.latestOrderStatus || '').trim().toUpperCase();
  const latestProductionProgress = clampPercent(Number(raw.latestProductionProgress || 0));

  const prepItems = [
    { label: 'BOM', done: Boolean(raw.bomCompletedTime), time: raw.bomCompletedTime },
    { label: '尺寸', done: Boolean(raw.sizeCompletedTime), time: raw.sizeCompletedTime },
    { label: '工序', done: Boolean(raw.processCompletedTime), time: raw.processCompletedTime },
    { label: '制单', done: Boolean(raw.productionCompletedTime), time: raw.productionCompletedTime },
    { label: '二次工艺', done: Boolean(raw.secondaryCompletedTime), time: raw.secondaryCompletedTime },
  ];
  const prepDoneCount = prepItems.filter((item) => item.done).length;
  const prepPending = prepItems.find((item) => !item.done)?.label || '已齐套';
  const prepProgress = clampPercent((prepDoneCount / prepItems.length) * 100);

  const patternDone = patternStatus === 'COMPLETED' || Boolean(raw.patternCompletedTime);
  const patternStarted = patternDone || Boolean(raw.patternStartTime) || /纸样/.test(progressNode);

  const sampleDone = sampleStatus === 'COMPLETED' || Boolean(raw.sampleCompletedTime) || progressNode === '样衣完成';
  const sampleProgress = sampleDone ? 100 : clampPercent(Number(raw.sampleProgress || 0));
  const sampleStarted = sampleDone || sampleProgress > 0 || /样衣/.test(progressNode) || Boolean(raw.productionStartTime) || Boolean(raw.productionCompletedTime);

  const confirmDone = progressNode === '样衣完成' || sampleReviewStatus === 'PASS';
  const confirmRisk = ['REJECT', 'REWORK'].includes(sampleReviewStatus) || progressNode === '开发样报废';
  const confirmStarted = confirmDone || confirmRisk || sampleReviewStatus === 'PENDING' || Boolean(raw.sampleCompletedTime) || sampleDone;

  const hasOrder = Boolean(raw.latestOrderNo) || Number(raw.orderCount || 0) > 0 || latestProductionProgress > 0 || Boolean(latestOrderStatus);
  const productionDone = hasOrder && (latestProductionProgress >= 100 || ORDER_DONE_STATUS.includes(latestOrderStatus));
  const productionRisk = hasOrder && ORDER_RISK_STATUS.includes(latestOrderStatus);
  const productionStarted = hasOrder && !productionDone && !productionRisk;

  return [
    {
      key: 'prep',
      label: '开发资料',
      helper: prepDoneCount === prepItems.length ? '资料齐套' : `${prepDoneCount}/${prepItems.length} 已完成`,
      timeLabel: getLatestTimeLabel(prepItems.map((item) => item.time)),
      status: prepDoneCount === prepItems.length ? 'done' : prepDoneCount > 0 ? 'active' : 'waiting',
      progress: prepDoneCount === prepItems.length ? 100 : Math.max(prepProgress, prepDoneCount > 0 ? 20 : 0),
    },
    {
      key: 'pattern',
      label: '纸样开发',
      helper: patternDone ? '纸样已完成' : raw.patternAssignee ? `负责人 ${String(raw.patternAssignee)}` : `待处理 ${prepPending}`,
      timeLabel: formatNodeTime(patternDone ? raw.patternCompletedTime : raw.patternStartTime),
      status: patternDone ? 'done' : patternStarted ? 'active' : 'waiting',
      progress: patternDone ? 100 : patternStarted ? 52 : 0,
    },
    {
      key: 'sample',
      label: '样衣生产',
      helper: sampleDone ? '样衣已完成' : sampleProgress > 0 ? `进度 ${sampleProgress}%` : sampleStarted ? '已进入生产' : '等待纸样',
      timeLabel: formatNodeTime(sampleDone ? raw.sampleCompletedTime : raw.productionStartTime || raw.productionCompletedTime),
      status: sampleDone ? 'done' : sampleStarted ? 'active' : 'waiting',
      progress: sampleDone ? 100 : sampleProgress > 0 ? sampleProgress : sampleStarted ? 38 : 0,
    },
    {
      key: 'confirm',
      label: '样衣确认',
      helper: confirmDone
        ? '确认通过'
        : sampleReviewStatus === 'PENDING'
          ? '待审核'
          : sampleReviewStatus === 'REWORK'
            ? '需返修'
            : sampleReviewStatus === 'REJECT'
              ? '未通过'
              : confirmStarted
                ? '等待结果'
                : '未开始',
      timeLabel: formatNodeTime(raw.completedTime || raw.sampleReviewTime || raw.sampleCompletedTime),
      status: confirmDone ? 'done' : confirmRisk ? 'risk' : confirmStarted ? 'active' : 'waiting',
      progress: confirmDone ? 100 : confirmRisk ? 62 : confirmStarted ? 70 : 0,
    },
    {
      key: 'production',
      label: '大货生产',
      helper: productionDone
        ? '大货完成'
        : productionRisk
          ? '生产异常'
          : productionStarted
            ? `${raw.latestOrderNo ? String(raw.latestOrderNo) : '已下单'} ${latestProductionProgress}%`
            : hasOrder
              ? '待启动'
              : '未下单',
      timeLabel: formatNodeTime(raw.latestOrderTime || raw.firstOrderTime),
      status: productionDone ? 'done' : productionRisk ? 'risk' : productionStarted ? 'active' : 'waiting',
      progress: productionDone ? 100 : productionStarted ? Math.max(latestProductionProgress, 16) : 0,
    },
  ];
};

const StyleTableView: React.FC<StyleTableViewProps> = ({
  data,
  loading,
  total,
  pageSize,
  currentPage,
  onPageChange,
  onScrap,
  onPrint,
  onMaintenance,
  categoryOptions
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSupervisorOrAbove = isSupervisorOrAboveUser(user);

  const toCategoryCn = (value: unknown) => {
    const code = String(value || '').trim().toUpperCase();
    if (!code) return '-';
    if (categoryOptions && categoryOptions.length > 0) {
      const found = categoryOptions.find(opt => opt.value === code);
      if (found) return found.label;
    }
    return CATEGORY_MAP[code] || code;
  };

  const toSeasonCn = (value: unknown) => {
    const code = String(value || '').trim().toUpperCase();
    if (!code) return '-';
    return SEASON_MAP[code] || code;
  };

  const isStageDoneRow = (record: StyleInfo) => {
    const node = String((record as any).progressNode || '').trim();
    return node === '样衣完成';
  };

  const isScrappedRow = (record: StyleInfo) => {
    return String(record.status || '').trim().toUpperCase() === 'SCRAPPED'
      || String((record as any).progressNode || '').trim() === '开发样报废';
  };

  return (
    <div className="style-smart-list">
      {data.length === 0 && !loading ? (
        <div className="style-smart-list__empty">
          <Empty description="暂无样衣数据" />
        </div>
      ) : (
        data.map((record) => {
          const deliveryMeta = getDeliveryMeta(record.deliveryDate);
          const sourceMeta = getStyleSourceMeta(record);
          const progressNode = String((record as any).progressNode || '未开始').trim() || '未开始';
          const stages = buildSmartStages(record);
          const overallProgress = clampPercent(
            stages.reduce((sum, item) => sum + item.progress, 0) / Math.max(stages.length, 1),
          );
          const rowState = isScrappedRow(record) ? 'danger' : deliveryMeta.tone;
          const metaItems = [
            { label: '品类', value: toCategoryCn(record.category) },
            { label: '季节', value: toSeasonCn(record.season) },
            { label: '数量', value: `${Number(record.sampleQuantity || 0) || 0} 件` },
            { label: '交板', value: record.deliveryDate ? dayjs(record.deliveryDate).format('YYYY-MM-DD') : '-' },
            { label: '客户', value: String((record as any).customer || '-') },
            { label: '大货', value: String((record as any).latestOrderNo || `${Number(record.orderCount || 0) > 0 ? `${Number(record.orderCount || 0)} 单` : '未下单'}`) },
          ].filter((item) => item.value && item.value !== '-');

          const actionButtons = (() => {
            if (isScrappedRow(record)) {
              return [
                { key: 'detail', label: '详情', type: 'primary' as const, onClick: () => navigate(`/style-info/${record.id}`) },
                { key: 'print', label: '打印', type: 'default' as const, onClick: () => onPrint(record) },
              ];
            }

            if (isStageDoneRow(record)) {
              const items = [
                { key: 'detail', label: '详情', type: 'primary' as const, onClick: () => navigate(`/style-info/${record.id}`) },
                { key: 'order', label: '下单', type: 'default' as const, onClick: () => navigate(withQuery('/order-management', { styleNo: (record as any).styleNo })) },
              ];

              if (isSupervisorOrAbove) {
                items.push({ key: 'maintenance', label: '维护', type: 'default' as const, onClick: () => onMaintenance(record) });
              }

              return items;
            }

            return [
              { key: 'detail', label: '详情', type: 'primary' as const, onClick: () => navigate(`/style-info/${record.id}`) },
              { key: 'pattern', label: '纸样', type: 'default' as const, onClick: () => navigate(`/style-info/${record.id}?tab=7&section=files`) },
              { key: 'sample', label: '样衣', type: 'default' as const, onClick: () => navigate(`/style-info/${record.id}?tab=8`) },
              { key: 'print', label: '打印', type: 'default' as const, onClick: () => onPrint(record) },
              { key: 'scrap', label: '报废', type: 'default' as const, danger: true, onClick: () => onScrap(String(record.id!)) },
            ];
          })();

          return (
            <div key={String(record.id || record.styleNo)} className={`style-smart-row style-smart-row--${rowState}`}>
              <div className="style-smart-row__cover">
                <AttachmentThumb styleId={record.id!} src={record.cover || null} />
              </div>

              <div className="style-smart-row__body">
                <div className="style-smart-row__head">
                  <div className="style-smart-row__identity">
                    <div className="style-smart-row__tags">
                      <Tag color={sourceMeta.color}>{sourceMeta.label}</Tag>
                      <Tag color={getProgressNodeColor(progressNode)}>{progressNode}</Tag>
                      {record.maintenanceRemark ? <Tag color="gold">已维护</Tag> : null}
                    </div>

                    <Popover
                      content={<SmartStyleHoverCard record={record} />}
                      trigger="hover"
                      placement="rightTop"
                      mouseEnterDelay={0.3}
                      overlayStyle={{ width: SMART_CARD_OVERLAY_WIDTH, maxWidth: SMART_CARD_OVERLAY_WIDTH }}
                    >
                      <div className="style-smart-row__title-wrap">
                        <button
                          type="button"
                          className="style-smart-row__title"
                          onClick={() => navigate(`/style-info/${record.id}`)}
                        >
                          <span>{record.styleNo}</span>
                          <span className="style-smart-row__title-name">{record.styleName || '未命名样衣'}</span>
                        </button>
                        <span className={`style-smart-row__delivery style-smart-row__delivery--${deliveryMeta.tone}`}>
                          {deliveryMeta.label}
                        </span>
                      </div>
                    </Popover>

                    <div className="style-smart-row__meta">
                      {metaItems.map((item) => (
                        <span key={item.label} className="style-smart-row__meta-item">
                          <span className="style-smart-row__meta-label">{item.label}</span>
                          <span className="style-smart-row__meta-value">{item.value}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="style-smart-row__overview">
                    <div className="style-smart-row__overview-value">{overallProgress}%</div>
                    <div className="style-smart-row__overview-label">智能协同</div>
                    <Progress percent={overallProgress} showInfo={false} size="small" strokeColor="#2d7ff9" trailColor="rgba(45,127,249,0.12)" />
                  </div>
                </div>

                <div className="style-smart-row__content">
                  <div className="style-smart-row__timeline-shell">
                    <div className="style-smart-row__timeline-track" />
                    <div className="style-smart-row__timeline-progress" style={{ width: `${overallProgress}%` }} />
                    <div className="style-smart-row__timeline" style={{ minWidth: `${stages.length * 156}px` }}>
                      {stages.map((stage) => (
                        <div key={stage.key} className={`style-smart-stage style-smart-stage--${stage.status}`}>
                          <div className="style-smart-stage__time">{stage.timeLabel}</div>
                          <div className="style-smart-stage__dot" />
                          <div className="style-smart-stage__label">{stage.label}</div>
                          <div className="style-smart-stage__helper">{stage.helper}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="style-smart-row__actions">
                    {actionButtons.map((action) => (
                      <Button
                        key={action.key}
                        size="small"
                        type={action.type}
                        danger={action.danger}
                        onClick={action.onClick}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}

      <div className="style-smart-list__pagination">
        <Pagination
          current={currentPage}
          pageSize={pageSize}
          total={total}
          showTotal={(value) => `共 ${value} 条`}
          showSizeChanger
          showQuickJumper
          pageSizeOptions={['10', '20', '50', '100']}
          onChange={onPageChange}
        />
      </div>
    </div>
  );
};

export default StyleTableView;
