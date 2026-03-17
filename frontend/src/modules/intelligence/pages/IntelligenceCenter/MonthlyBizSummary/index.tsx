import React, { useState, useCallback } from 'react';
import api from '@/utils/api';

interface ProductionStats {
  producedPieces: number;
  qualityScanned: number;
  defectPieces: number;
  passedPieces: number;
  defectRatePct: number;
  repairRatePct: number;
  newOrders: number;
  completedOrders: number;
}

interface FactoryRow {
  factoryName: string;
  pieces: number;
}

interface MaterialStock {
  inboundCount: number;
  inboundQuantity: number;
  outboundQuantity: number;
}

interface FinishedGoods {
  inboundPieces: number;
  outboundPieces: number;
}

interface Finance {
  laborCost: number;
  estimatedRevenue: number;
  settlementProfit: number;
  grossMarginPct: number;
}

interface MonthlyData {
  year: number;
  month: number;
  period: string;
  startDate: string;
  endDate: string;
  production: ProductionStats;
  factoryBreakdown: FactoryRow[];
  materialStock: MaterialStock;
  finishedGoods: FinishedGoods;
  finance: Finance;
}

// ── 通用子组件 ─────────────────────────────────────────────────────────

const SectionLabel: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
  <div style={{
    fontSize: 12, color, fontWeight: 600, marginBottom: 10, marginTop: 16,
    paddingLeft: 8, borderLeft: `3px solid ${color}`, lineHeight: '18px',
  }}>
    {children}
  </div>
);

const KpiBox: React.FC<{
  label: string; value: string | number; unit?: string; color?: string;
}> = ({ label, value, unit, color = '#00e5ff' }) => (
  <div className="c-kpi" style={{ textAlign: 'center', padding: '6px 4px', minWidth: 80 }}>
    <div className="c-kpi-label">{label}</div>
    <div className="c-kpi-val" style={{ color, fontSize: 20 }}>{value}</div>
    {unit && <div className="c-kpi-unit">{unit}</div>}
  </div>
);

// ── 主组件 ─────────────────────────────────────────────────────────────

const MonthlyBizSummary: React.FC = () => {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<MonthlyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<any>(`/intelligence/monthly-biz-summary?year=${year}&month=${month}`);
      setData(res.data as MonthlyData);
    } catch {
      setError('加载月报失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  const selStyle: React.CSSProperties = {
    background: 'rgba(0,229,255,0.08)',
    border: '1px solid rgba(0,229,255,0.22)',
    color: '#e2e8f0',
    borderRadius: 4,
    padding: '3px 8px',
    fontSize: 13,
    outline: 'none',
  };

  return (
    <div>
      {/* ── 控制栏 ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ color: '#7dacc4', fontSize: 12 }}>选择月份：</span>
        <select value={year} onChange={e => setYear(Number(e.target.value))} style={selStyle}>
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}年</option>)}
        </select>
        <select value={month} onChange={e => setMonth(Number(e.target.value))} style={selStyle}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
            <option key={m} value={m}>{m}月</option>
          ))}
        </select>
        <button
          onClick={load}
          disabled={loading}
          style={{
            background: loading ? 'rgba(0,229,255,0.05)' : 'rgba(0,229,255,0.15)',
            border: '1px solid rgba(0,229,255,0.3)',
            color: loading ? '#4a6d8a' : '#00e5ff',
            borderRadius: 4, padding: '4px 18px', fontSize: 13,
            cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
          }}
        >
          {loading ? '加载中...' : '获取月报'}
        </button>
      </div>

      {/* ── 错误提示 ── */}
      {error && (
        <div style={{
          background: 'rgba(255,65,54,0.10)', border: '1px solid rgba(255,65,54,0.3)',
          borderRadius: 6, padding: '8px 14px', color: '#ff6b6b', fontSize: 13, marginBottom: 12,
        }}>
          ⚠ {error}
        </div>
      )}

      {/* ── 空状态 ── */}
      {!data && !loading && !error && (
        <div style={{ color: '#4a6d8a', fontSize: 13, textAlign: 'center', padding: '28px 0' }}>
          请选择年月后点击「获取月报」
        </div>
      )}

      {/* ── 数据展示 ── */}
      {data && (
        <>
          {/* 期间标题 */}
          <div style={{
            fontSize: 11, color: '#7dacc4', marginBottom: 4,
            paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            📅 统计区间：{data.startDate} 至 {data.endDate}
          </div>

          {/* 1. 生产总览 */}
          <SectionLabel color="#00e5ff">📦 生产总览</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            <KpiBox label="生产完成" value={data.production.producedPieces.toLocaleString()} unit="件" color="#00e5ff" />
            <KpiBox label="质检扫码" value={data.production.qualityScanned.toLocaleString()} unit="件" color="#7dacc4" />
            <KpiBox label="新建订单" value={data.production.newOrders} unit="单" color="#a78bfa" />
            <KpiBox label="完成订单" value={data.production.completedOrders} unit="单" color="#39ff14" />
          </div>

          {/* 2. 次品 / 返修率 */}
          <SectionLabel color="#f7a600">🔧 次品 / 返修率</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            <KpiBox label="次品件数" value={data.production.defectPieces.toLocaleString()} unit="件" color="#a78bfa" />
            <KpiBox label="合格件数" value={data.production.passedPieces.toLocaleString()} unit="件" color="#39ff14" />
            <KpiBox
              label="次品率"
              value={data.production.defectRatePct}
              unit="%"
              color={data.production.defectRatePct > 5 ? '#ff4136' : '#39ff14'}
            />
            <KpiBox
              label="返修率"
              value={data.production.repairRatePct}
              unit="%"
              color={data.production.repairRatePct > 5 ? '#ff4136' : '#39ff14'}
            />
          </div>

          {/* 3. 各工厂件数 */}
          {data.factoryBreakdown.length > 0 && (
            <>
              <SectionLabel color="#a78bfa">🏭 各工厂件数</SectionLabel>
              <table className="c-table" style={{ marginBottom: 4 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>工厂名称</th>
                    <th style={{ textAlign: 'right' }}>生产件数</th>
                    <th style={{ textAlign: 'right' }}>占比</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const total = data.factoryBreakdown.reduce((a, b) => a + b.pieces, 0);
                    return data.factoryBreakdown.map(f => (
                      <tr key={f.factoryName}>
                        <td>{f.factoryName}</td>
                        <td style={{ textAlign: 'right', color: '#00e5ff' }}>
                          {f.pieces.toLocaleString()} 件
                        </td>
                        <td style={{ textAlign: 'right', color: '#7dacc4' }}>
                          {total > 0 ? ((f.pieces / total) * 100).toFixed(1) : '0.0'}%
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </>
          )}

          {/* 4. 面辅料 & 成品进出 */}
          <SectionLabel color="#39ff14">📊 面辅料 & 成品进出</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 4 }}>
            {/* 面辅料 */}
            <div style={{
              background: 'rgba(0,229,255,0.04)', borderRadius: 8, padding: '10px 14px',
              border: '1px solid rgba(0,229,255,0.12)',
            }}>
              <div style={{ fontSize: 11, color: '#7dacc4', marginBottom: 6 }}>面辅料仓库</div>
              <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                <KpiBox label="入库数量" value={data.materialStock.inboundQuantity.toLocaleString()} unit="件/米" color="#00e5ff" />
                <KpiBox label="出库数量" value={data.materialStock.outboundQuantity.toLocaleString()} unit="件/米" color="#a78bfa" />
                <KpiBox label="入库批次" value={data.materialStock.inboundCount} unit="次" color="#39ff14" />
              </div>
            </div>
            {/* 成品 */}
            <div style={{
              background: 'rgba(57,255,20,0.04)', borderRadius: 8, padding: '10px 14px',
              border: '1px solid rgba(57,255,20,0.12)',
            }}>
              <div style={{ fontSize: 11, color: '#7dacc4', marginBottom: 6 }}>成品仓库</div>
              <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                <KpiBox label="入库件数" value={data.finishedGoods.inboundPieces.toLocaleString()} unit="件" color="#39ff14" />
                <KpiBox label="出库件数" value={data.finishedGoods.outboundPieces.toLocaleString()} unit="件" color="#a78bfa" />
              </div>
            </div>
          </div>

          {/* 5. 成本 & 利润 */}
          <SectionLabel color="#f7a600">💹 成本 & 利润</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            <KpiBox
              label="人工成本"
              value={'¥' + (data.finance.laborCost / 10000).toFixed(2)}
              unit="万元"
              color="#a78bfa"
            />
            <KpiBox
              label="结算收入"
              value={'¥' + (data.finance.estimatedRevenue / 10000).toFixed(2)}
              unit="万元"
              color="#00e5ff"
            />
            <KpiBox
              label="结算利润"
              value={'¥' + (data.finance.settlementProfit / 10000).toFixed(2)}
              unit="万元"
              color={data.finance.settlementProfit >= 0 ? '#39ff14' : '#ff4136'}
            />
            <KpiBox
              label="毛利率"
              value={data.finance.grossMarginPct + '%'}
              color={data.finance.grossMarginPct >= 20 ? '#39ff14' : '#f7a600'}
            />
          </div>

          {/* 数据说明 */}
          <div style={{
            marginTop: 14, fontSize: 11, color: '#4a6d8a',
            borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8,
          }}>
            * 人工成本 = 本月成功扫码工资合计；结算收入/利润 = 本月已更新对账单；次品率 = 次品件数 ÷ 质检总件数
          </div>
        </>
      )}
    </div>
  );
};

export default MonthlyBizSummary;
