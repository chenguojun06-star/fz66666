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

const STATUS_LABEL: Record<string, string> = {
  working: '工作中', idle_recent: '刚空闲', idle: '空闲', sleeping: '休眠', unknown: '未知',
};

const DEPT_CONFIG: Record<string, { label: string; color: string; lightColor: string; darkColor: string; icon: string }> = {
  production: { label: '生产管理部', color: '#4a6cf7', lightColor: '#e8eeff', darkColor: '#3b5de7', icon: '🏭' },
  finance: { label: '财务管理部', color: '#ec4899', lightColor: '#fce8f0', darkColor: '#db2777', icon: '💰' },
  warehouse: { label: '仓储管理部', color: '#f59e0b', lightColor: '#fef3c7', darkColor: '#d97706', icon: '📦' },
  basic: { label: '基础业务部', color: '#14b8a6', lightColor: '#ccfbf1', darkColor: '#0d9488', icon: '✂️' },
  intelligence: { label: '智能运营中心', color: '#8b5cf6', lightColor: '#ede9fe', darkColor: '#7c3aed', icon: '🧠' },
};

const W = 900;
const H = 500;

interface AgentSprite {
  info: AgentInfo;
  x: number; y: number;
  targetX: number; targetY: number;
  state: 'walking' | 'working' | 'idle' | 'sleeping';
  walkPhase: number;
  bubbleText: string | null;
  bubbleTimer: number;
  hovered: boolean;
}

function scoreColor(score: number, type: 'int' | 'lazy'): string {
  if (type === 'int') return score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444';
  return score >= 60 ? '#ef4444' : score >= 30 ? '#f59e0b' : '#22c55e';
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawOfficeFloor(ctx: CanvasRenderingContext2D) {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#f0f2f5');
  grad.addColorStop(1, '#e2e6ec');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(0,0,0,0.04)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}

function drawDeptSection(ctx: CanvasRenderingContext2D, cx: number, cy: number, cfg: typeof DEPT_CONFIG[string], w: number, h: number, agentCount: number, tick: number) {
  const rx = cx - w / 2;
  const ry = cy - h / 2;
  ctx.shadowColor = 'rgba(0,0,0,0.04)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 2;
  drawRoundedRect(ctx, rx, ry, w, h, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.strokeStyle = cfg.color + '30';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  drawRoundedRect(ctx, rx, ry, w, h, 10);
  ctx.stroke();
  ctx.setLineDash([]);
  const headerGrad = ctx.createLinearGradient(rx, ry, rx, ry + 40);
  headerGrad.addColorStop(0, cfg.lightColor + 'cc');
  headerGrad.addColorStop(1, cfg.lightColor + '44');
  ctx.fillStyle = headerGrad;
  ctx.beginPath();
  ctx.moveTo(rx + 10, ry);
  ctx.lineTo(rx + w - 10, ry);
  ctx.quadraticCurveTo(rx + w, ry, rx + w, ry + 10);
  ctx.lineTo(rx + w, ry + 36);
  ctx.lineTo(rx, ry + 36);
  ctx.lineTo(rx, ry + 10);
  ctx.quadraticCurveTo(rx, ry, rx + 10, ry);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = cfg.color;
  ctx.font = '600 13px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(cfg.icon + '  ' + cfg.label, rx + 14, ry + 18);
  if (agentCount > 0) {
    const dotX = rx + w - 20;
    const dotY = ry + 18;
    const glow = 0.4 + Math.sin(tick * 0.03) * 0.15;
    ctx.fillStyle = `rgba(34, 197, 94, ${glow})`;
    ctx.beginPath(); ctx.arc(dotX, dotY, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
    ctx.beginPath(); ctx.arc(dotX, dotY, 8, 0, Math.PI * 2); ctx.fill();
  }
  const glassGrad = ctx.createLinearGradient(rx, ry + 40, rx, ry + h);
  glassGrad.addColorStop(0, 'rgba(255,255,255,0.06)');
  glassGrad.addColorStop(0.5, 'rgba(255,255,255,0.02)');
  glassGrad.addColorStop(1, 'rgba(255,255,255,0.06)');
  ctx.fillStyle = glassGrad;
  drawRoundedRect(ctx, rx + 4, ry + 40, w - 8, h - 52, 6);
  ctx.fill();
}

function drawCharacter(ctx: CanvasRenderingContext2D, sprite: AgentSprite, tick: number) {
  const { x, y, state, info } = sprite;
  const c = info.color;
  const isHov = sprite.hovered;
  const bodyBob = state === 'working' ? Math.sin(tick * 0.08) * 0.8 : state === 'walking' ? Math.sin(tick * 0.15 + sprite.walkPhase) * 1.2 : Math.sin(tick * 0.03) * 0.3;
  const cy = y + bodyBob;
  ctx.save();
  if (isHov) { ctx.shadowColor = c + '40'; ctx.shadowBlur = 16; }
  const shadowY = y + 14;
  ctx.shadowColor = 'rgba(0,0,0,0.08)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
  ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.beginPath(); ctx.ellipse(x, shadowY, 10, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  if (isHov) { ctx.shadowColor = c + '30'; ctx.shadowBlur = 12; }
  const headY = cy - 11;
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, headY, 7, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = c + '40'; ctx.lineWidth = 1.5; ctx.stroke();
  const eyeY = headY;
  const eyeSpacing = 3;
  const blink = Math.sin(tick * 0.06) > 0.92;
  ctx.fillStyle = c;
  if (blink) { ctx.fillRect(x - eyeSpacing - 2, eyeY - 1, 3, 1.5); ctx.fillRect(x + eyeSpacing - 1, eyeY - 1, 3, 1.5); }
  else {
    ctx.beginPath(); ctx.arc(x - eyeSpacing, eyeY, 1.6, 0, Math.PI * 2); ctx.arc(x + eyeSpacing, eyeY, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - eyeSpacing - 0.8, eyeY - 0.8, 0.6, 0, Math.PI * 2); ctx.arc(x + eyeSpacing - 0.8, eyeY - 0.8, 0.6, 0, Math.PI * 2); ctx.fill();
  }
  const bodyY = cy - 4;
  ctx.fillStyle = c;
  const bodyW = state === 'sleeping' ? 10 : state === 'working' ? 11 : 10;
  const bodyH = state === 'sleeping' ? 7 : state === 'working' ? 8 : 8;
  drawRoundedRect(ctx, x - bodyW / 2, bodyY, bodyW, bodyH, 3); ctx.fill();
  if (state === 'working') {
    const armPhase = Math.sin(tick * 0.12) * 2;
    ctx.fillStyle = c; ctx.fillRect(x + 5, bodyY - 2 + armPhase, 2, 4); ctx.fillRect(x - 7, bodyY - 2 - armPhase, 2, 4);
  }
  if (state === 'walking') {
    const legPhase = Math.floor(tick * 0.12) % 4;
    const legOff = [0, -1.5, 0, 1.5][legPhase];
    ctx.fillStyle = c + 'cc'; ctx.fillRect(x - 3, bodyY + bodyH - 1, 2.5, 4 + legOff); ctx.fillRect(x + 0.5, bodyY + bodyH - 1, 2.5, 4 - legOff);
  } else if (state === 'sleeping') {
    const zCount = Math.floor(tick / 25) % 4;
    for (let z = 0; z < zCount; z++) {
      const zx = x + 9 + z * 4; const zy = headY - 8 - z * 4;
      ctx.fillStyle = `rgba(100, 120, 180, ${0.5 - z * 0.1})`; ctx.font = `${9 + z * 2}px serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('💤', zx, zy);
    }
  }
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  if (state === 'working') {
    const sparkle = Math.sin(tick * 0.1) > 0.88;
    if (sparkle) { ctx.fillStyle = '#fbbf24'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('✦', x + 7, headY - 10); }
  }
  if (isHov) { ctx.strokeStyle = c + '60'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, cy - 4, 14, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = '#334155'; ctx.font = '500 9px -apple-system, BlinkMacSystemFont, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(info.name, x, cy + 10);
  const statusDotColor = state === 'working' ? '#22c55e' : state === 'walking' ? '#60a5fa' : state === 'sleeping' ? '#94a3b8' : '#f59e0b';
  ctx.fillStyle = statusDotColor; ctx.beginPath(); ctx.arc(x + 8, headY - 2, 2.5, 0, Math.PI * 2); ctx.fill();
  if (isHov) { ctx.fillStyle = statusDotColor + '44'; ctx.beginPath(); ctx.arc(x + 8, headY - 2, 5, 0, Math.PI * 2); ctx.fill(); }
  if (sprite.bubbleText && sprite.bubbleTimer > 0) {
    const bw = ctx.measureText(sprite.bubbleText).width + 12;
    const bx = x - bw / 2; const by = headY - 22;
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; drawRoundedRect(ctx, bx, by, bw, 16, 6); ctx.fill();
    ctx.strokeStyle = c + '30'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#1a1a2e'; ctx.font = '500 9px -apple-system, BlinkMacSystemFont, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(sprite.bubbleText, x, by + 8);
  }
  ctx.restore();
}

function drawDesk(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#e8ecf0'; drawRoundedRect(ctx, x - 10, y - 2, 20, 6, 2); ctx.fill();
  ctx.strokeStyle = '#d0d4da'; ctx.lineWidth = 0.5; ctx.stroke();
  ctx.fillStyle = '#d0d4da'; ctx.fillRect(x - 8, y + 4, 2, 4); ctx.fillRect(x + 6, y + 4, 2, 4);
}

function drawDecorations(ctx: CanvasRenderingContext2D, tick: number) {
  const plants: [number, number][] = [[20, 40], [W - 30, 40], [20, H - 40], [W - 30, H - 40], [W / 2 - 100, 30], [W / 2 + 100, 30]];
  for (const [px, py] of plants) {
    ctx.fillStyle = '#4a7a3a'; ctx.fillRect(px - 1, py, 3, 8);
    ctx.fillStyle = '#5a9a4a'; ctx.beginPath(); ctx.moveTo(px, py - 6); ctx.lineTo(px - 5, py); ctx.lineTo(px + 5, py); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(px, py - 8); ctx.lineTo(px - 4, py - 2); ctx.lineTo(px + 4, py - 2); ctx.closePath(); ctx.fill();
  }
  const lamps: [number, number][] = [[W / 2 - 140, H / 2 - 80], [W / 2 + 140, H / 2 - 80], [W / 2 - 140, H / 2 + 80], [W / 2 + 140, H / 2 + 80]];
  for (const [lx, ly] of lamps) {
    ctx.fillStyle = '#c0c8d0'; ctx.fillRect(lx, ly - 6, 2, 6);
    ctx.fillStyle = `rgba(255, 248, 220, ${0.15 + Math.sin(tick * 0.02 + lx * 0.1) * 0.05})`; ctx.beginPath(); ctx.ellipse(lx + 1, ly + 2, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f0e8d0'; ctx.beginPath(); ctx.ellipse(lx + 1, ly, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
  }
}

const DEPT_SECTIONS: Record<string, { cx: number; cy: number; w: number; h: number }> = {
  production: { cx: 200, cy: 120, w: 300, h: 160 },
  finance: { cx: 700, cy: 120, w: 220, h: 160 },
  warehouse: { cx: 200, cy: 360, w: 250, h: 140 },
  basic: { cx: 620, cy: 360, w: 220, h: 140 },
  intelligence: { cx: 460, cy: 270, w: 280, h: 180 },
};

const WORKSTATIONS: { agentId: string; dx: number; dy: number; dept: string }[] = [
  { agentId: 'order-manager', dept: 'production', dx: 100, dy: -15 },
  { agentId: 'material-buyer', dept: 'production', dx: 200, dy: -15 },
  { agentId: 'quality-inspector', dept: 'production', dx: 100, dy: 30 },
  { agentId: 'production-scheduler', dept: 'production', dx: 200, dy: 30 },
  { agentId: 'finance-settler', dept: 'finance', dx: 700, dy: 120 },
  { agentId: 'warehouse-keeper', dept: 'warehouse', dx: 120, dy: 350 },
  { agentId: 'inventory-manager', dept: 'warehouse', dx: 220, dy: 350 },
  { agentId: 'style-designer', dept: 'basic', dx: 600, dy: 350 },
  { agentId: 'data-analyst', dept: 'intelligence', dx: 390, dy: 220 },
  { agentId: 'risk-sentinel', dept: 'intelligence', dx: 470, dy: 220 },
  { agentId: 'smart-advisor', dept: 'intelligence', dx: 390, dy: 295 },
  { agentId: 'learning-engine', dept: 'intelligence', dx: 470, dy: 295 },
  { agentId: 'system-doctor', dept: 'intelligence', dx: 550, dy: 260 },
];

const IDLE_SPOTS: Record<string, { ix: number; iy: number }> = {
  'order-manager': { ix: 460, iy: 130 },
  'material-buyer': { ix: 490, iy: 140 },
  'quality-inspector': { ix: 520, iy: 150 },
  'production-scheduler': { ix: 550, iy: 140 },
  'finance-settler': { ix: 460, iy: 170 },
  'warehouse-keeper': { ix: 490, iy: 180 },
  'inventory-manager': { ix: 520, iy: 170 },
  'style-designer': { ix: 550, iy: 180 },
  'data-analyst': { ix: 460, iy: 210 },
  'risk-sentinel': { ix: 490, iy: 220 },
  'smart-advisor': { ix: 520, iy: 210 },
  'learning-engine': { ix: 550, iy: 220 },
  'system-doctor': { ix: 580, iy: 210 },
};

const Office3D: React.FC<{
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
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [clock, setClock] = useState(dayjs().format('HH:mm:ss'));

  useEffect(() => {
    const timer = setInterval(() => setClock(dayjs().format('HH:mm:ss')), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const existing = spritesRef.current;
    const map = new Map(existing.map((s) => [s.info.id, s]));
    const next: AgentSprite[] = [];
    agents.forEach((agent) => {
      const prev = map.get(agent.id);
      const ws = WORKSTATIONS.find((w) => w.agentId === agent.id);
      const idleSpot = IDLE_SPOTS[agent.id];
      const isActive = agent.status === 'working';
      const target = isActive && ws ? { x: ws.dx, y: ws.dy } : idleSpot ? { x: idleSpot.ix, y: idleSpot.iy } : { x: 450, y: 260 };
      if (prev) {
        prev.info = agent;
        prev.targetX = target.x;
        prev.targetY = target.y;
        const dx = prev.targetX - prev.x;
        const dy = prev.targetY - prev.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 2) { prev.state = isActive ? 'working' : agent.status === 'sleeping' ? 'sleeping' : 'idle'; }
        if (agent.currentTask && prev.bubbleTimer <= 0) {
          prev.bubbleText = agent.currentTask.length > 10 ? agent.currentTask.slice(0, 10) + '..' : agent.currentTask;
          prev.bubbleTimer = 150;
        }
        next.push(prev);
      } else {
        next.push({
          info: agent, x: target.x, y: target.y, targetX: target.x, targetY: target.y,
          state: isActive ? 'working' : 'idle', walkPhase: Math.random() * 100,
          bubbleText: agent.currentTask ? (agent.currentTask.length > 10 ? agent.currentTask.slice(0, 10) + '..' : agent.currentTask) : null,
          bubbleTimer: agent.currentTask ? 150 : 0, hovered: false,
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
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const displayW = rect.width || W;
    const displayH = (displayW / W) * H;
    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
    canvas.style.height = displayH + 'px';
    ctx.scale(dpr, dpr);
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
          const speed = 1.8;
          const sx = displayW / W;
          const sy = displayH / H;
          s.x += (dx / dist) * speed * sx;
          s.y += (dy / dist) * speed * sy;
          s.state = 'walking';
          s.walkPhase++;
        } else {
          s.x = s.targetX;
          s.y = s.targetY;
          if (s.state === 'walking') { s.state = s.info.status === 'working' ? 'working' : s.info.status === 'sleeping' ? 'sleeping' : 'idle'; }
        }
      }
      ctx.clearRect(0, 0, displayW, displayH);
      ctx.save();
      const s = displayW / W;
      ctx.scale(s, s);
      drawOfficeFloor(ctx);
      for (const [deptKey, section] of Object.entries(DEPT_SECTIONS)) {
        if (deptFilter && deptKey !== deptFilter) continue;
        const cfg = DEPT_CONFIG[deptKey];
        const count = sprites.filter((sp) => sp.info.department === deptKey && sp.info.status === 'working').length;
        drawDeptSection(ctx, section.cx, section.cy, cfg, section.w, section.h, count, tick);
      }
      drawDecorations(ctx, tick);
      for (const ws of WORKSTATIONS) {
        if (deptFilter && ws.dept !== deptFilter) continue;
        drawDesk(ctx, ws.dx, ws.dy);
      }
      const sorted = [...sprites].sort((a, b) => a.y - b.y);
      for (const sp of sorted) { sp.hovered = sp.info.id === hoveredId; drawCharacter(ctx, sp, tick); }
      if (selectedId) {
        const sel = sprites.find((sp) => sp.info.id === selectedId);
        if (sel) {
          ctx.strokeStyle = sel.info.color + '60'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
          drawRoundedRect(ctx, sel.x - 14, sel.y - 20, 28, 32, 6); ctx.stroke(); ctx.setLineDash([]);
        }
      }
      ctx.restore();
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [selectedId, deptFilter, hoveredId]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const s = W / rect.width;
    const mx = (e.clientX - rect.left) * s;
    const my = (e.clientY - rect.top) * s;
    for (const sp of spritesRef.current) {
      if (Math.abs(mx - sp.x) < 12 && Math.abs(my - sp.y) < 16) { onSelect(sp.info.id); return; }
    }
  }, [onSelect]);

  const handleCanvasMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const s = W / rect.width;
    const mx = (e.clientX - rect.left) * s;
    const my = (e.clientY - rect.top) * s;
    setHoverPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    for (const sp of spritesRef.current) {
      if (Math.abs(mx - sp.x) < 12 && Math.abs(my - sp.y) < 16) { setHoveredId(sp.info.id); return; }
    }
    setHoveredId(null);
  }, []);

  const hoveredAgent = useMemo(() => agents.find((a) => a.id === hoveredId), [agents, hoveredId]);
  const workingCount = useMemo(() => agents.filter((a) => a.status === 'working').length, [agents]);
  const idleCount = useMemo(() => agents.length - workingCount, [agents, workingCount]);
  const criticalAlerts = useMemo(() => alerts.filter((a) => a.level === 'critical').length, [alerts]);

  const intScore = hoveredAgent ? hoveredAgent.intelligenceScore : 0;
  const lazyScore = hoveredAgent ? hoveredAgent.lazinessScore : 0;

  return (
    <div className="office-container">
      <canvas ref={canvasRef} className="office-canvas" onClick={handleCanvasClick} onMouseMove={handleCanvasMove} onMouseLeave={() => { setHoveredId(null); setHoverPos(null); }} style={{ cursor: hoveredId ? 'pointer' : 'default' }} />
      <div className="office-header">
        <div className="office-title">
          <div className="office-title-icon">AI</div>
          AI 智能体办公室 · 实时活动追踪
        </div>
        <div className="office-clock">
          <span className={`office-clock-dot ${isLive ? 'live' : 'demo'}`} />
          {clock}
        </div>
      </div>
      <div className="office-status-bar">
        <div className="office-status-item"><RobotOutlined /> 智能体 <span className="office-status-value" style={{ color: '#4a6cf7' }}>{agents.length}</span></div>
        <div className="office-status-item"><ThunderboltOutlined /> 工作中 <span className="office-status-value working">{workingCount}</span></div>
        <div className="office-status-item">空闲 <span className="office-status-value idle">{idleCount}</span></div>
        {criticalAlerts > 0 && <div className="office-status-item"><WarningOutlined /> 告警 <span className="office-status-value alert">{criticalAlerts}</span></div>}
      </div>
      <div className="office-legend">
        <div className="office-legend-item"><div className="office-legend-dot" style={{ background: '#22c55e' }} />工作中</div>
        <div className="office-legend-item"><div className="office-legend-dot" style={{ background: '#f59e0b' }} />空闲</div>
        <div className="office-legend-item"><div className="office-legend-dot" style={{ background: '#60a5fa' }} />移动中</div>
        <div className="office-legend-item"><div className="office-legend-dot" style={{ background: '#94a3b8' }} />休眠</div>
      </div>
      {hoveredAgent && hoverPos && (
        <div className="office-agent-tooltip" style={{ left: Math.min(hoverPos.x + 16, window.innerWidth - 320), top: Math.max(hoverPos.y - 180, 10) }}>
          <div className="office-tooltip-header">
            <div className="office-tooltip-avatar" style={{ background: hoveredAgent.color }}>{hoveredAgent.name[0]}</div>
            <div>
              <div className="office-tooltip-name">{hoveredAgent.name}</div>
              <div className="office-tooltip-dept">{DEPT_CONFIG[hoveredAgent.department]?.icon} {DEPT_CONFIG[hoveredAgent.department]?.label || hoveredAgent.department}</div>
            </div>
          </div>
          <div className="office-tooltip-body">
            <div className="office-tooltip-row"><span className="office-tooltip-label">状态</span><span className="office-tooltip-value">{STATUS_LABEL[hoveredAgent.status]}</span></div>
            <div className="office-tooltip-row"><span className="office-tooltip-label">今日任务</span><span className="office-tooltip-value">{hoveredAgent.tasksToday}</span></div>
            <div className="office-tooltip-row"><span className="office-tooltip-label">成功率</span><span className="office-tooltip-value">{hoveredAgent.successRate}%</span></div>
            <div className="office-tooltip-row"><span className="office-tooltip-label">平均耗时</span><span className="office-tooltip-value">{hoveredAgent.avgDurationMs}ms</span></div>
            <div className="office-tooltip-row"><span className="office-tooltip-label">聪明度</span><span className="office-tooltip-value" style={{ color: scoreColor(intScore, 'int') }}>{intScore}</span></div>
            <div className="office-tooltip-row"><span className="office-tooltip-label">偷懒度</span><span className="office-tooltip-value" style={{ color: scoreColor(lazyScore, 'lazy') }}>{lazyScore}</span></div>
          </div>
          {hoveredAgent.currentTask && <div className="office-tooltip-task">⚡ {hoveredAgent.currentTask}</div>}
          <div className="office-tooltip-desc">{hoveredAgent.description}</div>
        </div>
      )}
      <div className="office-sidebar">
        {agents.filter((a) => !deptFilter || a.department === deptFilter).map((agent) => (
          <div key={agent.id} className={`office-agent-card ${selectedId === agent.id ? 'active' : ''}`} onClick={() => onSelect(agent.id)}>
            <div className="office-card-avatar" style={{ background: agent.color }}>{agent.name[0]}</div>
            <div className="office-card-info">
              <div className="office-card-name">{agent.name}</div>
              <div className="office-card-meta">{agent.tasksToday} 任务 · {agent.successRate}% 成功率</div>
            </div>
            <div className={`office-card-status-dot ${agent.status}`} />
          </div>
        ))}
      </div>
      <div className="office-dept-filter">
        <div className={`office-dept-btn ${!deptFilter ? 'active' : ''}`} onClick={() => setDeptFilter(null)}>全部</div>
        {Object.entries(DEPT_CONFIG).map(([key, cfg]) => (
          <div key={key} className={`office-dept-btn ${deptFilter === key ? 'active' : ''}`} onClick={() => setDeptFilter(deptFilter === key ? null : key)}>{cfg.icon} {cfg.label}</div>
        ))}
      </div>
      {alerts.length > 0 && (
        <div className="office-alerts-bar">
          {alerts.slice(0, 3).map((a) => <div key={a.id} className={`office-alert-item ${a.level}`}><WarningOutlined /> {a.title}</div>)}
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
      const agentsData: any[] = (agentsResp as any)?.data || [];
      const alertsData = (alertsResp as any)?.data || [];
      if (agentsData.length > 0) { setIsLive(true); setAgents(agentsData as AgentInfo[]); }
      setAlerts(alertsData as AlertInfo[]);
    } catch (e) { console.warn('AgentActivity fetch error:', e); }
  }, []);

  useEffect(() => { void fetchData(); const t = setInterval(() => void fetchData(), 15000); return () => clearInterval(t); }, [fetchData]);

  const workingCount = useMemo(() => agents.filter((a) => a.status === 'working').length, [agents]);
  const criticalAlerts = useMemo(() => alerts.filter((a) => a.level === 'critical').length, [alerts]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Tag color="blue" style={{ margin: 0 }}><RobotOutlined /> 智能体 {agents.length}</Tag>
        <Tag color="green" style={{ margin: 0 }}><ThunderboltOutlined /> 工作中 {workingCount}</Tag>
        {criticalAlerts > 0 && <Tag color="red" style={{ margin: 0 }}><WarningOutlined /> 告警 {criticalAlerts}</Tag>}
      </div>
      <Office3D agents={agents} selectedId={selectedId} onSelect={setSelectedId} alerts={alerts} deptFilter={deptFilter} setDeptFilter={setDeptFilter} isLive={isLive} />
      {selectedId && (() => {
        const a = agents.find((ag) => ag.id === selectedId);
        if (!a) return null;
        return (
          <div style={{ padding: '14px 18px', background: '#fff', borderRadius: 12, border: `1.5px solid ${a.color}22`, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: a.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff' }}>{a.name[0]}</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>{a.name}</div>
                <div style={{ fontSize: 11, color: '#8a9aaa' }}>{a.description}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
              {[
                { label: '状态', value: STATUS_LABEL[a.status], color: a.status === 'working' ? '#22c55e' : '#94a3b8' },
                { label: '今日任务', value: a.tasksToday, color: '#4a6cf7' },
                { label: '成功率', value: `${a.successRate}%`, color: a.successRate >= 80 ? '#22c55e' : '#f59e0b' },
                { label: '聪明度', value: a.intelligenceScore, color: scoreColor(a.intelligenceScore, 'int') },
                { label: '偷懒度', value: a.lazinessScore, color: scoreColor(a.lazinessScore, 'lazy') },
              ].map((item) => (
                <div key={item.label} style={{ background: '#f8f9fb', padding: '8px 12px', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: '#8a9aaa', marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>
            {a.currentTask && (
              <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(74, 108, 247, 0.06)', borderRadius: 8, borderLeft: `3px solid ${a.color}`, fontSize: 12, color: '#4a6cf7', fontWeight: 500 }}>
                ⚡ 当前任务：{a.currentTask}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};

export default AgentActivityPanel;
