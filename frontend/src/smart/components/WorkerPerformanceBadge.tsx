import React, { useRef, useState } from 'react';
import { Popover, Spin } from 'antd';
import api from '../../utils/api';

// ── 类型定义 ─────────────────────────────────────────────────────────────

interface StageProfile {
  stageName: string;
  avgPerDay: number;
  totalQty: number;
  activeDays: number;
  vsFactoryAvgPct: number;
  level: 'excellent' | 'good' | 'normal' | 'below';
}

interface WorkerProfile {
  operatorName: string;
  stages: StageProfile[];
  totalQty: number;
  lastScanTime: string | null;
  dateDays: number;
}

interface Props {
  operatorName: string;
}

function normalizeProfile(raw: any, fallbackName: string): WorkerProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const stages = Array.isArray(raw.stages) ? raw.stages : [];
  return {
    operatorName: String(raw.operatorName || fallbackName || ''),
    stages,
    totalQty: Number(raw.totalQty) || 0,
    lastScanTime: raw.lastScanTime ? String(raw.lastScanTime) : null,
    dateDays: Number(raw.dateDays) || 30,
  };
}

// ── 全局缓存（模块级，跨组件实例共享，避免重复请求） ────────────────────
const profileCache = new Map<string, WorkerProfile | null>();
const pendingMap  = new Map<string, Promise<WorkerProfile | null>>();

async function fetchProfile(name: string): Promise<WorkerProfile | null> {
  if (profileCache.has(name)) {
    return profileCache.get(name)!;
  }
  if (pendingMap.has(name)) {
    return pendingMap.get(name)!;
  }
  const p = api
    .post<WorkerProfile>('/intelligence/worker-profile', { operatorName: name })
    .then((data: WorkerProfile) => {
      const safe = normalizeProfile(data, name);
      profileCache.set(name, safe);
      pendingMap.delete(name);
      return safe;
    })
    .catch(() => {
      profileCache.set(name, null);
      pendingMap.delete(name);
      return null;
    });
  pendingMap.set(name, p);
  return p;
}

// ── 徽标图标 ────────────────────────────────────────────────────────────

function LevelDot({ level }: { level?: string }) {
  if (level === 'excellent') {
    return <span style={{ fontSize: 12, lineHeight: 1, cursor: 'pointer' }}>⚡</span>;
  }
  if (level === 'good') {
    return (
      <span
        style={{
          display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
          background: '#52c41a', cursor: 'pointer', flexShrink: 0,
        }}
      />
    );
  }
  if (level === 'below') {
    return (
      <span
        style={{
          display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
          background: '#ff4d4f', cursor: 'pointer', flexShrink: 0,
        }}
      />
    );
  }
  // normal / 未加载：灰色小点（始终可见，确保用户能 hover）
  return (
    <span
      style={{
        display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
        background: '#d9d9d9', cursor: 'pointer', flexShrink: 0,
      }}
    />
  );
}

// ── 工序行 ──────────────────────────────────────────────────────────────

function StageRow({ sp }: { sp: StageProfile }) {
  const diff = sp.vsFactoryAvgPct;
  const sign  = diff >= 0 ? '+' : '';
  const color = diff >= 0 ? '#52c41a' : '#faad14';
  const arrow = diff >= 0 ? '▲' : '▼';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12,
                  fontSize: 13, padding: '3px 0', borderBottom: '1px solid #f0f0f0' }}>
      <span style={{ color: '#333', minWidth: 48 }}>{sp.stageName}</span>
      <span style={{ color: '#555' }}>{sp.avgPerDay.toFixed(1)} 件/天</span>
      <span style={{ color, fontSize: 12 }}>
        {arrow} {diff !== 0 ? `${sign}${diff.toFixed(1)}%` : '均值'}
      </span>
    </div>
  );
}

// ── Popover 内容 ─────────────────────────────────────────────────────────

function ProfileContent({ profile }: { profile: WorkerProfile }) {
  const stages = Array.isArray(profile.stages) ? profile.stages : [];
  const lastDate = profile.lastScanTime
    ? profile.lastScanTime.slice(5, 10).replace('-', '月') + '日'
    : '—';

  const topLevel = stages.length > 0
    ? stages.reduce((best, s) => {
        const order = ['excellent', 'good', 'normal', 'below'] as const;
        return order.indexOf(s.level as typeof order[number]) <
               order.indexOf(best.level as typeof order[number]) ? s : best;
      }, stages[0]).level
    : 'normal';

  return (
    <div style={{ minWidth: 220, maxWidth: 280 }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>{profile.operatorName}</span>
        <LevelDot level={topLevel} />
      </div>

      {stages.length === 0 ? (
        <div style={{ color: '#999', fontSize: 13 }}>
          {lastDate !== '—' ? '近期无扫码活动' : '暂无扫码历史'}
        </div>
      ) : (
        <div>
          {stages.slice(0, 5).map(sp => (
            <StageRow key={sp.stageName} sp={sp} />
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>
        {stages.length > 0 ? `近${profile.dateDays}天 · ` : ''}最近扫码：{lastDate}
      </div>
    </div>
  );
}

// ── 主组件 ──────────────────────────────────────────────────────────────

const WorkerPerformanceBadge: React.FC<Props> = ({ operatorName }) => {
  const [profile, setProfile] = useState<WorkerProfile | null | 'loading'>(null);
  const loadedRef = useRef(false);

  if (!operatorName) return null;

  const handleOpen = (open: boolean) => {
    if (open && !loadedRef.current) {
      loadedRef.current = true;
      setProfile('loading');
      fetchProfile(operatorName).then(data => setProfile(data));
    }
  };

  // 决定当前徽标颜色（数据未加载时显示灰点，加载完成后变色）
  const topLevel = (() => {
    if (!profile || profile === 'loading') return undefined; // → 灰点
    if (!profile.stages || profile.stages.length === 0) return undefined;
    const order = ['excellent', 'good', 'normal', 'below'] as const;
    return profile.stages.reduce((best, s) => {
      return order.indexOf(s.level as typeof order[number]) <
             order.indexOf(best.level as typeof order[number]) ? s : best;
    }, profile.stages[0]).level;
  })();

  return (
    <Popover
      content={
        profile === 'loading' ? (
          <div style={{ padding: '8px 12px' }}>
            <Spin size="small" />
          </div>
        ) : profile === null ? (
          <div style={{ padding: '8px 12px', color: '#999', fontSize: 12 }}>
            暂无绩效画像
          </div>
        ) : (
          <ProfileContent profile={profile} />
        )
      }
      title={null}
      trigger="hover"
      mouseEnterDelay={0.3}
      onOpenChange={handleOpen}
      placement="right"
    >
      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
        <LevelDot level={topLevel ?? 'normal'} />
      </span>
    </Popover>
  );
};

export default WorkerPerformanceBadge;
