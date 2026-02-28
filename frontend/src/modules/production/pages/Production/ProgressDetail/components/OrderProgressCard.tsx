/**
 * OrderProgressCard — 订单进度卡片（交互版 v2）
 * 悬停面板三 Tab：智能预测 / 纸样下载 / 生产要求
 */
import React, { useState, useRef, useCallback } from 'react';
import { Tag, Button, Tooltip, Spin } from 'antd';
import {
  ClockCircleOutlined, ThunderboltOutlined, WarningOutlined,
  CheckCircleOutlined, QuestionCircleOutlined, RightOutlined,
  DownloadOutlined, FileImageOutlined, FileOutlined,
  PhoneOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import { ProductionOrder } from '@/types/production';
import { StyleCoverThumb } from '@/components/StyleAssets';
import { calcSmartPrediction, fmtDate, fmtBuffer } from '../utils/smartPredict';
import patternRevisionService from '@/services/patternRevisionService';

/* ─── 配置 ─── */
const STATUS_CFG: Record<string, { text: string; color: string; bg: string }> = {
  pending:     { text: '待生产', color: '#8c8c8c', bg: '#f5f5f5' },
  in_progress: { text: '生产中', color: '#1677ff', bg: '#e6f4ff' },
  production:  { text: '生产中', color: '#1677ff', bg: '#e6f4ff' },
  completed:   { text: '已完成', color: '#52c41a', bg: '#f6ffed' },
  delayed:     { text: '已逾期', color: '#fa8c16', bg: '#fff7e6' },
};
const RISK_CFG = {
  safe:      { color: '#52c41a', bg: 'rgba(82,196,26,0.08)',   icon: <CheckCircleOutlined />,    label: '按时完成' },
  warning:   { color: '#fa8c16', bg: 'rgba(250,140,22,0.08)',  icon: <WarningOutlined />,        label: '存在风险' },
  danger:    { color: '#ff4d4f', bg: 'rgba(255,77,79,0.08)',   icon: <ThunderboltOutlined />,    label: '高危预警' },
  completed: { color: '#52c41a', bg: 'rgba(82,196,26,0.08)',   icon: <CheckCircleOutlined />,    label: '已完成'   },
  unknown:   { color: '#8c8c8c', bg: 'rgba(140,140,140,0.08)', icon: <QuestionCircleOutlined />, label: '待开始'   },
};
const TABS = [
  { key: 'predict', label: '智能预测' },
  { key: 'pattern', label: '纸样' },
  { key: 'require', label: '生产要求' },
] as const;
type TabKey = typeof TABS[number]['key'];

/* ─── 纸样附件解析 ─── */
function parseAttachments(raw?: string): { name: string; url: string }[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.map((u: unknown, i) =>
      typeof u === 'string' ? { name: `附件${i + 1}`, url: u } : { name: (u as any).name || `附件${i + 1}`, url: (u as any).url || '' }
    ).filter(a => a.url);
  } catch { /* fall through */ }
  return raw.split(',').filter(Boolean).map((u, i) => ({ name: u.split('/').pop() || `附件${i + 1}`, url: u.trim() }));
}

/* ─── Props ─── */
interface Props {
  order: ProductionOrder;
  onViewDetail: (order: ProductionOrder) => void;
  onScan?: (order: ProductionOrder) => void;
  onRollback?: (order: ProductionOrder) => void;
  onQuickEdit?: (order: ProductionOrder) => void;
}

/* ════════════════ */
const OrderProgressCard: React.FC<Props> = ({ order, onViewDetail, onScan, onRollback, onQuickEdit }) => {
  const [hovered,        setHovered]        = useState(false);
  const [activeTab,      setActiveTab]      = useState<TabKey>('predict');
  const [patternData,    setPatternData]    = useState<{ revisionNo?: string; attachments: { name: string; url: string }[]; revisionContent?: string } | null>(null);
  const [patternLoading, setPatternLoading] = useState(false);
  const hoverTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const patternDone = useRef(false);

  const sCfg   = STATUS_CFG[order.status] ?? { text: order.status, color: '#8c8c8c', bg: '#f5f5f5' };
  const pred   = calcSmartPrediction({ orderQuantity: order.orderQuantity, completedQuantity: order.completedQuantity || 0, productionProgress: order.productionProgress || 0, createTime: order.createTime, plannedEndDate: order.plannedEndDate, status: order.status });
  const rCfg   = RISK_CFG[pred.risk];
  const pct    = Math.min(100, Math.max(0, order.productionProgress || 0));
  const barClr = pred.risk === 'danger' ? '#ff4d4f' : pred.risk === 'warning' ? '#fa8c16' : pred.risk === 'completed' ? '#52c41a' : '#1677ff';

  const fetchPattern = useCallback(async () => {
    if (patternDone.current || !order.styleNo) return;
    patternDone.current = true;
    setPatternLoading(true);
    try {
      const res: any = await patternRevisionService.list({ styleNo: order.styleNo, pageSize: 1 });
      const list: any[] = res?.list ?? res?.data?.list ?? [];
      const l = list[0];
      setPatternData({ revisionNo: l?.revisionNo, revisionContent: l?.revisionContent, attachments: parseAttachments(l?.attachmentUrls) });
    } catch { setPatternData({ attachments: [] }); }
    finally { setPatternLoading(false); }
  }, [order.styleNo]);

  const hover = (on: boolean) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovered(on), on ? 120 : 80);
  };

  const stages = [
    { label: '采购', rate: order.procurementCompletionRate  ?? 0 },
    { label: '裁剪', rate: order.cuttingCompletionRate      ?? 0 },
    { label: '车缝', rate: order.sewingCompletionRate       ?? 0 },
    { label: '质检', rate: order.qualityCompletionRate      ?? 0 },
    { label: '入库', rate: order.warehousingCompletionRate  ?? 0 },
  ];

  return (
    <div style={{ position: 'relative', marginBottom: 12 }} onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)}>

      {/* ── 主卡片 ── */}
      <div onClick={() => onViewDetail(order)} style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', cursor: 'pointer', border: `1.5px solid ${hovered ? barClr + '55' : '#f0f0f0'}`, boxShadow: hovered ? '0 6px 24px rgba(0,0,0,0.10)' : '0 1px 4px rgba(0,0,0,0.06)', transform: hovered ? 'translateY(-2px)' : 'none', transition: 'all 0.22s cubic-bezier(.4,0,.2,1)', display: 'flex', gap: 14 }}>
        <div style={{ flexShrink: 0 }}><StyleCoverThumb styleNo={order.styleNo} src={order.styleCover} size={76} borderRadius={8} /></div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>{order.orderNo}</span>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 20, color: sCfg.color, background: sCfg.bg, border: `1px solid ${sCfg.color}33` }}>{sCfg.text}</span>
            {order.urgencyLevel === 'urgent' && <Tag color="error" style={{ margin: 0, fontSize: 10 }}>急单</Tag>}
            {order.plateType === 'FIRST' && <Tag color="blue" style={{ margin: 0, fontSize: 10 }}>首单</Tag>}
            {pred.risk !== 'unknown' && pred.risk !== 'completed' && (
              <Tooltip title={pred.riskLabel}><span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20, color: rCfg.color, background: rCfg.bg }}>{rCfg.icon} {rCfg.label}</span></Tooltip>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '4px 0', fontSize: 12, color: '#595959', marginBottom: 10 }}>
            {[['款号', order.styleNo], ['款名', order.styleName || '-'], ['工厂', order.factoryName || '-'], ['交期', order.plannedEndDate?.slice(0, 10) ?? '-'],
              ['总量', String(order.orderQuantity)], ['完成', String(order.completedQuantity || 0)], ['入库', String(order.warehousingQualifiedQuantity || 0)], ['速度', pred.dailyRate > 0 ? `${pred.dailyRate}件/天` : '-']
            ].map(([k, v]) => <div key={k}><span style={{ color: '#8c8c8c' }}>{k}：</span><span style={{ fontWeight: 500 }}>{v}</span></div>)}
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: '#8c8c8c' }}><ClockCircleOutlined style={{ marginRight: 4 }} />{pred.estimatedDate ? `预计 ${fmtDate(pred.estimatedDate)} 完成` : '生产进度'}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: barClr }}>{pct}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 99, background: '#f0f0f0', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg,${barClr}99,${barClr})`, borderRadius: 99, transition: 'width 0.6s ease', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', background: 'rgba(255,255,255,0.3)', borderRadius: 99 }} />
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center', flexShrink: 0, opacity: hovered ? 1 : 0.6, transition: 'opacity 0.2s' }}>
          <Button size="small" type="primary" ghost onClick={(e) => { e.stopPropagation(); onViewDetail(order); }}>详情</Button>
          {onScan      && <Button size="small" onClick={(e) => { e.stopPropagation(); onScan(order); }}>扫码</Button>}
          {onRollback  && <Button size="small" danger ghost onClick={(e) => { e.stopPropagation(); onRollback(order); }}>回退</Button>}
          {onQuickEdit && <Button size="small" onClick={(e) => { e.stopPropagation(); onQuickEdit(order); }}>编辑</Button>}
        </div>
      </div>

      {/* ══ 悬停面板 ══ */}
      <div
        onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)}
        style={{ position: 'absolute', top: 0, right: hovered ? -252 : -240, width: 240, background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.14)', border: `1.5px solid ${barClr}33`, opacity: hovered ? 1 : 0, pointerEvents: hovered ? 'auto' : 'none', transition: 'opacity 0.2s, right 0.22s cubic-bezier(.4,0,.2,1)', zIndex: 100, display: 'flex', flexDirection: 'column' }}
      >
        {/* 面板头 */}
        <div style={{ padding: '12px 14px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: rCfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: rCfg.color, fontSize: 13 }}>{rCfg.icon}</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a1a' }}>{order.orderNo}</div>
            <div style={{ fontSize: 10, color: rCfg.color }}>{rCfg.label}</div>
          </div>
        </div>

        {/* Tab 导航 */}
        <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0', margin: '10px 14px 0' }}>
          {TABS.map(t => (
            <button key={t.key}
              onClick={(e) => { e.stopPropagation(); setActiveTab(t.key); if (t.key === 'pattern') fetchPattern(); }}
              style={{ flex: 1, background: 'none', border: 'none', padding: '5px 0', fontSize: 11, fontWeight: activeTab === t.key ? 700 : 400, color: activeTab === t.key ? barClr : '#8c8c8c', borderBottom: `2px solid ${activeTab === t.key ? barClr : 'transparent'}`, cursor: 'pointer', transition: 'all 0.15s' }}
            >{t.label}</button>
          ))}
        </div>

        {/* Tab 内容 */}
        <div style={{ padding: '12px 14px', overflowY: 'auto', maxHeight: 260 }}>

          {/* 预测 Tab */}
          {activeTab === 'predict' && <>
            <div style={{ marginBottom: 10 }}>
              {stages.map(s => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <span style={{ fontSize: 10, color: '#8c8c8c', width: 28 }}>{s.label}</span>
                  <div style={{ flex: 1, height: 4, borderRadius: 99, background: '#f0f0f0' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, s.rate)}%`, background: s.rate >= 100 ? '#52c41a' : barClr, borderRadius: 99 }} />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: s.rate >= 100 ? '#52c41a' : '#262626', width: 28, textAlign: 'right' }}>{s.rate}%</span>
                </div>
              ))}
            </div>
            <div style={{ height: 1, background: '#f5f5f5', margin: '0 0 10px' }} />
            {[
              { icon: '📅', label: '预计完成', value: pred.estimatedDate ? fmtDate(pred.estimatedDate) : '—', hl: pred.risk === 'danger' },
              { icon: '⏱', label: '还需天数', value: pred.daysNeeded >= 0 ? `${pred.daysNeeded} 天` : '—' },
              { icon: '⚡', label: '当前速度', value: pred.dailyRate > 0 ? `${pred.dailyRate} 件/天` : '—' },
              { icon: '📦', label: '剩余/总量', value: `${pred.remainingQty} / ${order.orderQuantity} 件` },
              { icon: '🎯', label: '交期余量', value: fmtBuffer(pred.bufferDays), hl: pred.bufferDays !== null && pred.bufferDays < 0, pos: pred.bufferDays !== null && pred.bufferDays >= 5 },
              { icon: '📆', label: '已生产天数', value: `${pred.elapsedDays} 天` },
            ].map(({ icon, label, value, hl, pos }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7, fontSize: 12 }}>
                <span style={{ color: '#8c8c8c' }}><span style={{ marginRight: 4 }}>{icon}</span>{label}</span>
                <span style={{ fontWeight: 600, color: hl ? '#ff4d4f' : (pos ? '#52c41a' : '#262626') }}>{value}</span>
              </div>
            ))}
          </>}

          {/* 纸样 Tab */}
          {activeTab === 'pattern' && (
            patternLoading ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}><Spin size="small" /></div>
            ) : !patternData || patternData.attachments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px 0', color: '#8c8c8c', fontSize: 12 }}>
                <FileImageOutlined style={{ fontSize: 28, marginBottom: 8, display: 'block' }} />
                暂无纸样附件<br />
                <span style={{ fontSize: 10, color: '#bfbfbf' }}>可在款式管理页上传纸样文件</span>
              </div>
            ) : <>
              {patternData.revisionNo && <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 6 }}>版本：<span style={{ color: '#262626', fontWeight: 600 }}>{patternData.revisionNo}</span></div>}
              {patternData.revisionContent && <div style={{ fontSize: 11, color: '#595959', background: '#fafafa', borderRadius: 6, padding: '6px 8px', marginBottom: 8, lineHeight: 1.5 }}>{patternData.revisionContent}</div>}
              <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 5 }}>附件下载</div>
              {patternData.attachments.map((a, i) => (
                <a key={i} href={a.url} target="_blank" rel="noreferrer" download onClick={(e) => e.stopPropagation()}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 7, background: '#f5f7ff', border: '1px solid #e8ecff', marginBottom: 6, textDecoration: 'none', color: '#1677ff' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = '#e8ecff'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = '#f5f7ff'; }}
                >
                  {/\.(jpg|jpeg|png|webp|gif)$/i.test(a.url) ? <FileImageOutlined /> : <FileOutlined />}
                  <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                  <DownloadOutlined style={{ fontSize: 11 }} />
                </a>
              ))}
            </>
          )}

          {/* 生产要求 Tab */}
          {activeTab === 'require' && <>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
              {order.urgencyLevel === 'urgent' && <Tag color="error" style={{ fontSize: 11, margin: 0 }}>急单</Tag>}
              {order.plateType && <Tag color={order.plateType === 'FIRST' ? 'blue' : 'cyan'} style={{ fontSize: 11, margin: 0 }}>{order.plateType === 'FIRST' ? '首单' : '翻单'}</Tag>}
              {order.company && <Tag color="default" style={{ fontSize: 11, margin: 0 }}>{order.company}</Tag>}
            </div>
            {order.operationRemark
              ? <div>
                  <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 4 }}><InfoCircleOutlined style={{ marginRight: 3 }} />生产备注</div>
                  <div style={{ fontSize: 12, color: '#262626', background: '#fffbe6', borderRadius: 6, padding: '8px 10px', border: '1px solid #ffe58f', lineHeight: 1.6 }}>{order.operationRemark}</div>
                </div>
              : <div style={{ fontSize: 12, color: '#bfbfbf', textAlign: 'center', padding: '10px 0' }}>暂无生产备注</div>
            }
            {(order.factoryContactPerson || order.factoryContactPhone) && (
              <div style={{ marginTop: 10, padding: '8px 10px', background: '#f6ffed', borderRadius: 7, border: '1px solid #b7eb8f' }}>
                <div style={{ fontSize: 11, color: '#52c41a', fontWeight: 600, marginBottom: 4 }}>工厂联系</div>
                {order.factoryContactPerson && <div style={{ fontSize: 11 }}>{order.factoryContactPerson}</div>}
                {order.factoryContactPhone && (
                  <a href={`tel:${order.factoryContactPhone}`} onClick={(e) => e.stopPropagation()} style={{ fontSize: 11, color: '#1677ff', display: 'flex', alignItems: 'center', gap: 3, marginTop: 3 }}>
                    <PhoneOutlined /> {order.factoryContactPhone}
                  </a>
                )}
              </div>
            )}
            {order.merchandiser && <div style={{ marginTop: 8, fontSize: 11, color: '#8c8c8c' }}>跟单员：<span style={{ color: '#262626', fontWeight: 500 }}>{order.merchandiser}</span></div>}
          </>}
        </div>

        <div style={{ height: 1, background: '#f0f0f0', margin: '0 14px' }} />
        <div onClick={(e) => { e.stopPropagation(); onViewDetail(order); }} style={{ padding: '9px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11, color: '#1677ff', cursor: 'pointer' }}>
          查看完整进度 <RightOutlined style={{ fontSize: 10 }} />
        </div>
      </div>

    </div>
  );
};

export default OrderProgressCard;
