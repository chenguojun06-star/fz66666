import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Tag } from 'antd';
import { RobotOutlined, ThunderboltOutlined, WarningOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { intelligenceApi } from '../../../../../services/intelligence/intelligenceApi';
import './AgentActivityPanel.css';

type AgentInfo = {
  id: string; name: string; department: string; color: string; description: string;
  status: string; lastActivity: string | null; tasksToday: number; successRate: number;
  avgDurationMs: number; intelligenceScore: number; lazinessScore: number;
  currentTask: string | null; position: { x: number; y: number };
};
type AlertInfo = { id: number; type: string; level: string; title: string; time: string | null };

const PX = 3;
const CW = 420;
const CH = 280;

const STATUS_LABEL: Record<string, string> = {
  working: '工作中', idle_recent: '刚空闲', idle: '空闲', sleeping: '休眠', unknown: '未知',
};

const DEPT_INFO: Record<string, { label: string; icon: string; roofColor: string; wallColor: string; floorColor: string }> = {
  production: { label: '生产管理部', icon: '🏭', roofColor: '#5a9e5a', wallColor: '#3d7a3d', floorColor: '#2a5a2a' },
  finance: { label: '财务管理部', icon: '💰', roofColor: '#c45aaa', wallColor: '#8a3d6a', floorColor: '#6a2a4a' },
  warehouse: { label: '仓储管理部', icon: '📦', roofColor: '#b89044', wallColor: '#7a5a2a', floorColor: '#5a4020' },
  basic: { label: '基础业务部', icon: '✂️', roofColor: '#44b8b8', wallColor: '#2a7a7a', floorColor: '#1a5a5a' },
  intelligence: { label: '智能运营中心', icon: '☁️', roofColor: '#6678dd', wallColor: '#3d4a8a', floorColor: '#2a346a' },
};

interface BuildingDef {
  key: string; bx: number; by: number; bw: number; bh: number;
}
const BUILDINGS: BuildingDef[] = [
  { key: 'production', bx: 8, by: 10, bw: 120, bh: 80 },
  { key: 'finance', bx: 292, by: 10, bw: 120, bh: 80 },
  { key: 'warehouse', bx: 8, by: 190, bw: 120, bh: 80 },
  { key: 'basic', bx: 292, by: 190, bw: 120, bh: 80 },
  { key: 'intelligence', bx: 140, by: 80, bw: 140, bh: 120 },
];

interface WorkstationDef {
  agentId: string; wx: number; wy: number; dept: string;
}

const WORKSTATIONS: WorkstationDef[] = [
  { agentId: 'order-manager', dept: 'production', wx: 25, wy: 42 },
  { agentId: 'material-buyer', dept: 'production', wx: 55, wy: 42 },
  { agentId: 'quality-inspector', dept: 'production', wx: 85, wy: 42 },
  { agentId: 'production-scheduler', dept: 'production', wx: 110, wy: 42 },
  { agentId: 'finance-settler', dept: 'finance', wx: 310, wy: 42 },
  { agentId: 'warehouse-keeper', dept: 'warehouse', wx: 25, wy: 222 },
  { agentId: 'inventory-manager', dept: 'warehouse', wx: 55, wy: 222 },
  { agentId: 'style-designer', dept: 'basic', wx: 310, wy: 222 },
  { agentId: 'data-analyst', dept: 'intelligence', wx: 160, wy: 115 },
  { agentId: 'risk-sentinel', dept: 'intelligence', wx: 190, wy: 115 },
  { agentId: 'smart-advisor', dept: 'intelligence', wx: 220, wy: 115 },
  { agentId: 'learning-engine', dept: 'intelligence', wx: 250, wy: 115 },
  { agentId: 'system-doctor', dept: 'intelligence', wx: 160, wy: 165 },
];

const IDLE_HUB_SEATS: Record<string, { sx: number; sy: number }> = {
  'order-manager': { sx: 155, sy: 130 },
  'material-buyer': { sx: 175, sy: 130 },
  'quality-inspector': { sx: 195, sy: 130 },
  'production-scheduler': { sx: 215, sy: 130 },
  'finance-settler': { sx: 235, sy: 130 },
  'warehouse-keeper': { sx: 255, sy: 130 },
  'inventory-manager': { sx: 275, sy: 130 },
  'style-designer': { sx: 155, sy: 170 },
  'data-analyst': { sx: 175, sy: 170 },
  'risk-sentinel': { sx: 195, sy: 170 },
  'smart-advisor': { sx: 215, sy: 170 },
  'learning-engine': { sx: 235, sy: 170 },
  'system-doctor': { sx: 255, sy: 170 },
};

interface AgentSprite {
  info: AgentInfo;
  x: number; y: number;
  targetX: number; targetY: number;
  facing: 'left' | 'right';
  state: 'walking' | 'sitting' | 'working' | 'sleeping';
  walkFrame: number;
  bubbleText: string | null;
  bubbleTimer: number;
}

function darken(hex: string, f: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`;
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x * PX, y * PX, w * PX, h * PX);
}

function drawSky(ctx: CanvasRenderingContext2D, tick: number) {
  for (let y = 0; y < 8; y++) {
    const t = y / 8;
    ctx.fillStyle = `rgb(${Math.round(15 + t * 12)},${Math.round(15 + t * 18)},${Math.round(40 + t * 25)})`;
    ctx.fillRect(0, y * PX, CW * PX, PX);
  }
  const stars = [[30, 2], [80, 4], [140, 1], [200, 3], [260, 5], [320, 2], [380, 4], [50, 6], [170, 5], [350, 1], [400, 3]];
  for (const [sx, sy] of stars) {
    const twinkle = Math.sin(tick * 0.04 + sx) > 0.3;
    ctx.fillStyle = twinkle ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)';
    ctx.fillRect(sx * PX, sy * PX, PX, PX);
  }
  const moonX = 390, moonY = 3;
  px(ctx, moonX, moonY, 3, 3, '#ffeebb');
  px(ctx, moonX + 1, moonY - 1, 1, 1, '#ffeebb');
  px(ctx, moonX + 1, moonY + 3, 1, 1, '#ffeebb');
  px(ctx, moonX - 1, moonY + 1, 1, 1, '#ffeebb');
  ctx.fillStyle = 'rgba(255,238,187,0.08)';
  ctx.fillRect((moonX - 3) * PX, (moonY - 3) * PX, 9 * PX, 9 * PX);
}

function drawGround(ctx: CanvasRenderingContext2D) {
  for (let y = 8; y < CH; y++) {
    ctx.fillStyle = '#1a2a1a';
    ctx.fillRect(0, y * PX, CW * PX, PX);
  }
  const hPaths = [95, 185];
  for (const py of hPaths) {
    for (let x = 0; x < CW; x++) {
      ctx.fillStyle = '#3a3a2a';
      ctx.fillRect(x * PX, py * PX, PX, PX);
      if (x % 8 < 1) {
        ctx.fillStyle = '#4a4a3a';
        ctx.fillRect(x * PX, (py + 1) * PX, PX, PX);
      }
    }
  }
  const vPaths = [130, 285];
  for (const px2 of vPaths) {
    for (let y = 8; y < CH; y++) {
      ctx.fillStyle = '#3a3a2a';
      ctx.fillRect(px2 * PX, y * PX, PX, PX);
    }
  }
  for (let x = 0; x < CW; x += 6) {
    for (const py of hPaths) {
      if (x % 12 < 1) {
        ctx.fillStyle = '#5a5a4a';
        ctx.fillRect(x * PX, py * PX, PX, PX);
      }
    }
  }
}

function drawBuilding(ctx: CanvasRenderingContext2D, b: BuildingDef, agentCount: number, tick: number) {
  const info = DEPT_INFO[b.key];
  const { bx, by, bw, bh } = b;

  px(ctx, bx + bw - 12, by - 8, 5, 8, '#777');
  px(ctx, bx + bw - 11, by - 9, 3, 1, '#888');
  if (agentCount > 0) {
    const smokePhase = (tick * 0.06) % 6;
    for (let s = 0; s < 3; s++) {
      const sy = by - 10 - s * 3 - smokePhase;
      const sx = bx + bw - 10 + Math.sin(tick * 0.02 + s) * 1.5;
      const alpha = 0.25 - s * 0.07;
      ctx.fillStyle = `rgba(200,200,200,${alpha})`;
      ctx.fillRect(sx * PX, sy * PX, (2 + s) * PX, (2 + s) * PX);
    }
  }

  for (let i = 0; i < bw; i++) {
    const peakH = 8;
    const distFromCenter = Math.abs(i - bw / 2) / (bw / 2);
    const h = Math.max(1, Math.round(peakH * (1 - distFromCenter * 0.9)));
    px(ctx, bx + i, by - h, 1, h, info.roofColor);
  }
  px(ctx, bx - 1, by - 1, bw + 2, 2, darken(info.roofColor, 0.6));

  px(ctx, bx, by, bw, bh, info.wallColor);
  px(ctx, bx, by, bw, 1, darken(info.wallColor, 1.3));
  px(ctx, bx, by + bh - 1, bw, 1, darken(info.wallColor, 0.5));
  px(ctx, bx, by, 1, bh, darken(info.wallColor, 0.7));
  px(ctx, bx + bw - 1, by, 1, bh, darken(info.wallColor, 0.7));

  px(ctx, bx + 1, by + 1, bw - 2, bh - 2, info.floorColor);

  const windowRows = Math.max(1, Math.floor((bh - 24) / 20));
  const windowCols = Math.max(1, Math.floor((bw - 20) / 28));
  for (let row = 0; row < windowRows; row++) {
    for (let col = 0; col < windowCols; col++) {
      const wx = bx + 8 + col * 28;
      const wy = by + 6 + row * 20;
      const lit = agentCount > 0;
      px(ctx, wx, wy, 12, 10, lit ? '#ffee88' : '#1a2233');
      px(ctx, wx + 5, wy, 1, 10, lit ? '#ddcc66' : '#111a22');
      px(ctx, wx, wy + 4, 12, 1, lit ? '#ddcc66' : '#111a22');
      if (lit) {
        ctx.fillStyle = 'rgba(255,238,136,0.06)';
        ctx.fillRect((wx - 2) * PX, (wy - 2) * PX, 16 * PX, 14 * PX);
      }
    }
  }

  const doorX = bx + Math.floor(bw / 2) - 5;
  const doorY = by + bh - 16;
  px(ctx, doorX, doorY, 10, 16, '#553322');
  px(ctx, doorX + 1, doorY + 1, 8, 14, '#774433');
  px(ctx, doorX + 6, doorY + 7, 2, 2, '#ccaa44');
  px(ctx, doorX + 2, doorY + 1, 3, 6, 'rgba(255,238,136,0.15)');

  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = `bold ${4 * PX}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(info.icon, (bx + bw / 2) * PX, (by - 10) * PX);
  ctx.font = `bold ${2.5 * PX}px sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText(info.label, (bx + bw / 2) * PX, (by - 5) * PX);
}

function drawXiaoYun(ctx: CanvasRenderingContext2D, cx: number, cy: number, tick: number) {
  const bob = Math.round(Math.sin(tick * 0.04) * 1);
  const by = cy + bob;
  px(ctx, cx - 5, by, 11, 4, '#e8f4fd');
  px(ctx, cx - 7, by + 1, 15, 3, '#d4ecfa');
  px(ctx, cx - 6, by + 4, 13, 2, '#c0e0f4');
  px(ctx, cx - 3, by - 2, 7, 3, '#f0f8ff');
  px(ctx, cx - 1, by - 3, 4, 2, '#f0f8ff');
  px(ctx, cx - 5, by + 1, 2, 2, '#222');
  px(ctx, cx + 3, by + 1, 2, 2, '#222');
  px(ctx, cx - 4, by + 1, 1, 1, '#fff');
  px(ctx, cx + 4, by + 1, 1, 1, '#fff');
  px(ctx, cx - 1, by + 3, 3, 1, '#ff9999');
  const blink = Math.sin(tick * 0.05) > 0.95;
  if (blink) {
    px(ctx, cx - 5, by + 1, 2, 1, '#d4ecfa');
    px(ctx, cx + 3, by + 1, 2, 1, '#d4ecfa');
  }
}

function drawDesk(ctx: CanvasRenderingContext2D, x: number, y: number) {
  px(ctx, x - 3, y + 4, 8, 2, '#8B7355');
  px(ctx, x - 2, y + 3, 6, 1, '#a0a0b0');
  px(ctx, x - 3, y + 6, 1, 2, '#6B5335');
  px(ctx, x + 4, y + 6, 1, 2, '#6B5335');
}

function drawCharacter(ctx: CanvasRenderingContext2D, sprite: AgentSprite, tick: number) {
  const { x, y, facing, state, info, walkFrame } = sprite;
  const ix = Math.round(x);
  const iy = Math.round(y);
  const c = info.color;
  const dc = darken(c, 0.6);
  const skin = '#ffcc99';
  const hair = darken(c, 0.35);
  const flip = facing === 'left' ? -1 : 1;
  const bob = state === 'walking' ? Math.round(Math.sin(tick * 0.3 + walkFrame) * 1) : 0;
  const workBob = state === 'working' ? Math.round(Math.sin(tick * 0.15) * 0.5) : 0;
  const tb = bob + workBob;

  px(ctx, ix - 3, iy - 18 + tb, 7, 3, hair);
  px(ctx, ix - 2, iy - 19 + tb, 5, 1, hair);
  px(ctx, ix - 4, iy - 17 + tb, 1, 1, hair);
  px(ctx, ix + 3, iy - 17 + tb, 1, 1, hair);

  px(ctx, ix - 3, iy - 15 + tb, 7, 4, skin);
  px(ctx, ix + flip * 2, iy - 14 + tb, 1, 1, '#222');
  px(ctx, ix + flip * 2 - 1, iy - 14 + tb, 1, 1, '#222');
  px(ctx, ix - flip, iy - 13 + tb, 1, 1, 'rgba(255,130,130,0.5)');
  px(ctx, ix + flip * 2, iy - 12 + tb, 2, 1, '#cc8866');

  if (state === 'sleeping') {
    px(ctx, ix - 1, iy - 14 + tb, 1, 1, '#666');
    px(ctx, ix + 1, iy - 14 + tb, 1, 1, '#666');
  }

  px(ctx, ix - 3, iy - 11 + tb, 7, 6, c);
  px(ctx, ix - 2, iy - 10 + tb, 1, 1, darken(c, 1.2));
  px(ctx, ix + 2, iy - 10 + tb, 1, 1, darken(c, 1.2));

  if (state === 'working') {
    const armUp = Math.sin(tick * 0.2) > 0;
    if (armUp) {
      px(ctx, ix + 4, iy - 12 + tb, 1, 3, dc);
      px(ctx, ix + 4, iy - 13 + tb, 1, 1, skin);
    } else {
      px(ctx, ix + 4, iy - 10 + tb, 2, 1, dc);
      px(ctx, ix + 5, iy - 10 + tb, 1, 1, skin);
    }
    px(ctx, ix - 4, iy - 10 + tb, 1, 2, dc);
  } else {
    px(ctx, ix + 4, iy - 10 + tb, 1, 3, dc);
    px(ctx, ix - 4, iy - 10 + tb, 1, 3, dc);
  }

  if (state === 'walking') {
    const lf = Math.floor(tick / 4) % 4;
    const legOff = [0, -1, 0, 1][lf];
    px(ctx, ix - 2, iy - 5, 2, 4, dc);
    px(ctx, ix + 1, iy - 5 + legOff, 2, 4, dc);
    px(ctx, ix - 2, iy - 1 + Math.abs(legOff), 2, 1, '#333');
    px(ctx, ix + 1, iy - 1, 2, 1, '#333');
  } else if (state === 'sitting') {
    px(ctx, ix - 2, iy - 5, 2, 2, dc);
    px(ctx, ix + 1, iy - 5, 2, 2, dc);
    px(ctx, ix - 3, iy - 3, 7, 2, dc);
  } else if (state === 'sleeping') {
    px(ctx, ix - 2, iy - 5, 2, 2, dc);
    px(ctx, ix + 1, iy - 5, 2, 2, dc);
    px(ctx, ix - 3, iy - 3, 7, 2, darken(c, 0.5));
    const zzz = Math.floor(tick / 20) % 4;
    for (let z = 0; z < zzz; z++) {
      const zx = ix + 5 + z * 3;
      const zy = iy - 20 - z * 3;
      ctx.fillStyle = `rgba(180,180,255,${0.7 - z * 0.15})`;
      ctx.font = `${(2 + z * 0.5) * PX}px monospace`;
      ctx.textAlign = 'left';
      ctx.fillText('z', zx * PX, zy * PX);
    }
  } else {
    px(ctx, ix - 2, iy - 5, 2, 4, dc);
    px(ctx, ix + 1, iy - 5, 2, 4, dc);
    px(ctx, ix - 2, iy - 1, 2, 1, '#333');
    px(ctx, ix + 1, iy - 1, 2, 1, '#333');
  }

  if (state === 'working') {
    const sparkle = Math.sin(tick * 0.1) > 0.85;
    if (sparkle) {
      px(ctx, ix + 5, iy - 18 + workBob, 1, 1, '#ffee44');
      px(ctx, ix + 6, iy - 19 + workBob, 1, 1, '#ffffff');
    }
  }

  if (sprite.bubbleText && sprite.bubbleTimer > 0) {
    const bubbleX = ix - Math.ceil(sprite.bubbleText.length * 0.6);
    const bubbleY = iy - 24;
    const bubbleW = sprite.bubbleText.length + 2;
    px(ctx, bubbleX, bubbleY, bubbleW, 3, 'rgba(255,255,255,0.9)');
    px(ctx, ix - 1, bubbleY + 3, 2, 1, 'rgba(255,255,255,0.9)');
    ctx.fillStyle = '#333';
    ctx.font = `${1.8 * PX}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(sprite.bubbleText, (bubbleX + 1) * PX, (bubbleY + 2) * PX);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `bold ${2 * PX}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(info.name, ix * PX, (iy - 21 + tb) * PX);

  const statusColor = state === 'working' ? '#7fff7f' : state === 'sleeping' ? '#666' : state === 'walking' ? '#88ccff' : '#ffcc44';
  ctx.fillStyle = statusColor;
  ctx.fillRect((ix - 2) * PX, (iy - 22 + tb) * PX, 2 * PX, PX);
}

function drawDecorations(ctx: CanvasRenderingContext2D, tick: number) {
  const trees = [
    [3, 95], [128, 95], [290, 95], [415, 95],
    [3, 185], [128, 185], [290, 185], [415, 185],
    [135, 50], [280, 50], [135, 200], [280, 200],
  ];
  for (const [tx, ty] of trees) {
    px(ctx, tx, ty, 2, 6, '#553322');
    px(ctx, tx - 2, ty - 3, 6, 4, '#2d5a1e');
    px(ctx, tx - 1, ty - 6, 4, 4, '#3a7a2a');
    px(ctx, tx, ty - 8, 2, 3, '#4a8a3a');
  }

  const lamps = [[130, 95], [285, 95], [130, 185], [285, 185], [210, 95], [210, 185]];
  for (const [lx, ly] of lamps) {
    px(ctx, lx, ly - 8, 1, 8, '#666');
    px(ctx, lx - 1, ly - 9, 3, 2, '#888');
    px(ctx, lx, ly - 10, 1, 1, '#ffee88');
    const glow = 0.15 + Math.sin(tick * 0.025 + lx * 0.1) * 0.05;
    ctx.fillStyle = `rgba(255,238,136,${glow})`;
    ctx.fillRect((lx - 3) * PX, (ly - 12) * PX, 7 * PX, 5 * PX);
  }

  const benches = [[145, 98], [265, 98]];
  for (const [bx2, by2] of benches) {
    px(ctx, bx2, by2, 8, 1, '#8B6914');
    px(ctx, bx2, by2 - 1, 8, 1, '#a08040');
    px(ctx, bx2, by2 + 1, 1, 2, '#6B4914');
    px(ctx, bx2 + 7, by2 + 1, 1, 2, '#6B4914');
  }

  const flowers = [[138, 102], [272, 102], [145, 190], [270, 190]];
  for (const [fx, fy] of flowers) {
    px(ctx, fx, fy, 1, 2, '#3a7a2a');
    px(ctx, fx - 1, fy - 1, 3, 2, '#ff6688');
    px(ctx, fx, fy - 2, 1, 1, '#ffaa44');
  }
}

const PixelWorld: React.FC<{
  agents: AgentInfo[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  alerts: AlertInfo[];
  deptFilter: string | null;
  setDeptFilter: (v: string | null) => void;
  isLive: boolean;
}> = ({ agents, selectedId, onSelect, alerts, deptFilter, setDeptFilter, isLive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spritesRef = useRef<AgentSprite[]>([]);
  const tickRef = useRef(0);
  const animRef = useRef(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [clock, setClock] = useState(dayjs().format('HH:mm:ss'));

  useEffect(() => {
    const timer = setInterval(() => setClock(dayjs().format('HH:mm:ss')), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const existing = spritesRef.current;
    const map = new Map(existing.map(s => [s.info.id, s]));
    const next: AgentSprite[] = [];

    agents.forEach(agent => {
      const prev = map.get(agent.id);
      const isWorking = agent.status === 'working';
      const ws = WORKSTATIONS.find(w => w.agentId === agent.id);
      const idleSeat = IDLE_HUB_SEATS[agent.id];
      const target = isWorking && ws ? { x: ws.wx, y: ws.wy } : idleSeat ? { x: idleSeat.sx, y: idleSeat.sy } : { x: 200, y: 140 };

      if (prev) {
        prev.info = agent;
        prev.targetX = target.x;
        prev.targetY = target.y;
        const dist = Math.abs(prev.targetX - prev.x) + Math.abs(prev.targetY - prev.y);
        if (dist < 2) {
          prev.state = isWorking ? 'working' : agent.status === 'sleeping' ? 'sleeping' : 'sitting';
        }
        if (agent.currentTask && prev.bubbleTimer <= 0) {
          prev.bubbleText = agent.currentTask.length > 8 ? agent.currentTask.slice(0, 8) + '..' : agent.currentTask;
          prev.bubbleTimer = 120;
        }
        next.push(prev);
      } else {
        const startPos = idleSeat ? { x: idleSeat.sx, y: idleSeat.sy } : { x: 200, y: 140 };
        next.push({
          info: agent,
          x: startPos.x, y: startPos.y,
          targetX: target.x,
          targetY: target.y,
          facing: Math.random() > 0.5 ? 'left' : 'right',
          state: isWorking ? 'working' : 'sitting',
          walkFrame: 0,
          bubbleText: agent.currentTask ? (agent.currentTask.length > 8 ? agent.currentTask.slice(0, 8) + '..' : agent.currentTask) : null,
          bubbleTimer: agent.currentTask ? 120 : 0,
        });
      }
    });
    spritesRef.current = next;
  }, [agents]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const loop = () => {
      tickRef.current++;
      const tick = tickRef.current;
      const sprites = spritesRef.current;

      for (const s of sprites) {
        if (s.bubbleTimer > 0) s.bubbleTimer--;
        if (s.bubbleTimer <= 0) s.bubbleText = null;

        const dx = s.targetX - s.x;
        const dy = s.targetY - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 1.5) {
          const speed = 0.4;
          s.x += (dx / dist) * speed;
          s.y += (dy / dist) * speed;
          s.state = 'walking';
          s.facing = dx > 0 ? 'right' : 'left';
          s.walkFrame++;
        } else {
          s.x = s.targetX;
          s.y = s.targetY;
          if (s.state === 'walking') {
            s.state = s.info.status === 'working' ? 'working' : s.info.status === 'sleeping' ? 'sleeping' : 'sitting';
          }
        }
      }

      ctx.clearRect(0, 0, CW * PX, CH * PX);
      drawSky(ctx, tick);
      drawGround(ctx);
      drawDecorations(ctx, tick);

      for (const b of BUILDINGS) {
        const inside = sprites.filter(s => s.info.department === b.key).length;
        drawBuilding(ctx, b, inside, tick);
        if (b.key === 'intelligence') {
          drawXiaoYun(ctx, b.bx + Math.floor(b.bw / 2), b.by - 14, tick);
        }
      }

      for (const ws of WORKSTATIONS) {
        drawDesk(ctx, ws.wx, ws.wy);
      }

      const sorted = [...sprites].sort((a, b) => a.y - b.y);
      for (const s of sorted) {
        drawCharacter(ctx, s, tick);
      }

      if (selectedId) {
        const sel = sprites.find(s => s.info.id === selectedId);
        if (sel) {
          ctx.strokeStyle = '#7fff7f';
          ctx.lineWidth = PX;
          ctx.setLineDash([PX * 2, PX * 2]);
          ctx.strokeRect(
            (Math.round(sel.x) - 5) * PX,
            (Math.round(sel.y) - 20) * PX,
            11 * PX,
            22 * PX
          );
          ctx.setLineDash([]);
        }
      }

      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [selectedId]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * CW;
    const my = ((e.clientY - rect.top) / rect.height) * CH;
    for (const s of spritesRef.current) {
      if (Math.abs(mx - s.x) < 7 && Math.abs(my - s.y) < 12) {
        onSelect(s.info.id);
        return;
      }
    }
  }, [onSelect]);

  const handleCanvasMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * CW;
    const my = ((e.clientY - rect.top) / rect.height) * CH;
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    for (const s of spritesRef.current) {
      if (Math.abs(mx - s.x) < 7 && Math.abs(my - s.y) < 12) {
        setHoveredId(s.info.id);
        return;
      }
    }
    setHoveredId(null);
  }, []);

  const hoveredAgent = useMemo(() => agents.find(a => a.id === hoveredId), [agents, hoveredId]);
  const workingCount = useMemo(() => agents.filter(a => a.status === 'working').length, [agents]);

  return (
    <div className="pixel-world-container">
      <canvas ref={canvasRef} width={CW * PX} height={CH * PX} className="pixel-world-canvas"
        onClick={handleCanvasClick} onMouseMove={handleCanvasMove} onMouseLeave={() => setHoveredId(null)} />
      <div className="pixel-world-overlay">
        <div className="pixel-world-header">
          <div className="pixel-world-title">🤖 AI AGENT VILLAGE</div>
          <div className="pixel-world-clock">⏰ {clock} {isLive ? '🟢 实时' : '🟡 演示'}</div>
        </div>
      </div>
      <div className="pixel-world-legend">
        <div className="pixel-legend-item"><div className="pixel-legend-dot" style={{ background: '#7fff7f' }} />工作中 {workingCount}</div>
        <div className="pixel-legend-item"><div className="pixel-legend-dot" style={{ background: '#ffcc44' }} />空闲 {agents.length - workingCount}</div>
        <div className="pixel-legend-item"><div className="pixel-legend-dot" style={{ background: '#88ccff' }} />移动中</div>
      </div>
      {hoveredAgent && mousePos && (
        <div className="pixel-agent-tooltip" style={{ left: mousePos.x + 12, top: mousePos.y - 10 }}>
          <div className="pixel-tooltip-name" style={{ color: hoveredAgent.color }}>{hoveredAgent.name}</div>
          <div className="pixel-tooltip-row"><span>状态</span><span>{STATUS_LABEL[hoveredAgent.status]}</span></div>
          <div className="pixel-tooltip-row"><span>今日任务</span><span>{hoveredAgent.tasksToday}</span></div>
          <div className="pixel-tooltip-row"><span>🧠 聪明度</span><span>{hoveredAgent.intelligenceScore}</span></div>
          <div className="pixel-tooltip-row"><span>😴 偷懒度</span><span>{hoveredAgent.lazinessScore}</span></div>
          {hoveredAgent.currentTask && <div className="pixel-tooltip-task">🔧 {hoveredAgent.currentTask}</div>}
        </div>
      )}
      <div className="pixel-sidebar">
        {agents.filter(a => !deptFilter || a.department === deptFilter).map(agent => (
          <div key={agent.id} className={`pixel-agent-card ${selectedId === agent.id ? 'active' : ''}`} onClick={() => onSelect(agent.id)}>
            <div className="pixel-card-header">
              <div className="pixel-card-avatar" style={{ background: agent.color }}>{agent.name[0]}</div>
              <div className="pixel-card-name">{agent.name}</div>
              <span className={`pixel-card-status ${agent.status}`}>{STATUS_LABEL[agent.status]}</span>
            </div>
            <div className="pixel-card-metrics">
              <div className="pixel-metric">🧠 <span>{agent.intelligenceScore}</span></div>
              <div className="pixel-metric">😴 <span>{agent.lazinessScore}</span></div>
              <div className="pixel-metric">任务 <span>{agent.tasksToday}</span></div>
              <div className="pixel-metric">成功 <span>{agent.successRate}%</span></div>
            </div>
          </div>
        ))}
      </div>
      <div className="pixel-dept-filter">
        <div className={`pixel-dept-btn ${!deptFilter ? 'active' : ''}`} onClick={() => setDeptFilter(null)}>全部</div>
        {BUILDINGS.map(b => {
          const info = DEPT_INFO[b.key];
          return (
            <div key={b.key} className={`pixel-dept-btn ${deptFilter === b.key ? 'active' : ''}`}
              onClick={() => setDeptFilter(deptFilter === b.key ? null : b.key)}>{info.icon} {info.label}</div>
          );
        })}
      </div>
      {alerts.length > 0 && (
        <div className="pixel-alerts-bar">
          {alerts.slice(0, 3).map(a => (
            <div key={a.id} className={`pixel-alert-item ${a.level}`}><WarningOutlined /> {a.title}</div>
          ))}
        </div>
      )}
    </div>
  );
};

const AgentActivityPanel: React.FC = () => {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [alerts, setAlerts] = useState<AlertInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deptFilter, setDeptFilter] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [agentsResp, alertsResp] = await Promise.all([intelligenceApi.getAgentActivityList(), intelligenceApi.getAgentAlerts()]);
      // axios 拦截器已将 response.data 提取为 { code, data }，直接取 .data 即为数组
      const agentsData: any[] = (agentsResp as any)?.data || [];
      const alertsData = (alertsResp as any)?.data || [];

      if (agentsData.length > 0) {
        setIsLive(true);
        setAgents(agentsData);
      }
      setAlerts(alertsData);
    } catch (e) { console.warn('AgentActivity fetch error:', e); }
  }, []);

  useEffect(() => { void fetchData(); const t = setInterval(() => void fetchData(), 15000); return () => clearInterval(t); }, [fetchData]);

  const workingCount = useMemo(() => agents.filter(a => a.status === 'working').length, [agents]);
  const criticalAlerts = useMemo(() => alerts.filter(a => a.level === 'critical').length, [alerts]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Tag color="blue" style={{ margin: 0 }}><RobotOutlined /> 智能体 {agents.length}</Tag>
        <Tag color="green" style={{ margin: 0 }}><ThunderboltOutlined /> 工作中 {workingCount}</Tag>
        {criticalAlerts > 0 && <Tag color="red" style={{ margin: 0 }}><WarningOutlined /> 告警 {criticalAlerts}</Tag>}
      </div>
      <PixelWorld agents={agents} selectedId={selectedId} onSelect={setSelectedId} alerts={alerts} deptFilter={deptFilter} setDeptFilter={setDeptFilter} isLive={isLive} />
      {selectedId && (() => {
        const a = agents.find(ag => ag.id === selectedId);
        if (!a) return null;
        return (
          <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.4)', borderRadius: 8, border: `2px solid ${a.color}44`, fontFamily: 'monospace' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: a.color, marginBottom: 6 }}>{a.name}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>{a.description}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              <div><div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>状态</div><div style={{ fontSize: 14, fontWeight: 600, color: a.status === 'working' ? '#7fff7f' : '#999' }}>{STATUS_LABEL[a.status]}</div></div>
              <div><div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>🧠 聪明度</div><div style={{ fontSize: 14, fontWeight: 700, color: a.intelligenceScore >= 70 ? '#7fff7f' : a.intelligenceScore >= 40 ? '#ffcc44' : '#ff4444' }}>{a.intelligenceScore}</div></div>
              <div><div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>😴 偷懒度</div><div style={{ fontSize: 14, fontWeight: 700, color: a.lazinessScore >= 60 ? '#ff4444' : a.lazinessScore >= 30 ? '#ffcc44' : '#7fff7f' }}>{a.lazinessScore}</div></div>
              <div><div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>成功率</div><div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{a.successRate}%</div></div>
            </div>
            {a.currentTask && <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(127,255,127,0.08)', borderRadius: 4, borderLeft: `3px solid ${a.color}` }}><div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>当前任务</div><div style={{ fontSize: 12, color: '#7fff7f' }}>{a.currentTask}</div></div>}
          </div>
        );
      })()}
    </div>
  );
};

export default AgentActivityPanel;
