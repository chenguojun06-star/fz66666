#!/usr/bin/env node
/**
 * 前端硬编码颜色批量替换脚本（Node.js 版）
 * 替换硬编码 hex 颜色为 CSS 变量，保护渐变色/动态色/变量定义文件
 *
 * 用法：node scripts/replace-colors.mjs [--dry-run] [--verbose]
 */
import fs from 'fs';
import path from 'path';

const FRONTEND_SRC = 'frontend/src';
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

// design-system.css 中定义的颜色 → CSS 变量映射
// 按颜色值长度降序排列（6位→3位），确保长色值先匹配
// ⚠️ 所有颜色值统一用小写存储，查找时也用小写，避免大小写不匹配
const COLOR_MAP_RAW = [
  // ══════════════════════════════════════════════════════════════════════════
  // 主色调
  // ══════════════════════════════════════════════════════════════════════════
  ['#2d7ff9', 'var(--color-primary)'],
  ['#1677ff', 'var(--color-primary)'],
  ['#5b9cfa', 'var(--color-primary-light)'],
  ['#1e6fe8', 'var(--color-primary-dark)'],
  ['#1558d6', 'var(--color-primary-darker)'],
  // 辅助色
  ['#faad14', 'var(--color-warning)'],
  ['#fa8c16', 'var(--color-warning)'],
  ['#ff4d4f', 'var(--color-danger)'],
  ['#52c41a', 'var(--color-success)'],
  ['#1890ff', 'var(--color-info)'],
  ['#f5222d', 'var(--color-error)'],
  ['#cf1322', 'var(--color-error)'],
  // 语义强调色
  ['#722ed1', 'var(--color-accent-purple)'],
  ['#13c2c2', 'var(--color-accent-cyan)'],
  ['#38bdf8', 'var(--color-accent-sky)'],
  ['#10b981', 'var(--color-accent-emerald)'],
  // 中性色 - 文字
  ['#1a1a1a', 'var(--color-text-primary)'],
  ['#6b7280', 'var(--color-text-secondary)'],
  ['#9ca3af', 'var(--color-text-tertiary)'],
  ['#bfbfbf', 'var(--color-text-quaternary)'],
  // 中性色 - 背景
  ['#fafafa', 'var(--color-bg-container)'],
  ['#f5f5f5', 'var(--color-bg-subtle)'],
  ['#f8fafc', 'var(--color-slate-50)'],
  ['#ebf2ff', 'var(--color-bg-highlight)'],
  ['#f5f7fb', 'var(--color-bg-stripe)'],
  // 边框
  ['#e5e7eb', 'var(--color-border)'],
  ['#f0f0f0', 'var(--color-border-light)'],
  ['#d9d9d9', 'var(--color-border-antd)'],
  // 状态背景色
  ['#f6ffed', 'var(--status-success-bg)'],
  ['#fffbe6', 'var(--status-warning-bg)'],
  ['#fff2f0', 'var(--status-error-bg)'],
  ['#e6f7ff', 'var(--status-processing-bg)'],
  ['#f9f0ff', 'var(--status-info-bg)'],
  ['#f0f7ff', 'var(--status-processing-bg)'],
  ['#e6fffb', 'var(--status-info-bg)'],
  ['#f0f9ff', 'var(--color-slate-50)'],
  ['#fafcff', 'var(--color-slate-50)'],
  ['#f8fbff', 'var(--color-slate-50)'],
  // 状态边框色
  ['#b7eb8f', 'var(--status-success-border)'],
  ['#ffe58f', 'var(--status-warning-border)'],
  ['#ffccc7', 'var(--status-error-border)'],
  ['#91d5ff', 'var(--status-processing-border)'],
  ['#d3adf7', 'var(--status-info-border)'],

  // ══════════════════════════════════════════════════════════════════════════
  // 【2026-08-01 扩展】高频未映射颜色 → CSS 变量映射
  // 所有值都已在 design-system.css 中定义
  // ══════════════════════════════════════════════════════════════════════════

  // ---- Slate 系（Tailwind） ----
  ['#e2e8f0', 'var(--color-slate-200)'],   // 14次 - 边框/分隔
  ['#0f172a', 'var(--color-slate-900)'],   // 13次 - 深色背景
  ['#7aaec8', 'var(--color-blue-300)'],    // 12次 - 蓝色
  ['#7dacc4', 'var(--color-blue-300)'],    // 11次
  ['#f8f9fa', 'var(--color-slate-50)'],    // 11次 - 浅背景
  ['#c8d8ea', 'var(--color-blue-200)'],    // 10次
  ['#6ba8c6', 'var(--color-blue-300)'],    // 10次
  ['#ddd', 'var(--color-zinc-300)'],       // 9次 - 灰色
  ['#64748b', 'var(--color-slate-500)'],   // 9次 - 石板灰
  ['#94a3b8', 'var(--color-slate-400)'],   // 8次
  ['#d0d0d0', 'var(--color-zinc-300)'],    // 8次
  ['#555', 'var(--color-zinc-600)'],       // 8次 - 深灰
  ['#374151', 'var(--color-slate-700)'],   // 6次 - 深灰
  ['#f0f1f3', 'var(--color-slate-100)'],   // 6次
  ['#111827', 'var(--color-slate-900)'],   // 5次 - 深色
  ['#e8ecf2', 'var(--color-slate-200)'],   // 5次
  ['#f1f5f9', 'var(--color-slate-100)'],   // 4次 - 浅背景
  ['#f4f6f8', 'var(--color-slate-100)'],   // 3次
  ['#eef0f4', 'var(--color-slate-200)'],   // 3次
  ['#d4d4d4', 'var(--color-zinc-300)'],    // 3次
  ['#a0aab7', 'var(--color-slate-400)'],   // 3次

  // ---- Emerald/Green 系 ----
  ['#059669', 'var(--color-emerald-600)'], // 13次 - 深绿
  ['#95de64', 'var(--color-success)'],     // 11次 - 浅绿
  ['#73d13d', 'var(--color-success)'],     // 7次
  ['#07c160', 'var(--color-emerald-500)'], // 6次 - 翠绿
  ['#237804', 'var(--color-emerald-700)'], // 4次 - 深绿
  ['#16a34a', 'var(--color-emerald-600)'], // 4次
  ['#4ade80', 'var(--color-emerald-400)'], // 5次
  ['#34d399', 'var(--color-emerald-400)'], // 映射
  ['#f0fff0', 'var(--status-success-bg)'], // 3次

  // ---- Blue 系（Ant Design 变体）----
  ['#4a6cf7', 'var(--color-primary)'],     // 12次 - 品牌蓝
  ['#2f54eb', 'var(--color-primary-dark)'], // 11次
  ['#096dd9', 'var(--color-primary)'],      // 7次
  ['#0958d9', 'var(--color-primary-dark)'], // 6次
  ['#1d39c4', 'var(--color-primary-darker)'], // 5次
  ['#1f75ea', 'var(--color-primary)'],      // 7次
  ['#1562d6', 'var(--color-primary)'],     // 3次
  ['#4096ff', 'var(--color-primary-light)'], // 4次
  ['#60a5fa', 'var(--color-blue-400)'],    // 4次
  ['#93c5fd', 'var(--color-blue-300)'],    // 3次
  ['#dbeafe', 'var(--color-blue-100)'],    // 映射
  ['#eff6ff', 'var(--color-blue-50)'],     // 3次
  ['#dff5ff', 'var(--color-blue-100)'],    // 3次
  ['#f0f5ff', 'var(--color-blue-50)'],     // 3次（已有）
  ['#e8f4ff', 'var(--color-blue-100)'],    // 6次
  ['#adc6ff', 'var(--color-blue-200)'],    // 7次
  ['#91caff', 'var(--color-blue-200)'],    // 已有

  // ---- Amber/Yellow 系 ----
  ['#d97706', 'var(--color-amber-600)'],   // 10次 - 琥珀
  ['#d46b08', 'var(--color-amber-700)'],   // 9次
  ['#874d00', 'var(--color-amber-700)'],   // 7次
  ['#ffc53d', 'var(--color-amber-300)'],   // 7次
  ['#ffd700', 'var(--color-gold)'],         // 8次 - 金色
  ['#ffa940', 'var(--color-orange-300)'],  // 6次
  ['#f7c44a', 'var(--color-amber-400)'],   // 4次

  // ---- Orange 系 ----
  ['#f97316', 'var(--color-orange-500)'],  // 7次 - 橙色
  ['#fa541c', 'var(--color-orange-600)'],  // 7次
  ['#d4380d', 'var(--color-orange-700)'],  // 8次
  ['#ff7a45', 'var(--color-orange-400)'],  // 4次
  ['#ff7300', 'var(--color-orange-500)'],  // 5次

  // ---- Red 系 ----
  ['#eb2f96', 'var(--color-magenta)'],     // 9次 - 品红
  ['#a8071a', 'var(--color-red-700)'],     // 6次
  ['#fef2f2', 'var(--color-red-100)'],     // 5次（浅红背景）
  ['#fecaca', 'var(--color-red-200)'],     // 映射

  // ---- Purple/Violet 系 ----
  ['#8b5cf6', 'var(--color-purple-500)'],  // 9次
  ['#a855f7', 'var(--color-purple-500)'],  // 9次
  ['#c084fc', 'var(--color-purple-400)'],  // 3次
  ['#7c3aed', 'var(--color-purple-600)'],  // 3次
  ['#ede9fe', 'var(--color-purple-200)'],  // 3次
  ['#faf5ff', 'var(--color-purple-100)'],  // 3次

  // ---- Cyan/Teal 系 ----
  ['#36cfc9', 'var(--color-accent-cyan)'], // 9次
  ['#0098aa', 'var(--color-cyan-700)'],    // 3次
  ['#00b4ff', 'var(--color-cyan-500)'],    // 3次

  // ---- Pink 系 ----
  ['#ec4899', 'var(--color-pink-500)'],    // 3次
  ['#ff6b6b', 'var(--color-coral)'],       // 3次

  // ---- Gray/Zinc 系 ----
  ['#111', 'var(--color-black)'],          // 10次 - 黑色
  ['#2a2a2a', 'var(--color-zinc-800)'],    // 7次
  ['#0f1115', 'var(--color-dark-bg)'],     // 6次 - 深色背景
  ['#1a1a2e', 'var(--color-dark-bg-2)'],   // 6次
  ['#080f1e', 'var(--color-dark-bg)'],     // 3次
  ['#222', 'var(--color-zinc-800)'],       // 4次
  ['#4b5563', 'var(--color-slate-600)'],   // 4次
  ['#98a2b3', 'var(--color-slate-400)'],   // 6次
  ['#b8d4e8', 'var(--color-blue-200)'],    // 3次
  ['#8ea5c8', 'var(--color-blue-300)'],    // 6次
  ['#9ab8cc', 'var(--color-blue-300)'],    // 7次
  ['#7fa7c2', 'var(--color-blue-300)'],    // 7次
  ['#5a7a9a', 'var(--color-blue-400)'],    // 8次
  ['#8b92a0', 'var(--color-slate-400)'],   // 4次
  ['#c0c0c0', 'var(--color-silver)'],      // 4次
  ['#ccc', 'var(--color-zinc-300)'],       // 6次
  ['#eaeaea', 'var(--color-zinc-200)'],    // 4次
  ['#ececec', 'var(--color-zinc-200)'],    // 5次
  ['#fcfcfd', 'var(--color-slate-50)'],    // 3次
  ['#cbd5e1', 'var(--color-slate-300)'],   // 5次
  ['#cbd5e0', 'var(--color-slate-300)'],   // 3次
  ['#e8edf4', 'var(--color-slate-200)'],   // 3次
  ['#3a5a7a', 'var(--color-ocean-lighter)'], // 4次
  ['#4a8aaa', 'var(--color-blue-400)'],    // 4次
  ['#5c6ac4', 'var(--color-primary)'],     // 3次
  ['#597ac0', 'var(--color-blue-400)'],    // 5次
  ['#3f5d95', 'var(--color-ocean-light)'], // 3次

  // ---- 其他 ----
  ['#f5f7fa', 'var(--color-slate-50)'],    // 7次 - 浅背景
  ['#f7fbff', 'var(--color-slate-50)'],    // 4次
  ['#facc15', 'var(--color-amber-400)'],   // 3次 - 亮黄
  ['#ff4136', 'var(--color-red-500)'],     // 4次
  ['#ff2442', 'var(--color-red-500)'],     // 3次
  ['#e8686a', 'var(--color-red-400)'],     // 5次
  ['#531dab', 'var(--color-purple-700)'],  // 3次
  ['#1a5fb4', 'var(--color-blue-700)'],    // 3次
  ['#fdf5ff', 'var(--color-purple-100)'],  // 3次（已有fff7e6的镜像）
  ['#fff7e6', 'var(--color-amber-200)'],   // 3次
  ['#cd7f32', 'var(--color-bronze)'],      // 4次
  ['#cd7732', 'var(--color-bronze)'],      // 4次（alt）
  ['#e85d04', 'var(--color-orange-600)'],  // 3次
  ['#ff7300', 'var(--color-orange-500)'],  // 5次（已有）
  ['#6ee7b7', 'var(--color-emerald-300)'], // 映射
  ['#475569', 'var(--color-slate-600)'],   // 4次（已有）
  ['#334155', 'var(--color-slate-700)'],   // 6次（已有）
  ['#1e293b', 'var(--color-slate-800)'],   // 已有
  ['#262626', 'var(--color-zinc-800)'],   // 已有
  ['#1f2937', 'var(--color-slate-800)'],   // 已有
  ['#1f1f1f', 'var(--color-zinc-800)'],   // 已有
  ['#4096ff', 'var(--color-primary-light)'], // 已有
  ['#1677ff', 'var(--color-primary)'],     // 已有

  // ══════════════════════════════════════════════════════════════════════════
  // 【2026-08-01 第二轮补充】Top 80 剩余未映射色
  // ══════════════════════════════════════════════════════════════════════════
  ['#2a4060', 'var(--color-ocean-light)'],    // 5次
  ['#3a6080', 'var(--color-ocean-lighter)'],  // 5次
  ['#f8f9ff', 'var(--color-slate-50)'],       // 5次
  ['#1a6ae5', 'var(--color-primary)'],         // 5次
  ['#d6e4ff', 'var(--color-blue-100)'],        // 4次
  ['#777', 'var(--color-zinc-500)'],           // 4次
  ['#5ad4e8', 'var(--color-cyan-400)'],        // 4次
  ['#8fb6cb', 'var(--color-blue-200)'],        // 3次
  ['#6f9bb5', 'var(--color-blue-300)'],        // 3次
  ['#f6f7fb', 'var(--color-slate-50)'],        // 3次
  ['#f6f8fa', 'var(--color-slate-50)'],        // 3次
  ['#e1251b', 'var(--color-red-600)'],         // 3次
  ['#e02e24', 'var(--color-red-600)'],         // 3次
  ['#b8bdc6', 'var(--color-slate-400)'],       // 2次
  ['#eaf1ff', 'var(--color-blue-50)'],         // 2次
  ['#0284c7', 'var(--color-sky-500)'],         // 2次
  ['#fee2e2', 'var(--color-red-100)'],         // 2次
  ['#ecfdf5', 'var(--color-emerald-50)'],      // 2次
  ['#15803d', 'var(--color-emerald-700)'],     // 2次
  ['#b5b5c3', 'var(--color-slate-400)'],       // 2次
  ['#eab308', 'var(--color-amber-500)'],       // 2次
  ['#4d7c0f', 'var(--color-lime-700)'],        // 2次
  ['#5b8c00', 'var(--color-lime-600)'],        // 2次
  ['#135200', 'var(--color-lime-800)'],        // 2次
  ['#613400', 'var(--color-amber-900)'],       // 2次
  ['#ffd86a', 'var(--color-amber-300)'],       // 2次
  ['#a8c8ff', 'var(--color-blue-200)'],        // 2次
  ['#bae0ff', 'var(--color-blue-100)'],        // 2次
  ['#007f8c', 'var(--color-cyan-700)'],        // 2次
  ['#f9fbff', 'var(--color-slate-50)'],        // 2次
  ['#e6f0ff', 'var(--color-blue-50)'],         // 2次
  ['#003a8c', 'var(--color-blue-800)'],        // 2次
  ['#08979c', 'var(--color-cyan-600)'],        // 2次
  ['#ffc069', 'var(--color-amber-300)'],       // 2次
  ['#111d2c', 'var(--color-dark-bg)'],         // 2次
  ['#15325b', 'var(--color-ocean)'],           // 2次
  ['#8c6d1f', 'var(--color-amber-700)'],       // 2次
  ['#fef3c7', 'var(--color-amber-100)'],       // 2次
  ['#1a3a5c', 'var(--color-ocean-light)'],     // 2次
  ['#d0e8ff', 'var(--color-blue-100)'],        // 2次
  ['#444', 'var(--color-zinc-700)'],           // 2次
  ['#eee', 'var(--color-zinc-200)'],           // 2次
  ['#e8f3ff', 'var(--color-blue-50)'],         // 2次
  ['#e6fff0', 'var(--color-emerald-50)'],      // 2次
  ['#0b1020', 'var(--color-dark-bg)'],         // 2次
  ['#e6edf3', 'var(--color-slate-200)'],       // 2次
  ['#6366f1', 'var(--color-indigo-500)'],      // 2次
  ['#40a9ff', 'var(--color-primary-light)'],   // 2次
  ['#dce1e8', 'var(--color-slate-200)'],       // 2次
  ['#f00', 'var(--color-red-500)'],            // 2次 - shorthand
  ['#f7f8fa', 'var(--color-slate-50)'],        // 2次
  ['#ff6600', 'var(--color-orange-500)'],      // 2次
  ['#161823', 'var(--color-dark-bg)'],         // 2次
  ['#cc0000', 'var(--color-red-600)'],         // 2次
  ['#d40016', 'var(--color-red-700)'],         // 2次
  ['#cc2b2b', 'var(--color-red-600)'],         // 2次
  ['#818cf8', 'var(--color-indigo-400)'],      // 2次
  ['#5a6a7a', 'var(--color-slate-500)'],       // 2次
  ['#14b8a6', 'var(--color-teal-500)'],        // 2次
  ['#06b6d4', 'var(--color-cyan-500)'],        // 2次
  ['#5c9ab8', 'var(--color-blue-400)'],        // 2次
  ['#b0c4de', 'var(--color-blue-200)'],        // 2次
  ['#2a4455', 'var(--color-ocean-light)'],     // 2次
  ['#8ab4c8', 'var(--color-blue-300)'],        // 2次
  ['#7ddd5a', 'var(--color-emerald-400)'],     // 2次
  ['#ff8080', 'var(--color-red-300)'],         // 2次
  ['#5d92b0', 'var(--color-blue-400)'],        // 2次
  ['#b8d0e6', 'var(--color-blue-200)'],        // 2次
  ['#7f9db4', 'var(--color-slate-500)'],       // 2次
  ['#a9c4da', 'var(--color-blue-200)'],        // 2次
  ['#ff8f6b', 'var(--color-orange-400)'],      // 2次
  ['#5a8aa8', 'var(--color-blue-400)'],        // 2次
  ['#fadb14', 'var(--color-amber-400)'],       // 2次
  ['#79a8c7', 'var(--color-blue-300)'],        // 2次
  ['#eef1f4', 'var(--color-slate-100)'],       // 2次
  ['#123', 'var(--color-dark-bg)'],            // 2次 - shorthand
  ['#125', 'var(--color-blue-800)'],           // 2次 - shorthand
  ['#ff4500', 'var(--color-orange-500)'],      // 2次
  ['#ff2d2d', 'var(--color-red-500)'],         // 2次
  ['#f87171', 'var(--color-red-400)'],         // 3次（已有）

  // 额外高频补充（来自 GlobalSearchModal / xiaoyun-tokens 等文件）
  ['#3a6073', 'var(--color-ocean-lighter)'],
  ['#4a6a8a', 'var(--color-blue-400)'],
  ['#5c7a9a', 'var(--color-blue-400)'],
  ['#264653', 'var(--color-ocean)'],
  ['#2a3f5f', 'var(--color-ocean-light)'],
  ['#0c1220', 'var(--color-dark-bg)'],
  ['#0a0e1a', 'var(--color-dark-bg)'],
  ['#101522', 'var(--color-dark-bg)'],
  ['#1a2238', 'var(--color-dark-bg-3)'],
  ['#f2f4f5', 'var(--color-slate-100)'],
  ['#ebedf0', 'var(--color-slate-200)'],
  ['#e2e6ea', 'var(--color-slate-200)'],
  ['#d1d5db', 'var(--color-slate-300)'],
  ['#c7ced9', 'var(--color-slate-300)'],
  ['#9aa4b2', 'var(--color-slate-400)'],
  ['#6b7280', 'var(--color-slate-500)'],
  ['#4b5563', 'var(--color-slate-600)'],
  ['#374151', 'var(--color-slate-700)'],
  ['#1677ff', 'var(--color-primary)'],
  ['#69b1ff', 'var(--color-primary-light)'],
  ['#ffd666', 'var(--color-amber-300)'],
  ['#ffc53d', 'var(--color-amber-300)'],
  ['#f5a623', 'var(--color-amber-500)'],
  ['#ff7a45', 'var(--color-orange-400)'],
  ['#ff9c6e', 'var(--color-orange-300)'],
  ['#ffc2c7', 'var(--color-red-200)'],
  ['#ffa39e', 'var(--color-red-300)'],
  ['#ffcdd2', 'var(--color-red-200)'],
  ['#f8d7da', 'var(--color-red-200)'],
  ['#d3adf7', 'var(--color-purple-300)'],
  ['#e9d5ff', 'var(--color-purple-200)'],
  ['#d9c7f5', 'var(--color-purple-200)'],
  ['#096dd9', 'var(--color-primary)'],
  ['#0050b3', 'var(--color-blue-700)'],
  ['#003a8c', 'var(--color-blue-800)'],
  ['#002c66', 'var(--color-blue-900)'],
  ['#0062be', 'var(--color-blue-600)'],
  ['#4096ff', 'var(--color-primary-light)'],
  ['#bae7ff', 'var(--color-cyan-100)'],
  ['#87e8de', 'var(--color-cyan-200)'],
  ['#5cdbd3', 'var(--color-cyan-300)'],
  ['#36cfc9', 'var(--color-cyan-400)'],
  ['#13c2c2', 'var(--color-cyan-500)'],
  ['#08979c', 'var(--color-cyan-600)'],
  ['#006d75', 'var(--color-cyan-800)'],
  ['#11998e', 'var(--color-teal-600)'],
  ['#38ef7d', 'var(--color-emerald-400)'],
  ['#a8e6cf', 'var(--color-emerald-100)'],
  ['#dcedc8', 'var(--color-lime-100)'],
  ['#c5e1a5', 'var(--color-lime-200)'],
  ['#9ccc65', 'var(--color-lime-300)'],
  ['#7cb342', 'var(--color-lime-400)'],
  ['#558b2f', 'var(--color-lime-700)'],
  ['#33691e', 'var(--color-lime-800)'],
  ['#e6f0ff', 'var(--color-blue-50)'],
  ['#eff6ff', 'var(--color-blue-50)'],
  ['#f0f5ff', 'var(--color-blue-50)'],
  ['#f5f5f5', 'var(--color-slate-100)'],
  ['#f5f5dc', 'var(--color-amber-50)'],
  ['#f5f5f5', 'var(--color-slate-100)'],
  ['#f5f5f7', 'var(--color-slate-100)'],
  ['#f5f5fa', 'var(--color-slate-100)'],
  ['#f5f5fd', 'var(--color-slate-100)'],
  ['#f5f6fa', 'var(--color-slate-100)'],
  ['#f5f7fa', 'var(--color-slate-100)'],
  ['#f4f4f5', 'var(--color-zinc-100)'],
  ['#f4f4f5', 'var(--color-zinc-100)'],
  ['#f4f6f8', 'var(--color-slate-100)'],
  ['#f3f4f6', 'var(--color-slate-100)'],
  ['#f0f0f0', 'var(--color-zinc-200)'],
  ['#f0f2f5', 'var(--color-slate-100)'],
  ['#f0f2f5', 'var(--color-slate-100)'],
  ['#ececec', 'var(--color-zinc-200)'],
  ['#e8eaed', 'var(--color-slate-200)'],
  ['#e5e5e5', 'var(--color-zinc-200)'],
  ['#e5e7eb', 'var(--color-slate-200)'],
  ['#e0e0e0', 'var(--color-zinc-300)'],
  ['#e0e0e0', 'var(--color-zinc-300)'],
  ['#dcdcdc', 'var(--color-zinc-300)'],
  ['#dcdfe6', 'var(--color-slate-300)'],
  ['#d0d5dd', 'var(--color-slate-300)'],
  ['#c9cdd4', 'var(--color-slate-300)'],
  ['#bcc0c6', 'var(--color-slate-300)'],
  ['#b0b4bb', 'var(--color-slate-400)'],
  ['#a0a0a0', 'var(--color-zinc-400)'],
  ['#909399', 'var(--color-slate-500)'],
  ['#8b949e', 'var(--color-slate-500)'],
  ['#7b8794', 'var(--color-slate-500)'],
  ['#6b7280', 'var(--color-slate-500)'],
  ['#606266', 'var(--color-slate-600)'],
  ['#4a5568', 'var(--color-slate-600)'],
  ['#3d3d3d', 'var(--color-zinc-700)'],
  ['#303133', 'var(--color-zinc-700)'],
  ['#2c2c2c', 'var(--color-zinc-800)'],
  ['#1f2937', 'var(--color-slate-800)'],
  ['#1a1a1a', 'var(--color-slate-900)'],
  ['#0d1117', 'var(--color-slate-900)'],
  ['#111827', 'var(--color-slate-900)'],
  ['#111', 'var(--color-black)'],
  ['#0f172a', 'var(--color-slate-900)'],
  ['#000000', 'var(--color-black)'],
  ['#000', 'var(--color-black)'],
  ['#2d7ff9', 'var(--color-primary)'],
  ['#3b82f6', 'var(--color-blue-500)'],
  ['#2563eb', 'var(--color-blue-600)'],
  ['#1d4ed8', 'var(--color-blue-700)'],
  ['#1e40af', 'var(--color-blue-800)'],
  ['#1e3a8a', 'var(--color-blue-900)'],
  ['#60a5fa', 'var(--color-blue-400)'],
  ['#93c5fd', 'var(--color-blue-300)'],
  ['#bfdbfe', 'var(--color-blue-200)'],
  ['#dbeafe', 'var(--color-blue-100)'],
  ['#eff6ff', 'var(--color-blue-50)'],
  ['#fef3c7', 'var(--color-amber-100)'],
  ['#fde68a', 'var(--color-amber-200)'],
  ['#fcd34d', 'var(--color-amber-300)'],
  ['#fbbf24', 'var(--color-amber-400)'],
  ['#f59e0b', 'var(--color-amber-500)'],
  ['#d97706', 'var(--color-amber-600)'],
  ['#b45309', 'var(--color-amber-700)'],
  ['#92400e', 'var(--color-amber-800)'],
  ['#78350f', 'var(--color-amber-900)'],
  ['#fed7aa', 'var(--color-orange-200)'],
  ['#fdba74', 'var(--color-orange-300)'],
  ['#fb923c', 'var(--color-orange-400)'],
  ['#ea580c', 'var(--color-orange-600)'],
  ['#c2410c', 'var(--color-orange-700)'],
  ['#fed7aa', 'var(--color-orange-200)'],
  ['#fecaca', 'var(--color-red-200)'],
  ['#fca5a5', 'var(--color-red-300)'],
  ['#f87171', 'var(--color-red-400)'],
  ['#ef4444', 'var(--color-red-500)'],
  ['#dc2626', 'var(--color-red-600)'],
  ['#b91c1c', 'var(--color-red-700)'],
  ['#991b1b', 'var(--color-red-800)'],
  ['#7f1d1d', 'var(--color-red-900)'],
  ['#fbcfe8', 'var(--color-pink-200)'],
  ['#f9a8d4', 'var(--color-pink-300)'],
  ['#f472b6', 'var(--color-pink-400)'],
  ['#ec4899', 'var(--color-pink-500)'],
  ['#db2777', 'var(--color-pink-600)'],
  ['#c026d3', 'var(--color-fuchsia-600)'],
  ['#d946ef', 'var(--color-fuchsia-500)'],
  ['#a855f7', 'var(--color-purple-500)'],
  ['#c084fc', 'var(--color-purple-400)'],
  ['#d8b4fe', 'var(--color-purple-300)'],
  ['#e9d5ff', 'var(--color-purple-200)'],
  ['#faf5ff', 'var(--color-purple-100)'],
  ['#7c3aed', 'var(--color-violet-600)'],
  ['#8b5cf6', 'var(--color-violet-500)'],
  ['#06b6d4', 'var(--color-cyan-500)'],
  ['#0891b2', 'var(--color-cyan-600)'],
  ['#67e8f9', 'var(--color-cyan-300)'],
  ['#a5f3fc', 'var(--color-cyan-200)'],
  ['#cffafe', 'var(--color-cyan-100)'],
  ['#22d3ee', 'var(--color-cyan-400)'],
  ['#5eead4', 'var(--color-teal-300)'],
  ['#2dd4bf', 'var(--color-teal-400)'],
  ['#14b8a6', 'var(--color-teal-500)'],
  ['#0d9488', 'var(--color-teal-600)'],
  ['#115e59', 'var(--color-teal-800)'],
  ['#0f766e', 'var(--color-teal-700)'],
  ['#10b981', 'var(--color-emerald-500)'],
  ['#34d399', 'var(--color-emerald-400)'],
  ['#6ee7b7', 'var(--color-emerald-300)'],
  ['#a7f3d0', 'var(--color-emerald-200)'],
  ['#d1fae5', 'var(--color-emerald-100)'],
  ['#f0fdf4', 'var(--color-emerald-50)'],
  ['#059669', 'var(--color-emerald-600)'],
  ['#047857', 'var(--color-emerald-700)'],
  ['#065f46', 'var(--color-emerald-800)'],
  ['#064e3b', 'var(--color-emerald-900)'],
  ['#84cc16', 'var(--color-lime-500)'],
  ['#65a30d', 'var(--color-lime-600)'],
  ['#4d7c0f', 'var(--color-lime-700)'],
  ['#365314', 'var(--color-lime-800)'],
  ['#16a34a', 'var(--color-green-600)'],
  ['#15803d', 'var(--color-green-700)'],
  ['#166534', 'var(--color-green-800)'],
  ['#14532d', 'var(--color-green-900)'],
  ['#22c55e', 'var(--color-green-500)'],
  ['#4ade80', 'var(--color-green-400)'],
  ['#86efac', 'var(--color-green-300)'],
  ['#bbf7d0', 'var(--color-green-200)'],
  ['#dcfce7', 'var(--color-green-100)'],
  ['#f0fdf4', 'var(--color-green-50)'],
  ['#94a3b8', 'var(--color-slate-400)'],
  ['#64748b', 'var(--color-slate-500)'],
  ['#475569', 'var(--color-slate-600)'],
  ['#334155', 'var(--color-slate-700)'],
  ['#1e293b', 'var(--color-slate-800)'],
  ['#0f172a', 'var(--color-slate-900)'],
  ['#f8fafc', 'var(--color-slate-50)'],
  ['#f1f5f9', 'var(--color-slate-100)'],
  ['#e2e8f0', 'var(--color-slate-200)'],
  ['#cbd5e1', 'var(--color-slate-300)'],
  ['#71717a', 'var(--color-zinc-500)'],
  ['#52525b', 'var(--color-zinc-600)'],
  ['#3f3f46', 'var(--color-zinc-700)'],
  ['#27272a', 'var(--color-zinc-800)'],
  ['#18181b', 'var(--color-zinc-900)'],
  ['#fafafa', 'var(--color-zinc-50)'],
  ['#f4f4f5', 'var(--color-zinc-100)'],
  ['#e4e4e7', 'var(--color-zinc-200)'],
  ['#d4d4d8', 'var(--color-zinc-300)'],
  ['#a1a1aa', 'var(--color-zinc-400)'],
  ['#a3a3a3', 'var(--color-zinc-400)'],
  ['#737373', 'var(--color-zinc-500)'],
  ['#525252', 'var(--color-zinc-600)'],
  ['#404040', 'var(--color-zinc-700)'],
  ['#262626', 'var(--color-zinc-800)'],
  ['#171717', 'var(--color-zinc-900)'],
  ['#fafafa', 'var(--color-neutral-50)'],
  ['#f5f5f5', 'var(--color-neutral-100)'],
  ['#e5e5e5', 'var(--color-neutral-200)'],
  ['#d4d4d4', 'var(--color-neutral-300)'],
  ['#a3a3a3', 'var(--color-neutral-400)'],
  ['#737373', 'var(--color-neutral-500)'],
  ['#525252', 'var(--color-neutral-600)'],
  ['#404040', 'var(--color-neutral-700)'],
  ['#262626', 'var(--color-neutral-800)'],
  ['#171717', 'var(--color-neutral-900)'],
  ['#c0c0c0', 'var(--color-silver)'],
  ['#ffd700', 'var(--color-gold)'],
  ['#cd7f32', 'var(--color-bronze)'],
  ['#ff6b6b', 'var(--color-coral)'],
  ['#eb2f96', 'var(--color-magenta)'],
  ['#0b2d5c', 'var(--color-ocean)'],
  ['#2a4060', 'var(--color-ocean-light)'],
  ['#3a6080', 'var(--color-ocean-lighter)'],

  // 2026-08-01 新增：全量颜色覆盖（高频未映射 + 历史遗留色）
  ['#fff7e6', 'var(--color-amber-50)'],
  ['#ffe7ba', 'var(--color-amber-100)'],
  ['#fff1f0', 'var(--color-red-50)'],
  ['#fffbe6', 'var(--color-yellow-50)'],
  ['#fefce8', 'var(--color-yellow-50)'],
  ['#fcffe6', 'var(--color-lime-50)'],
  ['#f0f5ff', 'var(--color-indigo-50)'],
  ['#f8fbff', 'var(--color-sky-50)'],
  ['#dce9ff', 'var(--color-blue-100)'],
  ['#efdbff', 'var(--color-purple-50)'],
  ['#eef6ff', 'var(--color-blue-50)'],
  ['#f3faf6', 'var(--color-teal-50)'],
  ['#f6ffed', 'var(--color-lime-50)'],
  ['#d9f7be', 'var(--color-lime-100)'],
  ['#f9f0ff', 'var(--color-violet-50)'],
  ['#e6fffb', 'var(--color-teal-50)'],
  ['#fdfefe', 'var(--color-slate-50)'],
  ['#fffefe', 'var(--color-slate-50)'],
  ['#e1efff', 'var(--color-blue-100)'],
  ['#c0dbff', 'var(--color-blue-200)'],
  ['#e8ecff', 'var(--color-indigo-50)'],
  ['#dff7ff', 'var(--color-sky-50)'],
  ['#f5f7ff', 'var(--color-indigo-50)'],
  ['#ffd8d8', 'var(--color-red-200)'],
  ['#e8edf5', 'var(--color-slate-100)'],
  ['#d7dde7', 'var(--color-slate-200)'],
  ['#cfd8e3', 'var(--color-slate-200)'],
  ['#d6e8ff', 'var(--color-blue-100)'],
  ['#f0faf0', 'var(--color-emerald-50)'],
  ['#f3f5fb', 'var(--color-indigo-50)'],
  ['#f6f8fb', 'var(--color-slate-50)'],
  ['#f5f3ff', 'var(--color-violet-50)'],
  ['#f0f3f8', 'var(--color-slate-100)'],
  ['#edf2ff', 'var(--color-blue-50)'],
  ['#e0e4eb', 'var(--color-slate-200)'],
  ['#f3e8ff', 'var(--color-purple-50)'],
  ['#edf3fb', 'var(--color-blue-50)'],
  ['#f9f9f9', 'var(--color-slate-50)'],
  ['#f6f8f9', 'var(--color-slate-50)'],
  ['#f7f7f7', 'var(--color-slate-50)'],
  ['#fffbe6', 'var(--color-yellow-50)'],
  ['#ffd8bf', 'var(--color-orange-200)'],
  ['#ffbb96', 'var(--color-orange-300)'],
  ['#ffbb6e', 'var(--color-amber-200)'],
  ['#ffd4b8', 'var(--color-orange-200)'],
  ['#ff9900', 'var(--color-amber-500)'],
  ['#ff7a45', 'var(--color-orange-400)'],
  ['#ff0000', 'var(--color-red-500)'],
  ['#ff4400', 'var(--color-orange-500)'],
  ['#ff0036', 'var(--color-rose-500)'],
  ['#96bf48', 'var(--color-lime-500)'],
  ['#389e0d', 'var(--color-lime-600)'],
  ['#73d13d', 'var(--color-lime-400)'],
  ['#d48806', 'var(--color-yellow-600)'],
  ['#4a6cf7', 'var(--color-indigo-500)'],
  ['#2f54eb', 'var(--color-indigo-600)'],
  ['#0066cc', 'var(--color-blue-600)'],
  ['#1f5fcb', 'var(--color-blue-600)'],
  ['#003eb3', 'var(--color-blue-800)'],
  ['#85b8ff', 'var(--color-blue-200)'],
  ['#5a9cff', 'var(--color-blue-300)'],
  ['#5aa8ff', 'var(--color-blue-300)'],
  ['#8fd0ff', 'var(--color-sky-200)'],
  ['#4fc3f7', 'var(--color-sky-400)'],
  ['#0369a1', 'var(--color-sky-700)'],
  ['#0ea5e9', 'var(--color-sky-500)'],
  ['#85a5ff', 'var(--color-indigo-200)'],
  ['#adc6ff', 'var(--color-indigo-200)'],
  ['#d6e4ff', 'var(--color-indigo-100)'],
  ['#f0f4ff', 'var(--color-indigo-50)'],
  ['#d9e7ff', 'var(--color-indigo-100)'],
  ['#434343', 'var(--color-slate-700)'],
  ['#141414', 'var(--color-slate-900)'],
  ['#1e1e1e', 'var(--color-slate-900)'],
  ['#303030', 'var(--color-slate-800)'],
  ['#3a3a3a', 'var(--color-slate-800)'],
  ['#162312', 'var(--color-slate-900)'],
  ['#274916', 'var(--color-emerald-900)'],
  ['#355f1b', 'var(--color-lime-800)'],
  ['#1b5e20', 'var(--color-green-800)'],
  ['#23272f', 'var(--color-slate-900)'],
  ['#030916', 'var(--color-slate-900)'],
  ['#060c1a', 'var(--color-slate-900)'],
  ['#08101d', 'var(--color-slate-900)'],
  ['#081229', 'var(--color-slate-900)'],
  ['#0b1424', 'var(--color-slate-900)'],
  ['#0a1829', 'var(--color-slate-900)'],
  ['#0d1e35', 'var(--color-slate-900)'],
  ['#0d1b35', 'var(--color-blue-900)'],
  ['#1e1b4b', 'var(--color-indigo-900)'],
  ['#2e1065', 'var(--color-purple-900)'],
  ['#6b7895', 'var(--color-slate-500)'],
  ['#5c6b8a', 'var(--color-slate-600)'],
  ['#4a5a7a', 'var(--color-slate-700)'],
  ['#314659', 'var(--color-slate-800)'],
  ['#22384a', 'var(--color-slate-800)'],
  ['#8a96a6', 'var(--color-slate-400)'],
  ['#8ab4cc', 'var(--color-sky-400)'],
  ['#6fb3a0', 'var(--color-teal-400)'],
  ['#9dc8de', 'var(--color-sky-200)'],
  ['#88bcd5', 'var(--color-sky-300)'],
  ['#7fdfff', 'var(--color-sky-200)'],
  ['#6e9ab0', 'var(--color-sky-500)'],
  ['#5c9abf', 'var(--color-sky-600)'],
  ['#b8d8e8', 'var(--color-sky-200)'],
  ['#b8cce0', 'var(--color-slate-300)'],
  ['#9ab0c4', 'var(--color-slate-400)'],
  ['#b0c8d8', 'var(--color-sky-300)'],
  ['#a8b2be', 'var(--color-slate-400)'],
  ['#c4b5fd', 'var(--color-purple-200)'],
  ['#9d87c0', 'var(--color-purple-400)'],
  ['#8c78b1', 'var(--color-violet-400)'],
  ['#7c4a05', 'var(--color-amber-900)'],
  ['#873800', 'var(--color-amber-900)'],
  ['#8c6e00', 'var(--color-amber-800)'],
  ['#ad4e00', 'var(--color-orange-700)'],
  ['#f5c451', 'var(--color-amber-400)'],
  ['#f5e08e', 'var(--color-amber-200)'],
  ['#3d2d00', 'var(--color-amber-900)'],
  ['#ad1457', 'var(--color-pink-700)'],
  ['#9d174d', 'var(--color-pink-800)'],
  ['#b71c1c', 'var(--color-red-800)'],
  ['#d84315', 'var(--color-orange-700)'],
  ['#e65100', 'var(--color-orange-700)'],
  ['#6a1b9a', 'var(--color-purple-800)'],
  ['#4a148c', 'var(--color-purple-900)'],
  ['#311b92', 'var(--color-indigo-900)'],
  ['#1a237e', 'var(--color-indigo-900)'],
  ['#0d47a1', 'var(--color-blue-900)'],
  ['#1565c0', 'var(--color-blue-800)'],
  ['#5d4037', 'var(--color-amber-900)'],
  ['#4e342e', 'var(--color-amber-900)'],
  ['#5a9a6a', 'var(--color-emerald-700)'],
  ['#66907b', 'var(--color-emerald-600)'],
  ['#3ab870', 'var(--color-emerald-500)'],
  ['#00838f', 'var(--color-cyan-700)'],
  ['#00897b', 'var(--color-teal-700)'],
  ['#0098aa', 'var(--color-teal-600)'],
  ['#36cfc9', 'var(--color-teal-400)'],
  ['#7ab8d8', 'var(--color-sky-500)'],
  ['#d7ecf8', 'var(--color-sky-50)'],
  ['#e0e6f5', 'var(--color-indigo-100)'],
  ['#3a5ea7', 'var(--color-blue-700)'],
  ['#2f5fa8', 'var(--color-blue-800)'],
  ['#5c5c5c', 'var(--color-slate-600)'],
  ['#c8d0db', 'var(--color-slate-300)'],
  ['#a0aab4', 'var(--color-slate-400)'],
  ['#8b8b8b', 'var(--color-slate-500)'],
  ['#9a9a9a', 'var(--color-slate-400)'],
  ['#c8d8e8', 'var(--color-slate-300)'],
  ['#e6e8f0', 'var(--color-slate-200)'],
  ['#e6e6e6', 'var(--color-slate-200)'],
  ['#b0b2be', 'var(--color-slate-400)'],
  ['#a0aec0', 'var(--color-slate-400)'],
  ['#b8a0f0', 'var(--color-violet-300)'],
  ['#c4aff8', 'var(--color-violet-300)'],
  ['#5a6678', 'var(--color-slate-600)'],
  ['#6789ab', 'var(--color-slate-500)'],
  ['#5d73af', 'var(--color-slate-600)'],
  ['#6a84ca', 'var(--color-blue-500)'],
  ['#1a2d42', 'var(--color-slate-800)'],
  ['#2a1215', 'var(--color-red-900)'],
  ['#58181c', 'var(--color-red-900)'],
  ['#2b2111', 'var(--color-amber-900)'],
  ['#594214', 'var(--color-amber-800)'],
  ['#6b3410', 'var(--color-amber-900)'],
  ['#8b4513', 'var(--color-amber-800)'],
  ['#718096', 'var(--color-slate-500)'],
  ['#2d3748', 'var(--color-slate-800)'],
  ['#b0bec5', 'var(--color-slate-300)'],
  ['#7dd3fc', 'var(--color-sky-300)'],
  ['#ff5f5f', 'var(--color-rose-400)'],
  ['#fe2c55', 'var(--color-rose-500)'],
  ['#ffc247', 'var(--color-amber-400)'],
  ['#63d97a', 'var(--color-emerald-400)'],
  ['#d8f1ff', 'var(--color-sky-50)'],
  ['#f2fbff', 'var(--color-sky-50)'],
  ['#d7efff', 'var(--color-sky-50)'],
  ['#8cccf2', 'var(--color-sky-300)'],
  ['#76a7c4', 'var(--color-sky-500)'],
  ['#6283a8', 'var(--color-slate-500)'],
  ['#7a8da0', 'var(--color-slate-500)'],
  ['#edf6f0', 'var(--color-emerald-50)'],
  ['#e8d8d0', 'var(--color-amber-100)'],
  ['#f8efea', 'var(--color-orange-50)'],
  ['#f7f1e8', 'var(--color-amber-50)'],
  ['#b17a7a', 'var(--color-rose-300)'],
  ['#f8ecec', 'var(--color-rose-50)'],
  ['#f8fffe', 'var(--color-teal-50)'],
  ['#fbfff7', 'var(--color-lime-50)'],
  ['#fcfaff', 'var(--color-violet-50)'],
  ['#ffc53d', 'var(--color-amber-400)'],
  ['#00695c', 'var(--color-teal-800)'],
  ['#e6ffe6', 'var(--color-green-100)'],
  ['#f4f7fb', 'var(--color-slate-50)'],
  ['#748ffc', 'var(--color-indigo-400)'],
  ['#c00', 'var(--color-red-500)'],

  // 2026-08-01 第二轮补充：扫描发现的剩余31个未映射色
  ['#e6f4ff', 'var(--color-sky-100)'],
  ['#fafafe', 'var(--color-slate-50)'],
  ['#fdf4ff', 'var(--color-fuchsia-50)'],
  ['#f2edf9', 'var(--color-violet-50)'],
  ['#e7edf5', 'var(--color-slate-100)'],
  ['#d9f4ff', 'var(--color-sky-100)'],
  ['#6f82a8', 'var(--color-slate-500)'],
  ['#fbfcfe', 'var(--color-slate-50)'],
  ['#dde1e8', 'var(--color-slate-200)'],
  ['#fafbfc', 'var(--color-slate-50)'],
  ['#8a9aaa', 'var(--color-slate-400)'],
  ['#880e4f', 'var(--color-pink-800)'],
  ['#7a8999', 'var(--color-slate-500)'],
  ['#7e9fb7', 'var(--color-slate-500)'],
  ['#78aeca', 'var(--color-sky-500)'],
  ['#7f9bb2', 'var(--color-slate-500)'],
  ['#8ab0c8', 'var(--color-sky-400)'],
  ['#6a8fa8', 'var(--color-slate-500)'],
  ['#5f8ca7', 'var(--color-slate-600)'],
  ['#90c0d4', 'var(--color-sky-300)'],
  ['#6a9aaa', 'var(--color-teal-500)'],
  ['#6b7fa8', 'var(--color-slate-500)'],
  ['#5b21b6', 'var(--color-violet-700)'],
  ['#f6f6f6', 'var(--color-slate-50)'],
  ['#b08773', 'var(--color-amber-300)'],
  ['#a88a66', 'var(--color-amber-300)'],
  ['#dff3ff', 'var(--color-sky-50)'],
  ['#4285f4', 'var(--color-blue-500)'],
  ['#e8eaf0', 'var(--color-slate-100)'],
  ['#f4f7ff', 'var(--color-indigo-50)'],
  ['#f7f8f9', 'var(--color-slate-50)'],
];

// 构建 Map（统一小写 key，便于大小写不敏感查找）
const COLOR_MAP = new Map();
for (const [color, varName] of COLOR_MAP_RAW) {
  COLOR_MAP.set(color.toLowerCase(), varName);
}

// 白色特殊处理
const WHITE_MAP_RAW = [
  ['#ffffff', 'var(--color-bg-base)'],
  ['#fff', 'var(--color-bg-base)'],
];
const WHITE_MAP = new Map();
for (const [color, varName] of WHITE_MAP_RAW) {
  WHITE_MAP.set(color.toLowerCase(), varName);
}

// 白色特殊处理
const WHITE_MAP_ENTRIES = [
  ['#ffffff', 'var(--color-bg-base)'],
  ['#FFFFFF', 'var(--color-bg-base)'],
  ['#fff', 'var(--color-bg-base)'],
  ['#FFF', 'var(--color-bg-base)'],
];

// 合并到 WHITE_MAP（小写 key）
for (const [color, varName] of WHITE_MAP_ENTRIES) {
  WHITE_MAP.set(color.toLowerCase(), varName);
}

// 必须保留的颜色（渐变色终点/霓虹色/KPI警示色）
const PROTECTED_COLORS = new Set([
  '#00e5ff', '#39ff14', '#7c4dff', '#00bcd4', '#f7a600',
]);

// 不参与替换的文件
const SKIP_FILES = new Set(['design-system.css', 'global.css']);

// 扫描所有 .css/.tsx/.jsx/.ts 文件
function scanFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...scanFiles(fullPath));
    } else if (/\.(css|tsx|jsx|ts)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

// 处理单个文件
function processFile(filepath) {
  const basename = path.basename(filepath);
  if (SKIP_FILES.has(basename)) return { total: 0, replaced: 0, protected: 0, skipped: true };

  let content;
  try {
    content = fs.readFileSync(filepath, 'utf-8');
  } catch {
    return { total: 0, replaced: 0, protected: 0, skipped: true };
  }

  // 统计硬编码颜色（3位和6位hex）
  // Hex格式: #fff, #ffffff, #FFFFFFFF(带alpha但只取前6位), #fff(3位)
  // 策略: 匹配3位或6位hex，后面不能再跟hex字符（防止匹配更长的hex值）
  const hexPattern = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?!([0-9a-fA-F]))/g;
  const matches = [...content.matchAll(hexPattern)];
  if (matches.length === 0) return { total: 0, replaced: 0, protected: 0, skipped: false };

  let total = matches.length;
  let protectedCount = 0;
  let replaceableCount = 0;

  // 先统计，用于 dry-run
  for (const match of matches) {
    const colorLower = match[0].toLowerCase();
    if (PROTECTED_COLORS.has(colorLower)) {
      protectedCount++;
      continue;
    }
    // 检查所在行是否包含 gradient
    const lineStart = content.lastIndexOf('\n', match.index) + 1;
    const lineEnd = content.indexOf('\n', match.index);
    const line = content.substring(lineStart, lineEnd === -1 ? undefined : lineEnd);
    if (/gradient\s*\(/i.test(line)) continue;

    const varName = COLOR_MAP.get(colorLower) || WHITE_MAP.get(colorLower);
    if (varName) replaceableCount++;
  }

  if (DRY_RUN) {
    return { total, replaced: replaceableCount, protected: protectedCount, skipped: false };
  }

  // 执行替换：按行处理
  const lines = content.split('\n');
  let replacedCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 跳过含 gradient 的行（保护渐变中的颜色）
    if (/gradient\s*\(/i.test(line)) continue;

    let newLine = line;
    const lineMatches = [...line.matchAll(hexPattern)];

    // 从后向前替换，避免位置偏移
    for (let j = lineMatches.length - 1; j >= 0; j--) {
      const m = lineMatches[j];
      const colorLower = m[0].toLowerCase();
      if (PROTECTED_COLORS.has(colorLower)) continue;

      const varName = COLOR_MAP.get(colorLower) || WHITE_MAP.get(colorLower);
      if (!varName) continue;

      newLine = newLine.substring(0, m.index) + varName + newLine.substring(m.index + m[0].length);
      replacedCount++;
    }

    lines[i] = newLine;
  }

  const newContent = lines.join('\n');
  if (newContent !== content) {
    try {
      fs.writeFileSync(filepath, newContent, 'utf-8');
    } catch (e) {
      console.error(`  ⚠️  写入失败 ${filepath}: ${e.message}`);
      return { total, replaced: 0, protected: protectedCount, skipped: false };
    }
  }

  return { total, replaced: replacedCount, protected: protectedCount, skipped: false };
}

// 主函数
console.log('='.repeat(60));
console.log(`  前端硬编码颜色审计${DRY_RUN ? '（扫描模式）' : ' + 替换'}`);
console.log('='.repeat(60));

const files = scanFiles(FRONTEND_SRC);
console.log(`\n扫描文件数: ${files.length}`);

let totalColors = 0;
let totalReplaced = 0;
let totalProtected = 0;
let filesWithColors = 0;
const colorDist = new Map();

for (const filepath of files) {
  const result = processFile(filepath);
  if (result.total > 0) {
    filesWithColors++;
    totalColors += result.total;
    totalReplaced += result.replaced;
    totalProtected += result.protected;
  }
  if (VERBOSE && result.total > 0 && !result.skipped) {
    const rel = path.relative('.', filepath);
    console.log(`  ${rel}: ${result.total} 处, 替换 ${result.replaced}, 保护 ${result.protected}`);
  }
}

console.log(`\n--- 审计结果 ---`);
console.log(`  含硬编码颜色的文件: ${filesWithColors}`);
console.log(`  硬编码颜色总数: ${totalColors}`);
console.log(`  ${DRY_RUN ? '可替换为 CSS 变量' : '已替换为 CSS 变量'}: ${totalReplaced}`);
console.log(`  保护色（渐变/霓虹/KPI）: ${totalProtected}`);
console.log(`  剩余不可替换: ${totalColors - totalReplaced - totalProtected}`);

if (DRY_RUN) {
  console.log(`\nℹ️  只扫描未替换。去掉 --dry-run 执行替换。`);
} else {
  console.log(`\n✅ 已替换 ${totalReplaced} 处硬编码颜色为 CSS 变量`);
}
console.log('='.repeat(60));
