import React, { useEffect, useState, useRef } from 'react';
import { Popover, Spin, Tag } from 'antd';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';

/* ===== 类型定义 ===== */
interface WorkerDefect {
  operatorId: string;
  operatorName: string;
  defectCount: number;
  totalScans: number;
  defectRate: number;
  worstProcess: string;
  riskLevel: 'low' | 'medium' | 'high';
}

interface ProcessDefect {
  processName: string;
  defectCount: number;
  totalScans: number;
  defectRate: number;
}

interface DayTrend {
  date: string;
  defectCount: number;
  totalScans: number;
}

interface DefectTraceData {
  totalDefects: number;
  totalScans: number;
  overallDefectRate: number;
  workers: WorkerDefect[];
  hotProcesses: ProcessDefect[];
  trend: DayTrend[];
}

/* ===== 样式常量 ===== */
const riskColor: Record<string, string> = { low: 'var(--color-success)', medium: 'var(--color-warning)', high: 'var(--color-danger)' };
const riskLabel: Record<string, string> = { low: '低风险', medium: '中风险', high: '高风险' };

/* ===== 组件 ===== */
const DefectTracePopover: React.FC<{
  orderId: string;
  children: React.ReactNode;
  /** 订单是否有次品记录（由父组件从列表数据传入，实现红点的预显示，不需要等悬停触发请求） */
  hasDefects?: boolean;
}> = ({ orderId, children, hasDefects = false }) => {
  const [data, setData] = useState<DefectTraceData | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  const fetchData = async () => {
    if (fetchedRef.current || !orderId) return;
    fetchedRef.current = true;
    setLoading(true);
    try {
      const res = await intelligenceApi.getDefectTrace(orderId);
      if (res?.data) setData(res.data as unknown as DefectTraceData);
    } catch {
      // 静默失败
    } finally {
      setLoading(false);
    }
  };

  // 重置 fetchedRef when orderId changes
  useEffect(() => { fetchedRef.current = false; setData(null); }, [orderId]);

  // hasDefects 由父组件从列表数据传入（后端批量填充的unqualifiedQuantity），实现红点预显示
  // 等悬停加载完数据后用实际数据覆盖
  const showDot = hasDefects || (data != null && data.totalDefects > 0);

  const content = loading ? (
    <div className="u-ta-center u-p-16" style={{ width: 280 }}><Spin /></div>
  ) : !data || data.totalDefects === 0 ? (
    <div className="u-fs-14 u-ta-center u-p-12" style={{ width: 260, color: 'var(--color-text-tertiary)' }}>
       该订单暂无次品记录
    </div>
  ) : (
    <div className="u-fs-14" style={{ width: 300 }}>
      {/* 标题 */}
      <div className="u-d-flex u-jc-between u-ai-center u-mb-8">
        <span className="u-fw-600 u-fs-14"> 次品溯源</span>
        <Tag color={data.overallDefectRate > 10 ? 'red' : data.overallDefectRate > 5 ? 'orange' : 'green'}>
          缺陷率 {data.overallDefectRate}%
        </Tag>
      </div>

      {/* 总览 */}
      <div className="u-d-flex u-gap-12 u-mb-8 u-fs-14" style={{ color: 'var(--color-gray-700)' }}>
        <span>次品 <b style={{ color: 'var(--color-danger)' }}>{data.totalDefects}</b> 次</span>
        <span>总扫码 <b>{data.totalScans}</b> 次</span>
      </div>

      {/* 工人缺陷明细 */}
      {(data.workers?.length ?? 0) > 0 && (
        <>
          <div className="u-fs-14 u-mb-4" style={{ color: 'var(--color-text-tertiary)' }}> 工人缺陷明细</div>
          {data.workers.slice(0, 5).map((w, i) => (
            <div key={i} className="u-d-flex u-ai-center u-gap-6" style={{ padding: '3px 0' }}>
              <span className="u-fshrink-0 u-fw-500 u-ov-hidden u-ws-nowrap" style={{ width: 56, textOverflow: 'ellipsis' }}>
                {w.operatorName}
              </span>
              <span style={{ color: riskColor[w.riskLevel], fontWeight: 500, flexShrink: 0 }}>
                {w.defectCount}次
              </span>
              <span className="u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>
                ({w.defectRate}%)
              </span>
              <Tag color={riskColor[w.riskLevel]} className="u-fs-14 u-lh-16px u-p-04px u-ml-auto">
                {riskLabel[w.riskLevel]}
              </Tag>
            </div>
          ))}
        </>
      )}

      {/* 高频缺陷工序 */}
      {(data.hotProcesses?.length ?? 0) > 0 && (
        <>
          <div className="u-fs-14 u-mt-6 u-mb-4" style={{ color: 'var(--color-text-tertiary)' }}> 高频缺陷工序</div>
          {data.hotProcesses.map((p, i) => (
            <div key={i} className="u-d-flex u-gap-8 u-fs-14" style={{ padding: '2px 0' }}>
              <span className="u-fw-500">{p.processName}</span>
              <span style={{ color: 'var(--color-danger)' }}>{p.defectCount}次</span>
              <span style={{ color: 'var(--color-text-tertiary)' }}>({p.defectRate}%)</span>
            </div>
          ))}
        </>
      )}

      {/* 7天趋势（简化为mini sparkline数字） */}
      {(data.trend?.length ?? 0) > 0 && data.trend.some(t => t.defectCount > 0) && (
        <>
          <div className="u-fs-14 u-mt-6 u-mb-4" style={{ color: 'var(--color-text-tertiary)' }}> 近7天趋势</div>
          <div className="u-d-flex u-gap-4" style={{ alignItems: 'flex-end' }}>
            {data.trend.map((t, i) => {
              const maxDefect = Math.max(...data.trend.map(d => d.defectCount), 1);
              const h = Math.max(4, (t.defectCount / maxDefect) * 28);
              return (
                <div key={i} className="u-d-flex u-fd-column u-ai-center u-flex-1">
                  <div
                    style={{
                      width: '100%',
                      height: h,
                      background: t.defectCount > 0 ? 'var(--color-danger)' : 'var(--color-border-antd)',
                      borderRadius: 2,
                      opacity: t.defectCount > 0 ? 0.8 : 0.3,
                    }}
                    title={`${t.date}: ${t.defectCount}次缺陷 / ${t.totalScans}次扫码`}
                  />
                  <div className="u-mt-2" style={{ fontSize: 9, color: 'var(--color-text-quaternary)' }}>
                    {t.date.slice(5)}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="u-mt-6 u-fs-14" style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: 6, color: 'var(--color-text-tertiary)' }}>
         悬停进度球查看次品溯源，点击查看扫码明细
      </div>
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="hover"
      placement="top"
      mouseEnterDelay={0.4}
      onOpenChange={(open) => { if (open) fetchData(); }}
    >
      <span className="u-pos-relative u-d-inline-block">
        {children}
        {showDot && (
          <span style={{
            position: 'absolute', top: -2, right: -2, zIndex: 2,
            width: 10, height: 10, borderRadius: '50%',
            background: 'var(--color-danger)', border: '1.5px solid var(--color-bg-base)',
          }} />
        )}
      </span>
    </Popover>
  );
};

export default DefectTracePopover;
