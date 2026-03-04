import React, { useState, useEffect, useCallback } from 'react';
import { Tag } from 'antd';
import { ExperimentOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type { LearningReportResponse, StageLearningStat } from '@/services/production/productionApi';

/** AI 自学进化报告面板（自动加载） */
const LearningReportPanel: React.FC = () => {
  const [data, setData] = useState<LearningReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');  const [triggering, setTriggering] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.getLearningReport() as any;
      setData(res?.data ?? res ?? null);
    } catch {
      setError('加载失败，请刷新重试');
    } finally {
      setLoading(false);
    }
  }, []);

  // 手动触发学习任务（删除脂儿行，重新计算工序统计）
  const handleTrigger = useCallback(async () => {
    setTriggering(true);
    try {
      await intelligenceApi.triggerLearning();
      await load(); // 触发完后自动刷新报告
    } catch {
      setError('学习任务触发失败');
    } finally {
      setTriggering(false);
    }
  }, [load]);

  useEffect(() => { load(); }, [load]);

  const stages: StageLearningStat[] = data?.stages ?? [];

  // 置信度颜色
  const confidenceColor = (c: number) =>
    c >= 0.8 ? '#39ff14' : c >= 0.6 ? '#00e5ff' : c >= 0.4 ? '#f7a600' : '#ff4136';

  // 总体评级
  const overallGrade = () => {
    const acc = data?.accuracyRate ?? 0;
    if (acc >= 0.85) return { label: 'A 级', color: '#39ff14' };
    if (acc >= 0.7)  return { label: 'B 级', color: '#00e5ff' };
    if (acc >= 0.5)  return { label: 'C 级', color: '#f7a600' };
    return { label: 'D 级', color: '#ff4136' };
  };
  const grade = overallGrade();

  return (
    <div className="c-card">
      <div className="c-card-title">
        <ExperimentOutlined style={{ marginRight: 6, color: '#39ff14' }} />
        AI 自学进化报告
        {data && (
          <span className="c-card-badge" style={{ background: `${grade.color}22`, color: grade.color, borderColor: grade.color }}>
            模型评级 {grade.label}
          </span>
        )}
        <button
          className="c-suggest-btn"
          style={{ marginLeft: 'auto', borderColor: 'rgba(57,255,20,0.3)', color: '#39ff14' }}
          onClick={load}
          disabled={loading}
        >
          {loading ? '加载中…' : '刷新'}
        </button>
        <button
          className="c-suggest-btn"
          style={{ borderColor: 'rgba(0,229,255,0.3)', color: '#00e5ff' }}
          onClick={handleTrigger}
          disabled={triggering || loading}
          title="重新计算工序统计，并删除名称异常的历史行（如质检领取）"
        >
          {triggering ? '学习中…' : '重新学习'}
        </button>
      </div>

      {error && <div className="c-empty" style={{ color: '#f7a600' }}>{error}</div>}
      {loading && <div className="c-empty">AI 正在整理学习记录…</div>}

      {data && !loading && (
        <>
          {/* 总体统计 KPI 行 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { label: '学习样本',    val: (data.totalSamples ?? 0).toLocaleString(), unit: '条',  color: '#00e5ff' },
              { label: '覆盖工序',    val: data.stageCount ?? 0,                       unit: '个',  color: '#a78bfa' },
              { label: '平均置信度',  val: `${((data.avgConfidence ?? 0) * 100).toFixed(0)}%`,    unit: '', color: confidenceColor(data.avgConfidence ?? 0) },
              { label: '预测准确率',  val: `${((data.accuracyRate ?? 0) * 100).toFixed(0)}%`,     unit: '', color: grade.color },
              { label: '用户反馈',    val: data.feedbackCount ?? 0,                    unit: '次',  color: '#f7a600' },
            ].map(({ label, val, unit, color }) => (
              <div key={label} style={{
                background: `${color}0e`, border: `1px solid ${color}2a`,
                borderRadius: 8, padding: '10px 12px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 11, color: '#4a6d8a', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: 'monospace' }}>
                  {val}<span style={{ fontSize: 12 }}>{unit}</span>
                </div>
              </div>
            ))}
          </div>

          {/* 最后学习时间 */}
          {data.lastLearnTime && (
            <div style={{ fontSize: 11, color: '#4a6d8a', marginBottom: 12 }}>
              🕐 最近学习时间：<span style={{ color: '#e2f0ff' }}>{data.lastLearnTime.slice(0, 16)}</span>
            </div>
          )}

          {/* 各工序明细 */}
          {stages.length > 0 && (
            <table className="c-table">
              <thead>
                <tr><th>工序</th><th>样本量</th><th>置信度</th><th>均值分钟/件</th><th>状态</th></tr>
              </thead>
              <tbody>
                {stages.map(s => {
                  const col = confidenceColor(s.confidence);
                  return (
                    <tr key={s.stageName}>
                      <td style={{ color: '#e2f0ff', fontWeight: 600 }}>{s.stageName}</td>
                      <td style={{ color: '#a0c4e0' }}>{s.sampleCount.toLocaleString()}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 60, height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2 }}>
                            <div style={{
                              width: `${(s.confidence * 100).toFixed(0)}%`,
                              height: '100%', background: col, borderRadius: 2,
                            }} />
                          </div>
                          <span style={{ color: col, fontSize: 12 }}>{(s.confidence * 100).toFixed(0)}%</span>
                        </div>
                      </td>
                      <td style={{ color: '#00e5ff' }}>{s.avgMinutesPerUnit.toFixed(1)} min</td>
                      <td>
                        <Tag style={{ background: `${col}22`, color: col, borderColor: col, fontSize: 11 }}>
                          {s.confidence >= 0.7 ? '可信' : s.confidence >= 0.4 ? '学习中' : '数据不足'}
                        </Tag>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {stages.length === 0 && <div className="c-empty">暂无工序学习数据，完成更多扫码和反馈后模型将自动学习</div>}
        </>
      )}
    </div>
  );
};

export default LearningReportPanel;
