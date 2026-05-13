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
const riskColor: Record<string, string> = { low: '#52c41a', medium: '#faad14', high: '#ff4d4f' };
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
    <div style={{ width: 280, textAlign: 'center', padding: 16 }}><Spin /></div>
  ) : !data || data.totalDefects === 0 ? (
    <div style={{ width: 260, fontSize: 13, color: '#8c8c8c', textAlign: 'center', padding: 12 }}>
       该订单暂无次品记录
    </div>
  ) : (
    <div style={{ width: 300, fontSize: 13 }}>
      {/* 标题 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}> 次品溯源</span>
        <Tag color={data.overallDefectRate > 10 ? 'red' : data.overallDefectRate > 5 ? 'orange' : 'green'}>
          缺陷率 {data.overallDefectRate}%
        </Tag>
      </div>

      {/* 总览 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 12, color: '#595959' }}>
        <span>次品 <b style={{ color: '#ff4d4f' }}>{data.totalDefects}</b> 次</span>
        <span>总扫码 <b>{data.totalScans}</b> 次</span>
      </div>

      {/* 工人缺陷明细 */}
      {(data.workers?.length ?? 0) > 0 && (
        <>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}> 工人缺陷明细</div>
          {data.workers.slice(0, 5).map((w, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '3px 0', gap: 6 }}>
              <span style={{ width: 56, flexShrink: 0, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {w.operatorName}
              </span>
              <span style={{ color: riskColor[w.riskLevel], fontWeight: 500, flexShrink: 0 }}>
                {w.defectCount}次
              </span>
              <span style={{ color: '#8c8c8c', fontSize: 11 }}>
                ({w.defectRate}%)
              </span>
              <Tag color={riskColor[w.riskLevel]} style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', marginLeft: 'auto' }}>
                {riskLabel[w.riskLevel]}
              </Tag>
            </div>
          ))}
        </>
      )}

      {/* 高频缺陷工序 */}
      {(data.hotProcesses?.length ?? 0) > 0 && (
        <>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 6, marginBottom: 4 }}> 高频缺陷工序</div>
          {data.hotProcesses.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '2px 0', fontSize: 12 }}>
              <span style={{ fontWeight: 500 }}>{p.processName}</span>
              <span style={{ color: '#ff4d4f' }}>{p.defectCount}次</span>
              <span style={{ color: '#8c8c8c' }}>({p.defectRate}%)</span>
            </div>
          ))}
        </>
      )}

      {/* 7天趋势（简化为mini sparkline数字） */}
      {(data.trend?.length ?? 0) > 0 && data.trend.some(t => t.defectCount > 0) && (
        <>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 6, marginBottom: 4 }}> 近7天趋势</div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
            {data.trend.map((t, i) => {
              const maxDefect = Math.max(...data.trend.map(d => d.defectCount), 1);
              const h = Math.max(4, (t.defectCount / maxDefect) * 28);
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                  <div
                    style={{
                      width: '100%',
                      height: h,
                      background: t.defectCount > 0 ? '#ff4d4f' : '#e8e8e8',
                      borderRadius: 2,
                      opacity: t.defectCount > 0 ? 0.8 : 0.3,
                    }}
                    title={`${t.date}: ${t.defectCount}次缺陷 / ${t.totalScans}次扫码`}
                  />
                  <div style={{ fontSize: 9, color: '#bbb', marginTop: 2 }}>
                    {t.date.slice(5)}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 6, paddingTop: 6, color: '#8c8c8c', fontSize: 12 }}>
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
      <span style={{ position: 'relative', display: 'inline-block' }}>
        {children}
        {showDot && (
          <span style={{
            position: 'absolute', top: -2, right: -2, zIndex: 2,
            width: 10, height: 10, borderRadius: '50%',
            background: '#ff4d4f', border: '1.5px solid #fff',
          }} />
        )}
      </span>
    </Popover>
  );
};

export default DefectTracePopover;
