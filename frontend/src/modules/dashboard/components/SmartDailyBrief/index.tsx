import React, { useEffect, useState } from 'react';
import { Alert, Skeleton, Tag } from 'antd';
import {
  AlertOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  InboxOutlined,
  LineChartOutlined,
  ScanOutlined,
  WarningOutlined,
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
  weekScanCount?: number;
  weekWarehousingCount?: number;
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
        {/* 格子 1: 昨日入库 — 蓝色 */}
        <div className="sdb-stat-item">
          <div className="sdb-stat-icon"><InboxOutlined /></div>
          <div className="sdb-stat-label">昨日入库</div>
          <div className="sdb-stat-value">
            {data.yesterdayWarehousingCount > 0
              ? <>{data.yesterdayWarehousingCount}<span className="sdb-stat-unit">单</span></>
              : <span className="sdb-empty">暂无</span>}
          </div>
          <div className="sdb-stat-sub">
            {data.yesterdayWarehousingCount > 0
              ? `${data.yesterdayWarehousingQuantity} 件`
              : `近7天 ${data.weekWarehousingCount ?? 0} 单`}
          </div>
        </div>

        {/* 格子 2: 今日扫码 — 紫色 */}
        <div className="sdb-stat-item">
          <div className="sdb-stat-icon"><ScanOutlined /></div>
          <div className="sdb-stat-label">今日扫码</div>
          <div className="sdb-stat-value">
            {data.todayScanCount > 0
              ? <>{data.todayScanCount}<span className="sdb-stat-unit">次</span></>
              : <span className="sdb-empty">暂无</span>}
          </div>
          <div className="sdb-stat-sub">
            {data.todayScanCount === 0 && (data.weekScanCount ?? 0) > 0
              ? `近7天 ${data.weekScanCount} 次`
              : '\u00a0'}
          </div>
        </div>

        {/* 格子 3: 逾期订单 — 绿/红 */}
        <div className={`sdb-stat-item ${data.overdueOrderCount > 0 ? 'has-issue' : 'no-issue'}`}>
          <div className="sdb-stat-icon">
            {data.overdueOrderCount > 0 ? <ExclamationCircleOutlined /> : <CheckCircleOutlined />}
          </div>
          <div className="sdb-stat-label">逾期订单</div>
          <div className="sdb-stat-value">
            {data.overdueOrderCount}<span className="sdb-stat-unit">张</span>
          </div>
          <div className="sdb-stat-sub">{data.overdueOrderCount === 0 ? '无逾期 ✓' : '尽快跟进工厂'}</div>
        </div>

        {/* 格子 4: 高风险订单 — 绿/橙 */}
        <div className={`sdb-stat-item ${data.highRiskOrderCount > 0 ? 'has-issue' : 'no-issue'}`}>
          <div className="sdb-stat-icon">
            {data.highRiskOrderCount > 0 ? <WarningOutlined /> : <CheckCircleOutlined />}
          </div>
          <div className="sdb-stat-label">高风险订单</div>
          <div className="sdb-stat-value">
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
        {(data.suggestions ?? []).map((s, i) => (
          <div key={i} className="sdb-suggestion-item">{s}</div>
        ))}
      </div>
    </div>
  );
};

export default SmartDailyBrief;
