import React, { useMemo } from 'react';
import { Card, Tag, Tooltip } from 'antd';
import { AlertOutlined, CalendarOutlined, ExperimentOutlined, FieldTimeOutlined, WarningOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import './MaterialAlertRanking.css';

export interface MaterialStockAlertItem {
  stockId?: string;
  materialId?: string;
  materialCode?: string;
  materialName?: string;
  materialType?: string;
  unit?: string;
  color?: string;
  size?: string;
  quantity?: number;
  safetyStock?: number;
  recentOutQuantity?: number;
  suggestedSafetyStock?: number;
  dailyOutQuantity?: number;
  needReplenish?: boolean;
  lastOutTime?: string;
  perPieceUsage?: number;
  minProductionQty?: number;
  maxProductionQty?: number;
  supplierName?: string;
  fabricWidth?: string;
  fabricWeight?: string;
  fabricComposition?: string;
}

interface MaterialAlertRankingProps {
  loading: boolean;
  alerts: MaterialStockAlertItem[];
  onSendInstruction: (alert: MaterialStockAlertItem) => void;
}

const getShortage = (item: MaterialStockAlertItem) => {
  const target = Number(item.suggestedSafetyStock ?? item.safetyStock ?? 0);
  const current = Number(item.quantity ?? 0);
  const gap = target - current;
  return gap > 0 ? gap : 0;
};

const MaterialAlertRanking: React.FC<MaterialAlertRankingProps> = ({ loading, alerts, onSendInstruction }) => {
  const stats = useMemo(() => {
    const total = alerts.length;
    const need = alerts.filter((i) => i.needReplenish).length;
    const shortage = alerts.reduce((sum, item) => sum + getShortage(item), 0);
    return { total, need, shortage };
  }, [alerts]);

  const renderTooltipContent = (item: MaterialStockAlertItem) => {
    return (
      <div className="ranking-tooltip">
        <div className="tooltip-title">{item.materialName || item.materialCode || '物料'}</div>
        <div className="tooltip-item">
          <ExperimentOutlined /> 编码: {item.materialCode || '-'}
        </div>
        <div className="tooltip-item">
          <WarningOutlined /> 当前库存: <b>{item.quantity ?? 0}</b>
        </div>
        <div className="tooltip-item">
          <AlertOutlined /> 建议水位: <b>{item.suggestedSafetyStock ?? item.safetyStock ?? 0}</b>
        </div>
        <div className="tooltip-item">
          <FieldTimeOutlined /> 近30天出库: <b>{item.recentOutQuantity ?? 0}</b>
        </div>
        <div className="tooltip-item">
          <AlertOutlined /> 单件用量: <b>{item.perPieceUsage ?? '-'}</b>
        </div>
        <div className="tooltip-item">
          <CalendarOutlined /> 最少可生产: <b>{item.minProductionQty ?? '-'}</b>
        </div>
        <div className="tooltip-item">
          <CalendarOutlined /> 最大可生产: <b>{item.maxProductionQty ?? '-'}</b>
        </div>
        <div className="tooltip-item">
          <CalendarOutlined /> 最近出库: {item.lastOutTime ? dayjs(item.lastOutTime).format('MM-DD HH:mm') : '-'}
        </div>
        <div className="tooltip-hint">
          点击卡片发出采购指令
        </div>
      </div>
    );
  };

  return (
    <Card className="order-ranking-grid" size="small" loading={loading}>
      <div className="ranking-grid-header">
        <AlertOutlined className="ranking-icon" />
        <span className="ranking-title">面辅料预警 TOP{alerts.length}</span>
        <div className="ranking-stats">
          <span>总数: <b>{stats.total}</b></span>
          <span>需补: <b>{stats.need}</b></span>
          <span>缺口: <b>{stats.shortage}</b></span>
        </div>
      </div>

      <div className="ranking-grid-container">
        {alerts.map((item, idx) => (
          <Tooltip
            key={`${item.stockId || item.materialCode || idx}`}
            title={renderTooltipContent(item)}
            placement="top"
            classNames={{ root: 'ranking-tooltip-overlay' }}
          >
            <div
              className="ranking-grid-item"
              onClick={() => onSendInstruction(item)}
            >
              <span className="rank-number rank-number--primary">
                {idx + 1}
              </span>
              <div className="ranking-info">
                <span className="style-no" title={item.materialCode || item.materialName}>
                  {item.materialCode || item.materialName || '物料'}
                </span>
                <Tag className="ranking-tag" color="blue">
                  缺 {getShortage(item)}
                </Tag>
              </div>
            </div>
          </Tooltip>
        ))}
        {!alerts.length && (
          <div className="ranking-empty">暂无预警数据</div>
        )}
      </div>
    </Card>
  );
};

export default MaterialAlertRanking;
