/**
 * OrderProgressCard v3 - 细颗粒度悬停面板
 * Tab1 工序雷达：每段工序完成率 + 负责人 + 当前工序高亮 + 次品告警 + 物料到位
 * Tab2 智能预测：速度对比 / 交期余量 / 完成日期 / 风险预警
 * Tab3 联系操作：工厂电话(可拨) / 跟单员 / 生产备注 / 快捷按钮
 */
import React, { useState, useRef } from 'react';
import { Tag, Button, Tooltip } from 'antd';
import {
  ClockCircleOutlined,
  ThunderboltOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  QuestionCircleOutlined,
  RightOutlined,
  PhoneOutlined,
  UserOutlined,
  TeamOutlined,
} from '@ant-design/icons';

import { ProductionOrder } from '@/types/production';
import { StyleCoverThumb } from '@/components/StyleAssets';
import { calcSmartPrediction, fmtDate, fmtBuffer } from '../utils/smartPredict';

interface OrderProgressCardProps {
  order: ProductionOrder;
  onViewDetail: (order: ProductionOrder) => void;
  onScan?: (order: ProductionOrder) => void;
  onRollback?: (order: ProductionOrder) => void;
  onQuickEdit?: (order: ProductionOrder) => void;
}

const STATUS_CONFIG: Record<string, { text: string; color: string; bg: string }> = {
  pending:     { text: '待生产', color: '#8c8c8c', bg: '#f5f5f5' },
  in_progress: { text: '生产中', color: '#1677ff', bg: '#e6f4ff' },
  production:  { text: '生产中', color: '#1677ff', bg: '#e6f4ff' },
  completed:   { text: '已完成', color: '#52c41a', bg: '#f6ffed' },
  delayed:     { text: '已逾期', color: '#fa8c16', bg: '#fff7e6' },
  cancelled:   { text: '已取消', color: '#ff4d4f', bg: '#fff2f0' },
  canceled:    { text: '已取消', color: '#ff4d4f', bg: '#fff2f0' },
  paused:      { text: '已暂停', color: '#8c8c8c', bg: '#f5f5f5' },
  returned:    { text: '已退回', color: '#ff4d4f', bg: '#fff2f0' },
};

const RISK_CONFIG = {
  safe:      { color: '#52c41a', bg: 'rgba(82,196,26,0.08)',   icon: <CheckCircleOutlined />,    label: '按时完成' },
  warning:   { color: '#fa8c16', bg: 'rgba(250,140,22,0.08)',  icon: <WarningOutlined />,        label: '存在风险' },
  danger:    { color: '#ff4d4f', bg: 'rgba(255,77,79,0.08)',   icon: <ThunderboltOutlined />,    label: '高危预警' },
  completed: { color: '#52c41a', bg: 'rgba(82,196,26,0.08)',   icon: <CheckCircleOutlined />,    label: '已完成'   },
  unknown:   { color: '#8c8c8c', bg: 'rgba(140,140,140,0.08)', icon: <QuestionCircleOutlined />, label: '待开始'   },
};

// 工序段定义：取 order 上的对应字段
const STAGES = [
  { key: 'procurement', label: '采购', emoji: '🏭', rateKey: 'procurementCompletionRate', opKey: 'procurementOperatorName' },
  { key: 'cutting',     label: '裁剪', emoji: '✂️', rateKey: 'cuttingCompletionRate',     opKey: 'cuttingOperatorName'     },
  { key: 'sewing',      label: '车缝', emoji: '🧵', rateKey: 'sewingCompletionRate',       opKey: 'sewingOperatorName'      },
  { key: 'quality',     label: '质检', emoji: '🔍', rateKey: 'qualityCompletionRate',      opKey: 'qualityOperatorName'     },
  { key: 'warehousing', label: '入库', emoji: '📦', rateKey: 'warehousingCompletionRate',  opKey: 'warehousingOperatorName' },
] as const;

const TABS = [
  { key: 'process', label: '工序雷达' },
  { key: 'predict', label: '智能预测' },
  { key: 'contact', label: '联系操作' },
] as const;

type TabKey = 'process' | 'predict' | 'contact';

// ─── 子组件：工序雷达 Tab ───────────────────────────────────────────────────
const ProcessRadar: React.FC<{ order: ProductionOrder; progressColor: string }> = ({ order, progressColor }) => {
  const materialRate = Number(order.materialArrivalRate) || 0;
  const defectQty    = Number(order.unqualifiedQuantity) || 0;
  const repairQty    = Number((order as any).repairQuantity) || 0;
  const curProcess   = (order.currentProcessName as string) || '';

  return (
    <div>
      {/* 物料到位率 */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:3 }}>
          <span style={{ color:'#595959' }}>🏭 物料到位</span>
          <span style={{ fontWeight:600, color: materialRate >= 100 ? '#52c41a' : materialRate >= 50 ? '#fa8c16' : '#ff4d4f' }}>
            {materialRate}%
          </span>
        </div>
        <div style={{ height:4, borderRadius:99, background:'#f0f0f0' }}>
          <div style={{ height:'100%', width:`${materialRate}%`, background:'#13c2c2', borderRadius:99, transition:'width 0.5s' }} />
        </div>
      </div>

      {/* 分隔 */}
      <div style={{ height:1, background:'#f5f5f5', margin:'0 -16px 10px' }} />

      {/* 五段工序 */}
      {STAGES.map(s => {
        const rate     = Number((order as any)[s.rateKey]) || 0;
        const op       = String((order as any)[s.opKey] || '');
        const isActive = curProcess.includes(s.label);
        const barColor = rate >= 100 ? '#52c41a' : isActive ? progressColor : '#bfbfbf';

        return (
          <div key={s.key} style={{ marginBottom: 9 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:11, marginBottom:2 }}>
              <span style={{ color: isActive ? progressColor : '#595959', fontWeight: isActive ? 700 : 400, flex:1 }}>
                {s.emoji} {s.label}
                {isActive && <span style={{ color: progressColor, marginLeft:4, fontSize:10 }}>▶ 当前</span>}
              </span>
              <span style={{ color:'#bfbfbf', fontSize:10, maxWidth:54, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginRight:6 }}>
                {op || '—'}
              </span>
              <span style={{ fontWeight:700, color: barColor, minWidth:28, textAlign:'right' }}>
                {rate}%
              </span>
            </div>
            <div style={{ height:4, borderRadius:99, background:'#f5f5f5', overflow:'hidden' }}>
              <div style={{
                height:'100%', width:`${rate}%`,
                background: isActive
                  ? `linear-gradient(90deg,${progressColor}99,${progressColor})`
                  : barColor,
                borderRadius:99, transition:'width 0.6s',
              }} />
            </div>
          </div>
        );
      })}

      {/* 次品 / 返修告警 */}
      {defectQty > 0 && (
        <div style={{ marginTop:8, padding:'6px 8px', background:'#fff2f0', borderRadius:6, border:'1px solid #ffa39e', fontSize:11, color:'#cf1322' }}>
          ⚠️ 次品 <b>{defectQty}</b> 件{repairQty > 0 ? `  返修 ${repairQty} 件` : ''}
        </div>
      )}
    </div>
  );
};

// ─── 子组件：智能预测 Tab ──────────────────────────────────────────────────
const SmartPredict: React.FC<{ order: ProductionOrder; progressColor: string }> = ({ order, progressColor }) => {
  const pred = calcSmartPrediction({
    orderQuantity:      order.orderQuantity,
    completedQuantity:  order.completedQuantity || 0,
    productionProgress: order.productionProgress || 0,
    createTime:         order.createTime,
    plannedEndDate:     order.plannedEndDate,
    status:             order.status,
  });
  const riskCfg = RISK_CONFIG[pred.risk];

  // 需要速度 vs 当前速度
  const neededRate = pred.daysNeeded > 0 ? Math.ceil(pred.remainingQty / pred.daysNeeded) : 0;
  const speedOk    = pred.dailyRate > 0 && pred.dailyRate >= neededRate;

  return (
    <div>
      {/* 风险头 */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, padding:'6px 8px', background: riskCfg.bg, borderRadius:8 }}>
        <span style={{ color: riskCfg.color, fontSize:16 }}>{riskCfg.icon}</span>
        <div>
          <div style={{ fontSize:12, fontWeight:700, color: riskCfg.color }}>{riskCfg.label}</div>
          <div style={{ fontSize:10, color:'#8c8c8c' }}>{pred.riskLabel}</div>
        </div>
      </div>

      {/* 速度对比 */}
      {pred.dailyRate > 0 && neededRate > 0 && (
        <div style={{ marginBottom:10, padding:'6px 8px', background: speedOk ? '#f6ffed' : '#fff7e6', borderRadius:6, border:`1px solid ${speedOk ? '#b7eb8f' : '#ffd591'}` }}>
          <div style={{ fontSize:11, color:'#8c8c8c', marginBottom:2 }}>⚡ 速度监控</div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11 }}>
            <span>当前 <b style={{ color: progressColor }}>{pred.dailyRate}</b> 件/天</span>
            <span style={{ color:'#8c8c8c' }}>需要 <b style={{ color: speedOk ? '#52c41a' : '#ff4d4f' }}>{neededRate}</b> 件/天</span>
          </div>
        </div>
      )}

      {/* 数据行 */}
      {[
        { icon:'📅', label:'预计完成', value: pred.estimatedDate ? fmtDate(pred.estimatedDate) : '—', hl: pred.risk === 'danger' },
        { icon:'⏱',  label:'还需天数', value: pred.daysNeeded >= 0 ? `${pred.daysNeeded} 天` : '—' },
        { icon:'📦',  label:'剩余件数', value: `${pred.remainingQty} 件` },
        { icon:'🎯',  label:'交期余量', value: fmtBuffer(pred.bufferDays), hl: pred.bufferDays !== null && pred.bufferDays < 0, pos: pred.bufferDays !== null && pred.bufferDays >= 5 },
        { icon:'📆',  label:'已生产',   value: `${pred.elapsedDays} 天` },
      ].map(({ icon, label, value, hl, pos }) => (
        <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:7 }}>
          <span style={{ fontSize:12, color:'#8c8c8c' }}>
            <span style={{ marginRight:5 }}>{icon}</span>{label}
          </span>
          <span style={{ fontSize:12, fontWeight:700, color: hl ? '#ff4d4f' : pos ? '#52c41a' : '#262626' }}>
            {value}
          </span>
        </div>
      ))}
    </div>
  );
};

// ─── 子组件：联系操作 Tab ──────────────────────────────────────────────────
const ContactActions: React.FC<{
  order: ProductionOrder;
  onViewDetail: (o: ProductionOrder) => void;
  onScan?: (o: ProductionOrder) => void;
}> = ({ order, onViewDetail, onScan }) => (
  <div>
    {/* 生产备注 */}
    {order.operationRemark && (
      <div style={{ background:'#fffbe6', border:'1px solid #ffe58f', borderRadius:6, padding:'6px 8px', marginBottom:8, fontSize:11, color:'#595959', lineHeight:1.5 }}>
        📋 {order.operationRemark}
      </div>
    )}

    {/* 工厂联系人 + 电话 */}
    {(order.factoryContactPhone || order.factoryContactPerson) && (
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8, padding:'6px 8px', background:'#f8f9fa', borderRadius:6 }}>
        <UserOutlined style={{ color:'#8c8c8c', fontSize:12 }} />
        <span style={{ fontSize:11, color:'#595959', flex:1 }}>
          {order.factoryContactPerson || order.factoryName}
        </span>
        {order.factoryContactPhone && (
          <a
            href={`tel:${order.factoryContactPhone}`}
            style={{ fontSize:11, color:'#1677ff', textDecoration:'none', display:'flex', alignItems:'center', gap:4 }}
            onClick={e => e.stopPropagation()}
          >
            <PhoneOutlined />
            {order.factoryContactPhone}
          </a>
        )}
      </div>
    )}

    {/* 跟单员 */}
    {order.merchandiser && (
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8, fontSize:11, color:'#595959' }}>
        <TeamOutlined style={{ color:'#8c8c8c' }} />
        <span>跟单：{order.merchandiser}</span>
        {order.company && <span style={{ color:'#8c8c8c' }}>· {order.company}</span>}
      </div>
    )}

    {/* 标签行 */}
    <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:10 }}>
      {order.urgencyLevel === 'urgent' && (
        <Tag color="red" style={{ fontSize:10, margin:0, lineHeight:'18px' }}>🔥 急单</Tag>
      )}
      {order.plateType === 'FIRST' && (
        <Tag color="blue" style={{ fontSize:10, margin:0, lineHeight:'18px' }}>首单</Tag>
      )}
      {order.plateType === 'REORDER' && (
        <Tag color="cyan" style={{ fontSize:10, margin:0, lineHeight:'18px' }}>翻单</Tag>
      )}
      {order.productCategory && (
        <Tag style={{ fontSize:10, margin:0, lineHeight:'18px', background:'#f5f5f5', border:'1px solid #d9d9d9', color:'#595959' }}>
          {order.productCategory}
        </Tag>
      )}
    </div>

    {/* 快捷操作按钮 */}
    <div style={{ display:'flex', gap:6 }}>
      <Button size="small" type="primary" style={{ flex:1, fontSize:11 }}
        onClick={e => { e.stopPropagation(); onViewDetail(order); }}>
        查看详情
      </Button>
      {onScan && (
        <Button size="small" type="default" style={{ flex:1, fontSize:11 }}
          onClick={e => { e.stopPropagation(); onScan(order); }}>
          立即扫码
        </Button>
      )}
    </div>
  </div>
);

// ─── 主组件 ────────────────────────────────────────────────────────────────
const OrderProgressCard: React.FC<OrderProgressCardProps> = ({
  order,
  onViewDetail,
  onScan,
  onRollback,
  onQuickEdit,
}) => {
  const [hovered, setHovered]     = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('process');
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const statusCfg = STATUS_CONFIG[order.status] || { text: order.status, color:'#8c8c8c', bg:'#f5f5f5' };

  const pred = calcSmartPrediction({
    orderQuantity:      order.orderQuantity,
    completedQuantity:  order.completedQuantity || 0,
    productionProgress: order.productionProgress || 0,
    createTime:         order.createTime,
    plannedEndDate:     order.plannedEndDate,
    status:             order.status,
  });

  const riskCfg     = RISK_CONFIG[pred.risk];
  const progress    = Math.min(100, Math.max(0, order.productionProgress || 0));
  const progressColor =
    pred.risk === 'danger'    ? '#ff4d4f' :
    pred.risk === 'warning'   ? '#fa8c16' :
    pred.risk === 'completed' ? '#52c41a' : '#1677ff';

  const handleMouseEnter = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovered(true), 120);
  };
  const handleMouseLeave = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovered(false), 200);
  };

  return (
    <div
      style={{ position:'relative', marginBottom:12 }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* ── 主卡片 ── */}
      <div
        onClick={() => onViewDetail(order)}
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: '14px 16px',
          cursor: 'pointer',
          border: `1.5px solid ${hovered ? progressColor + '55' : '#f0f0f0'}`,
          boxShadow: hovered
            ? `0 6px 24px rgba(0,0,0,0.10),0 2px 8px ${progressColor}22`
            : '0 1px 4px rgba(0,0,0,0.06)',
          transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
          transition: 'all 0.22s cubic-bezier(.4,0,.2,1)',
          display: 'flex',
          gap: 14,
        }}
      >
        {/* 图片 */}
        <div style={{ flexShrink:0 }}>
          <StyleCoverThumb styleNo={order.styleNo} src={order.styleCover} size={76} borderRadius={8} />
        </div>

        {/* 主信息 */}
        <div style={{ flex:1, minWidth:0 }}>
          {/* 标题行 */}
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, flexWrap:'wrap' }}>
            <span style={{ fontSize:15, fontWeight:700, color:'#1a1a1a', letterSpacing:0.3 }}>
              {order.orderNo}
            </span>
            <span style={{
              fontSize:11, fontWeight:600, padding:'1px 8px', borderRadius:20,
              color: statusCfg.color, background: statusCfg.bg, border:`1px solid ${statusCfg.color}33`,
            }}>
              {statusCfg.text}
            </span>
            {order.urgencyLevel === 'urgent' && (
              <Tag color="red" style={{ fontSize:10, margin:0, lineHeight:'18px' }}>急</Tag>
            )}
            {(pred.risk !== 'unknown' && pred.risk !== 'completed') && (
              <Tooltip title={pred.riskLabel}>
                <span style={{ fontSize:11, padding:'1px 7px', borderRadius:20, cursor:'default', color: riskCfg.color, background: riskCfg.bg }}>
                  {riskCfg.icon} {riskCfg.label}
                </span>
              </Tooltip>
            )}
          </div>

          {/* 数据格 */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'4px 0', fontSize:12, color:'#595959', marginBottom:10 }}>
            {[
              ['款号', order.styleNo],
              ['款名', order.styleName || '-'],
              ['工厂', order.factoryName || '-'],
              ['交期', order.plannedEndDate ? String(order.plannedEndDate).slice(0,10) : '-'],
              ['总量', String(order.orderQuantity)],
              ['完成', String(order.completedQuantity || 0)],
              ['入库', String(order.warehousingQualifiedQuantity || 0)],
              ['速度', pred.dailyRate > 0 ? `${pred.dailyRate}件/天` : '-'],
            ].map(([k, v]) => (
              <div key={k}><span style={{ color:'#8c8c8c' }}>{k}：</span><span style={{ fontWeight:500 }}>{v}</span></div>
            ))}
          </div>

          {/* 进度条 */}
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
              <span style={{ fontSize:11, color:'#8c8c8c' }}>
                <ClockCircleOutlined style={{ marginRight:4 }} />
                {pred.estimatedDate ? `预计 ${fmtDate(pred.estimatedDate)} 完成` : '生产进度'}
              </span>
              <span style={{ fontSize:12, fontWeight:700, color: progressColor }}>{progress}%</span>
            </div>
            <div style={{ height:6, borderRadius:99, background:'#f0f0f0', overflow:'hidden' }}>
              <div style={{
                height:'100%', width:`${progress}%`,
                background: `linear-gradient(90deg,${progressColor}99,${progressColor})`,
                borderRadius:99, transition:'width 0.6s ease', position:'relative',
              }}>
                <div style={{ position:'absolute', top:0, left:0, right:0, height:'50%', background:'rgba(255,255,255,0.3)', borderRadius:99 }} />
              </div>
            </div>
          </div>
        </div>

        {/* 右侧操作 */}
        <div style={{ display:'flex', flexDirection:'column', gap:6, justifyContent:'center', flexShrink:0, opacity: hovered ? 1 : 0.6, transition:'opacity 0.2s' }}>
          <Button size="small" type="primary" ghost onClick={e => { e.stopPropagation(); onViewDetail(order); }}>详情</Button>
          {onScan     && <Button size="small" onClick={e => { e.stopPropagation(); onScan(order); }}>扫码</Button>}
          {onRollback && <Button size="small" danger ghost onClick={e => { e.stopPropagation(); onRollback(order); }}>回退</Button>}
          {onQuickEdit && <Button size="small" onClick={e => { e.stopPropagation(); onQuickEdit(order); }}>编辑</Button>}
        </div>
      </div>

      {/* ── 悬停面板 ── */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: hovered ? -258 : -240,
          width: 242,
          background: '#fff',
          borderRadius: 12,
          padding: '0',
          boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
          border: `1.5px solid ${progressColor}33`,
          opacity: hovered ? 1 : 0,
          pointerEvents: hovered ? 'auto' : 'none',
          transition: 'opacity 0.2s ease,right 0.22s cubic-bezier(.4,0,.2,1)',
          zIndex: 100,
          overflow: 'hidden',
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Tab 头 */}
        <div style={{ display:'flex', borderBottom:`1px solid #f0f0f0` }}>
          {TABS.map(tab => (
            <div
              key={tab.key}
              onClick={e => { e.stopPropagation(); setActiveTab(tab.key as TabKey); }}
              style={{
                flex: 1, textAlign:'center', padding:'8px 0', fontSize:11.5, cursor:'pointer',
                fontWeight: activeTab === tab.key ? 700 : 400,
                color: activeTab === tab.key ? progressColor : '#8c8c8c',
                borderBottom: activeTab === tab.key ? `2px solid ${progressColor}` : '2px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </div>
          ))}
        </div>

        {/* Tab 内容 */}
        <div style={{ padding:'12px 14px', maxHeight:320, overflowY:'auto' }}>
          {activeTab === 'process' && (
            <ProcessRadar order={order} progressColor={progressColor} />
          )}
          {activeTab === 'predict' && (
            <SmartPredict order={order} progressColor={progressColor} />
          )}
          {activeTab === 'contact' && (
            <ContactActions order={order} onViewDetail={onViewDetail} onScan={onScan} />
          )}
        </div>

        {/* 底部提示 */}
        <div
          style={{ borderTop:'1px solid #f5f5f5', padding:'7px 14px', display:'flex', alignItems:'center', justifyContent:'center', gap:4, fontSize:11, color:'#1677ff', cursor:'pointer' }}
          onClick={() => onViewDetail(order)}
        >
          查看完整进度 <RightOutlined style={{ fontSize:10 }} />
        </div>
      </div>
    </div>
  );
};

export default OrderProgressCard;
