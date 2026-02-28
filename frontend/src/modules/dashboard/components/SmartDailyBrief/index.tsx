import React, { useEffect, useState } from 'react';
import { Alert, Skeleton, Tag } from 'antd';
import {
  AlertOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  LineChartOutlined,
  ScanOutlined,
} from '@ant-design/icons';
import api from '@/utils/api';
import './styles.css';

interface TopPriorityOrder {
  orderNo: string;
  styleNo: string;
  factoryName: string;
  progress: number;
  daysLeft: number;
}

interface DailyBriefData {
  date: string;
  yesterdayWarehousingCount: number;
  yesterdayWarehousingQuantity: number;
  todayScanCount: number;
  overdueOrderCount: number;
  highRiskOrderCount: number;
  topPriorityOrder?: TopPriorityOrder;
  suggestions: string[];
}

const SmartDailyBrief: React.FC = () => {
  const [data, setData] = useState<DailyBriefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get('/dashboard/daily-brief')
      .then((res: DailyBriefData) => {
        setData(res);
      })
      .catch(() => setError('日报数据加载失败'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="smart-daily-brief">
        <Skeleton active paragraph={{ rows: 2 }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="smart-daily-brief">
        <Alert message={error ?? '暂无数据'} type="warning" showIcon />
      </div>
    );
  }

  const hasRisk = data.overdueOrderCount > 0 || data.highRiskOrderCount > 0;

  return (
    <div className="smart-daily-brief">
      {/* 标题行 */}
      <div className="sdb-header">
        <span className="sdb-title">
          <LineChartOutlined className="sdb-title-icon" />
          智能运营日报
        </span>
        <span className="sdb-date">
          <CalendarOutlined style={{ marginRight: 4 }} />
          {data.date}
        </span>
        {hasRisk ? (
          <Tag color="red" icon={<AlertOutlined />}>需关注</Tag>
        ) : (
          <Tag color="green" icon={<CheckCircleOutlined />}>正常</Tag>
        )}
      </div>

      {/* 四格数据 */}
      <div className="sdb-stats">
        <div className="sdb-stat-item">
          <div className="sdb-stat-label">昨日入库</div>
          <div className="sdb-stat-value">{data.yesterdayWarehousingCount}<span className="sdb-stat-unit">单</span></div>
          <div className="sdb-stat-sub">{data.yesterdayWarehousingQuantity} 件</div>
        </div>
        <div className="sdb-stat-divider" />
        <div className="sdb-stat-item">
          <div className="sdb-stat-label">
            <ScanOutlined style={{ marginRight: 4 }} />今日扫码
          </div>
          <div className="sdb-stat-value">{data.todayScanCount}<span className="sdb-stat-unit">次</span></div>
        </div>
        <div className="sdb-stat-divider" />
        <div className="sdb-stat-item">
          <div className="sdb-stat-label">逾期订单</div>
          <div className={`sdb-stat-value ${data.overdueOrderCount > 0 ? 'sdb-danger' : 'sdb-ok'}`}>
            {data.overdueOrderCount}<span className="sdb-stat-unit">张</span>
          </div>
        </div>
        <div className="sdb-stat-divider" />
        <div className="sdb-stat-item">
          <div className="sdb-stat-label">高风险订单</div>
          <div className={`sdb-stat-value ${data.highRiskOrderCount > 0 ? 'sdb-warn' : 'sdb-ok'}`}>
            {data.highRiskOrderCount}<span className="sdb-stat-unit">张</span>
          </div>
          <div className="sdb-stat-sub">7天内到期 进度&lt;50%</div>
        </div>
      </div>

      {/* 首要关注订单 */}
      {data.topPriorityOrder && (
        <div className="sdb-priority-order">
          <span className="sdb-priority-label">🎯 首要跟进：</span>
          <span className="sdb-priority-no">{data.topPriorityOrder.orderNo}</span>
          {data.topPriorityOrder.styleNo && (
            <span className="sdb-priority-style">款号 {data.topPriorityOrder.styleNo}</span>
          )}
          {data.topPriorityOrder.factoryName && (
            <span className="sdb-priority-factory">{data.topPriorityOrder.factoryName}</span>
          )}
          <span className="sdb-priority-progress">进度 {data.topPriorityOrder.progress}%</span>
          <Tag color={data.topPriorityOrder.daysLeft <= 2 ? 'red' : 'orange'}>
            剩 {data.topPriorityOrder.daysLeft} 天
          </Tag>
        </div>
      )}

      {/* 智能建议 */}
      <div className="sdb-suggestions">
        {data.suggestions.map((s, i) => (
          <div key={i} className="sdb-suggestion-item">{s}</div>
        ))}
      </div>
    </div>
  );
};

export default SmartDailyBrief;
