import React from 'react';
import { Popover } from 'antd';
import CollapseChevron from '../CollapseChevron';
import {
  grade2color, LiveDot, Sparkline, AnimatedNum,
} from './IntelligenceWidgets';

const KpiCardRow: React.FC<any> = ({
  kpiFlash, collapsedPanels, toggleCollapse, rootRef,
  scanPop, factoryPop, healthPop, stagnantPop, shortagePop, notifyPop,
  currentKpiMetrics, pulse, health, healing, shortage, notify,
  kpiDelta, formatDeltaText, renderDeltaBadge, getKpiTrend,
}) => {
  return (
    <>
        {/* ╔══════════════════════════════════════════════╗
            ║   第一行：6 大核心 KPI 闪光数字卡            ║
            ╚══════════════════════════════════════════════╝ */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 20px 4px', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleCollapse('kpiRow6')}>
          <span style={{ color: '#5a7a9a', fontSize: 11 }}>核心 KPI 指标</span>
          <CollapseChevron panelKey="kpiRow6" collapsed={!!collapsedPanels['kpiRow6']} />
        </div>
        <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['kpiRow6'] ? 0 : 420, transition: 'max-height 0.28s ease' }}>
        <div className={`cockpit-grid-6${kpiFlash ? ' kpi-flash' : ''}`}>

          {/* 今日生产扫码量 */}
          <Popover overlayClassName="cockpit-kpi-pop" placement="bottom" content={scanPop} mouseEnterDelay={0.15} mouseLeaveDelay={0.1} getPopupContainer={() => rootRef.current || document.body}>
          <div className="c-card c-kpi c-kpi-hoverable">
            <div className="c-kpi-label"><LiveDot size={7} />今日生产扫码量</div>
            <div className="c-kpi-val cyan neon-cyan"><AnimatedNum val={pulse?.todayScanQty?.toLocaleString() ?? '—'} /></div>
            <div className="c-kpi-unit">件</div>
            <div className="c-kpi-sub">速率&nbsp;<b style={{ color: '#00e5ff' }}><AnimatedNum val={pulse?.scanRatePerHour ?? '—'} /></b>&nbsp;件/时</div>
            <div className="c-kpi-delta-row">
              {renderDeltaBadge(kpiDelta.todayScanQty, { flatText: '本轮无新增', suffix: '件' })}
              <span className="c-kpi-delta-note">速率 {formatDeltaText(kpiDelta.scanRatePerHour, '/h')}</span>
            </div>
            <div className="c-kpi-history-wrap">
              <Sparkline pts={getKpiTrend('todayScanQty')} color="#00e5ff" width={88} height={22} />
              <span className="c-kpi-history-label">5分钟趋势</span>
            </div>
            <div className="c-kpi-hover-hint">悬停查看详情 ↑</div>
          </div>
          </Popover>

          {/* 活跃工厂 */}
          <Popover overlayClassName="cockpit-kpi-pop" placement="bottom" content={factoryPop} mouseEnterDelay={0.15} mouseLeaveDelay={0.1} getPopupContainer={() => rootRef.current || document.body}>
          <div className={`c-card c-kpi c-kpi-hoverable ${currentKpiMetrics.activeFactories === 0 && currentKpiMetrics.productionOrderCount > 0 ? 'c-kpi-danger' : ''}`}>
            <div className="c-kpi-label">
              <LiveDot size={7} color={currentKpiMetrics.activeFactories === 0 && currentKpiMetrics.productionOrderCount > 0 ? '#e03030' : undefined} />
              活跃工厂
            </div>
            <div className="c-kpi-val" style={currentKpiMetrics.activeFactories === 0 && currentKpiMetrics.productionOrderCount > 0 ? { color: '#e03030' } : { color: '#39ff14' }}>
              <AnimatedNum val={pulse?.activeFactories ?? '—'} />
            </div>
            <div className="c-kpi-unit">家</div>
            <div className="c-kpi-sub">
              {currentKpiMetrics.activeFactories === 0 && currentKpiMetrics.productionOrderCount > 0
                ? <span style={{ color: '#e03030' }}> 全部离线·{currentKpiMetrics.productionOrderCount}单生产中</span>
                : <>员工&nbsp;<b style={{ color: '#39ff14' }}><AnimatedNum val={pulse?.activeWorkers ?? '—'} /></b>&nbsp;人在线</>}
            </div>
            <div className="c-kpi-delta-row">
              {currentKpiMetrics.activeFactories === 0 && currentKpiMetrics.productionOrderCount > 0
                ? <span className="c-kpi-delta down">生产停滞</span>
                : renderDeltaBadge(kpiDelta.activeFactories, { flatText: '工厂稳定', suffix: '家' })}
              <span className="c-kpi-delta-note">员工 {formatDeltaText(kpiDelta.activeWorkers, '人')}</span>
            </div>
            <div className="c-kpi-history-wrap">
              <Sparkline pts={getKpiTrend('activeFactories')} color="#39ff14" width={88} height={22} />
              <span className="c-kpi-history-label">5分钟趋势</span>
            </div>
            <div className="c-kpi-hover-hint">悬停查看详情 ↑</div>
          </div>
          </Popover>

          {/* 供应链健康 */}
          <Popover overlayClassName="cockpit-kpi-pop" placement="bottom" content={healthPop} mouseEnterDelay={0.15} mouseLeaveDelay={0.1} getPopupContainer={() => rootRef.current || document.body}>
          <div className="c-card c-kpi c-kpi-hoverable">
            <div className="c-kpi-label"><LiveDot size={7} color={grade2color(health?.grade ?? '')} />供应链健康</div>
            <div className="c-kpi-val" style={{ color: grade2color(health?.grade ?? ''), textShadow: `0 0 18px ${grade2color(health?.grade ?? '')}88` }}>
              <AnimatedNum val={health?.healthIndex ?? '—'} />
            </div>
            <div className="c-kpi-unit">分</div>
            <div className="c-kpi-sub">等级&nbsp;<b style={{ color: grade2color(health?.grade ?? '') }}>{health?.grade ?? '—'}&nbsp;级</b></div>
            <div className="c-kpi-delta-row">
              {renderDeltaBadge(kpiDelta.healthIndex, { flatText: '健康稳定', suffix: '分' })}
              <span className="c-kpi-delta-note">异常 {formatDeltaText(-(Number(healing?.issuesFound) || 0), '项基线')}</span>
            </div>
            <div className="c-kpi-history-wrap">
              <Sparkline pts={getKpiTrend('healthIndex')} color={grade2color(health?.grade ?? '') || '#39ff14'} width={88} height={22} />
              <span className="c-kpi-history-label">5分钟趋势</span>
            </div>
            <div className="c-kpi-hover-hint">悬停查看详情 ↑</div>
          </div>
          </Popover>

          {/* 停工预警 */}
          <Popover overlayClassName="cockpit-kpi-pop" placement="bottom" content={stagnantPop} mouseEnterDelay={0.15} mouseLeaveDelay={0.1} getPopupContainer={() => rootRef.current || document.body}>
          <div className={`c-card c-kpi c-kpi-hoverable ${(pulse?.stagnantFactories?.length ?? 0) > 0 ? 'c-kpi-danger' : ''}`}>
            <div className="c-kpi-label">
              <LiveDot size={7} color={(pulse?.stagnantFactories?.length ?? 0) > 0 ? '#e03030' : '#39ff14'} />
              停工预警
            </div>
            <div className="c-kpi-val" style={{ color: (pulse?.stagnantFactories?.length ?? 0) > 0 ? '#e03030' : '#39ff14' }}>
              <AnimatedNum val={pulse?.stagnantFactories?.length ?? 0} />
            </div>
            <div className="c-kpi-unit">家停滞</div>
            <div className="c-kpi-sub">
              {(pulse?.stagnantFactories?.length ?? 0) > 0
                ? <span className="blink-text"> 需立即处理</span>
                : currentKpiMetrics.activeFactories === 0 && currentKpiMetrics.productionOrderCount > 0
                  ? <span style={{ color: '#f7a600' }}> 无工厂活跃·生产停滞</span>
                  : '生产运转正常'}
            </div>
            <div className="c-kpi-delta-row">
              {currentKpiMetrics.activeFactories === 0 && currentKpiMetrics.productionOrderCount > 0
                ? <span className="c-kpi-delta down">生产异常</span>
                : renderDeltaBadge(kpiDelta.stagnantFactories, { flatText: '无新增停滞', suffix: '家' })}
              <span className="c-kpi-delta-note">异常越少越好</span>
            </div>
            <div className="c-kpi-history-wrap">
              <Sparkline pts={getKpiTrend('stagnantFactories')} color="#ff6b6b" width={88} height={22} />
              <span className="c-kpi-history-label">5分钟趋势</span>
            </div>
            <div className="c-kpi-hover-hint">悬停查看详情 ↑</div>
          </div>
          </Popover>

          {/* 面料缺口 */}
          <Popover overlayClassName="cockpit-kpi-pop" placement="bottom" content={shortagePop} mouseEnterDelay={0.15} mouseLeaveDelay={0.1} getPopupContainer={() => rootRef.current || document.body}>
          <div className={`c-card c-kpi c-kpi-hoverable ${(shortage?.shortageItems?.length ?? 0) > 0 ? 'c-kpi-warn' : ''}`}>
            <div className="c-kpi-label">
              <LiveDot size={7} color={(shortage?.shortageItems?.length ?? 0) > 0 ? '#f7a600' : '#39ff14'} />
              面料缺口
            </div>
            <div className="c-kpi-val" style={{ color: (shortage?.shortageItems?.length ?? 0) > 0 ? '#f7a600' : '#39ff14' }}>
              <AnimatedNum val={shortage?.shortageItems?.length ?? 0} />
            </div>
            <div className="c-kpi-unit">项缺料</div>
            <div className="c-kpi-sub">
              {(shortage?.shortageItems?.length ?? 0) > 0
                ? <span style={{ color: '#f7a600' }}> 请及时补单</span>
                : '库存储备充足'}
            </div>
            <div className="c-kpi-delta-row">
              {renderDeltaBadge(kpiDelta.shortageItems, { flatText: '缺口未变', suffix: '项' })}
              <span className="c-kpi-delta-note">补单越快越稳</span>
            </div>
            <div className="c-kpi-history-wrap">
              <Sparkline pts={getKpiTrend('shortageItems')} color="#f7a600" width={88} height={22} />
              <span className="c-kpi-history-label">5分钟趋势</span>
            </div>
            <div className="c-kpi-hover-hint">悬停查看详情 ↑</div>
          </div>
          </Popover>

          {/* 待处理通知 */}
          <Popover overlayClassName="cockpit-kpi-pop" placement="bottom" content={notifyPop} mouseEnterDelay={0.15} mouseLeaveDelay={0.1} getPopupContainer={() => rootRef.current || document.body}>
          <div className="c-card c-kpi c-kpi-hoverable">
            <div className="c-kpi-label"><LiveDot size={7} color="#7c4dff" />待处理通知</div>
            <div className="c-kpi-val purple"><AnimatedNum val={notify?.pendingCount ?? '—'} /></div>
            <div className="c-kpi-unit">条待发</div>
            <div className="c-kpi-sub">今日已发&nbsp;<b style={{ color: '#7c4dff' }}><AnimatedNum val={notify?.sentToday ?? 0} /></b>&nbsp;条</div>
            <div className="c-kpi-delta-row">
              {renderDeltaBadge(kpiDelta.pendingNotify, { flatText: '待发稳定', suffix: '条' })}
              <span className="c-kpi-delta-note">已发 {formatDeltaText(kpiDelta.sentToday, '条')}</span>
            </div>
            <div className="c-kpi-history-wrap">
              <Sparkline pts={getKpiTrend('pendingNotify')} color="#a78bfa" width={88} height={22} />
              <span className="c-kpi-history-label">5分钟趋势</span>
            </div>
            <div className="c-kpi-hover-hint">悬停查看详情 ↑</div>
          </div>
          </Popover>

        </div>
        </div>{/* /kpiRow6-collapsible */}
    </>
  );
};

export default KpiCardRow;
