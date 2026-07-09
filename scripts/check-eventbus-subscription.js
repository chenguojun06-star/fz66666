#!/usr/bin/env node
/**
 * eventBus 订阅检查脚本（CI gate 基础）
 *
 * 用途：扫描小程序所有页面 index.js，检查 eventBus 订阅/取消订阅是否成对出现，
 *       防止内存泄漏（订阅了但 onUnload 未取消）和跨页面不刷新（展示业务数据但未订阅）。
 *
 * 用法：
 *   node scripts/check-eventbus-subscription.js            # 普通模式（错误阻断，警告不阻断）
 *   node scripts/check-eventbus-subscription.js --strict    # 严格模式（警告也阻断）
 *
 * 退出码：
 *   0 — 无错误（普通模式下警告不阻断；严格模式下警告也会返回 1）
 *   1 — 存在错误（订阅未取消 = 内存泄漏）；--strict 下存在警告同样返回 1
 *
 * 检查规则：
 *   ✅ 正常：已订阅事件 + onUnload 已取消订阅（含间接调用 this._xxx() 链路）
 *   ⚠️ 警告：展示业务数据但未订阅事件（跨页面可能不刷新）
 *   ❌ 错误：订阅了事件但 onUnload 未取消（内存泄漏）
 *
 * 检测的订阅模式：
 *   - bindPageEvents(this, ...)        ← pageEventBinder 工具（默认订阅 2 个事件）
 *   - eventBus.on(eventName, ...)      ← 直接调用
 *
 * 检测的取消订阅模式：
 *   - unbindPageEvents(this)           ← pageEventBinder 工具
 *   - eventBus.off(eventName, ...)     ← 直接调用
 *   - this._xxx()                      ← 调用 eventBus.on/bindPageEvents/onDataRefresh 返回的取消订阅函数
 *   - 间接调用：onUnload 调用 this._xxx()，而 _xxx 方法内含上述任一模式（多层间接 + 环路保护）
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ==================== 配置 ====================

// 业务数据关键词（用于判断页面是否展示业务数据）
// 已排除 JS 保留字（如 return）和过于通用的词
const BUSINESS_KEYWORDS = [
  'order', 'scan', 'stock', 'task', 'quality', 'warehouse',
  'payment', 'payroll', 'shipment', 'defect', 'production',
  'cutting', 'bundle', 'procurement', 'finance', 'sample',
  'material', 'inbound', 'outbound', 'dashboard',
];

// 订阅/取消订阅的正则（对已去注释内容使用）
const RE_BINDER_CALL = /\bbindPageEvents\s*\(/g;
const RE_BUS_ON = /\beventBus\s*\.\s*on\s*\(/g;
const RE_UNBIND_CALL = /\bunbindPageEvents\s*\(/;
const RE_BUS_OFF = /\beventBus\s*\.\s*off\s*\(/;

// ==================== 词法工具 ====================

/**
 * 去除 JS 源码中的注释（行注释 // 与块注释 /* *\/），保留字符串内容。
 * 用于后续模式匹配，避免注释中的文字干扰判断。
 */
function stripComments(content) {
  let out = '';
  let i = 0;
  let inStr = false, strCh = '', esc = false;
  while (i < content.length) {
    const ch = content[i];
    const next = content[i + 1];
    if (esc) { out += ch; esc = false; i++; continue; }
    if (inStr) {
      out += ch;
      if (ch === '\\') { esc = true; }
      else if (ch === strCh) { inStr = false; }
      i++; continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = true; strCh = ch; out += ch; i++; continue; }
    if (ch === '/' && next === '/') { // 行注释
      while (i < content.length && content[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') { // 块注释
      i += 2;
      while (i < content.length && !(content[i] === '*' && content[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * 从 openIndex（指向开括号 ( [ { 之一）开始，匹配到对应闭括号，返回含两侧括号的子串。
 * 内部正确处理字符串转义与任意嵌套括号。
 */
function matchDelimiters(content, openIndex) {
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const close = pairs[content[openIndex]];
  if (!close) return null;
  let depth = 0;
  let inStr = false, strCh = '', esc = false;
  for (let i = openIndex; i < content.length; i++) {
    const ch = content[i];
    if (esc) { esc = false; continue; }
    if (inStr) {
      if (ch === '\\') { esc = true; continue; }
      if (ch === strCh) { inStr = false; }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = true; strCh = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) return content.substring(openIndex, i + 1);
    }
  }
  return null;
}

/**
 * 按顶层逗号分割字符串（忽略字符串与嵌套括号内的逗号）。
 */
function splitTopLevelCommas(str) {
  const args = [];
  let depth = 0, start = 0;
  let inStr = false, strCh = '', esc = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (esc) { esc = false; continue; }
    if (inStr) {
      if (ch === '\\') { esc = true; continue; }
      if (ch === strCh) { inStr = false; }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = true; strCh = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) {
      args.push(str.substring(start, i));
      start = i + 1;
    }
  }
  args.push(str.substring(start));
  return args;
}

/**
 * 在 content 中提取指定方法名的函数体（含外层花括号）。
 * 支持：methodName: function() { ... } / methodName() { ... } / methodName: () => { ... }
 */
function extractMethodBody(content, methodName) {
  const escaped = methodName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp('\\b' + escaped + '\\s*:\\s*function\\s*\\([^)]*\\)\\s*\\{'),
    new RegExp('\\b' + escaped + '\\s*\\([^)]*\\)\\s*\\{'),
    new RegExp('\\b' + escaped + '\\s*:\\s*\\([^)]*\\)\\s*=>\\s*\\{'),
  ];
  for (const pat of patterns) {
    const m = pat.exec(content);
    if (m) {
      const braceIdx = m.index + m[0].lastIndexOf('{');
      return matchDelimiters(content, braceIdx);
    }
  }
  return null;
}

/**
 * 扫描文件中赋值为「取消订阅函数」的实例变量名集合。
 * 命中模式（同一语句内，不跨分号/换行）：
 *   this._xxx = eventBus.on(...)
 *   this._xxx = bindPageEvents(...)
 *   this._xxx = onDataRefresh(...)
 *   this._xxx = eventBus && eventBus.on(...)   （条件赋值）
 */
function findUnsubVariables(content) {
  const vars = new Set();
  const sources = [
    /this\.(_?\w+)\s*=\s*[^;\n]*?eventBus\s*\.\s*on\s*\(/g,
    /this\.(_?\w+)\s*=\s*[^;\n]*?\bbindPageEvents\s*\(/g,
    /this\.(_?\w+)\s*=\s*[^;\n]*?\bonDataRefresh\s*\(/g,
  ];
  for (let s = 0; s < sources.length; s++) {
    const re = sources[s];
    let m;
    while ((m = re.exec(content)) !== null) vars.add(m[1]);
  }
  return vars;
}

/**
 * 判断某段函数体内（或经 this._xxx() 间接调用的方法体内）是否包含取消订阅调用。
 * 支持多层间接调用，visited 集合防止环路。unsubVars 为已知的取消订阅函数变量名集合。
 */
function bodyUnbinds(content, body, unsubVars, visited) {
  if (!body) return false;
  if (visited == null) visited = new Set();
  // 直接命中：unbindPageEvents( 或 eventBus.off(
  if (RE_UNBIND_CALL.test(body) || RE_BUS_OFF.test(body)) return true;
  // 间接：查找 body 内所有 this.xxx( 调用
  const callRe = /this\.(_?\w+)\s*\(/g;
  let m;
  while ((m = callRe.exec(body)) !== null) {
    const name = m[1];
    // 若调用的正是 eventBus.on/bindPageEvents 返回的取消订阅函数，视为已取消
    if (unsubVars && unsubVars.has(name)) return true;
    if (visited.has(name)) continue;
    visited.add(name);
    const inner = extractMethodBody(content, name);
    if (inner && bodyUnbinds(content, inner, unsubVars, visited)) return true;
  }
  return false;
}

/**
 * 统计 bindPageEvents 调用订阅的事件数。
 * 每次 bindPageEvents 默认订阅 2 个（DATA_CHANGED + REFRESH_ALL），
 * 若第三个参数是数组字面量，加上其中字符串字面量数量。
 */
function countBinderEvents(content) {
  let total = 0;
  const re = new RegExp(RE_BINDER_CALL.source, 'g');
  let m;
  while ((m = re.exec(content)) !== null) {
    const parenIdx = m.index + m[0].length - 1; // 指向 '('
    const callText = matchDelimiters(content, parenIdx);
    let extra = 0;
    if (callText) {
      const args = splitTopLevelCommas(callText.slice(1, -1));
      if (args.length >= 3) {
        const third = args[2].trim();
        if (third.charAt(0) === '[') {
          const strings = third.match(/'[^']*'|"[^"]*"/g);
          extra = strings ? strings.length : 0;
        }
      }
    }
    total += 2 + extra;
  }
  return total;
}

/**
 * 统计 eventBus.on( 调用次数。
 */
function countDirectOn(content) {
  const re = new RegExp(RE_BUS_ON.source, 'g');
  let count = 0;
  while (re.exec(content) !== null) count++;
  return count;
}

// ==================== 文件分析 ====================

/**
 * 判断页面是否展示业务数据：含业务关键词 且 有 setData/api 调用。
 */
function displaysBusinessData(content) {
  const hasKeyword = BUSINESS_KEYWORDS.some(function (kw) {
    return new RegExp('\\b' + kw + '\\b', 'i').test(content);
  });
  if (!hasKeyword) return false;
  return /\bsetData\s*\(/.test(content) || /\bapi\s*\.\s*\w+/.test(content);
}

/**
 * 分析单个 index.js 文件，返回 { status, displayPath, subscribed, reason }
 *   status: 'ok' | 'warn' | 'error' | 'skip'
 */
function analyzeFile(absPath, projectRoot) {
  const raw = fs.readFileSync(absPath, 'utf8');
  const content = stripComments(raw); // 去注释后再做模式匹配
  const relPath = path.relative(projectRoot, absPath).replace(/\\/g, '/');
  const displayPath = relPath.replace(/^miniprogram\//, '');

  const binderCount = countBinderEvents(content);
  const onCount = countDirectOn(content);
  const subscribed = binderCount + onCount;
  const isSubscribed = subscribed > 0;

  // 预扫描：收集赋值为取消订阅函数的实例变量名
  const unsubVars = findUnsubVariables(content);

  // onUnload 是否存在且包含取消订阅（含间接调用 + 取消订阅函数变量）
  const onUnloadBody = extractMethodBody(content, 'onUnload');
  const onUnloadUnbinds = onUnloadBody ? bodyUnbinds(content, onUnloadBody, unsubVars) : false;

  if (isSubscribed) {
    if (onUnloadBody && onUnloadUnbinds) {
      return { status: 'ok', displayPath: displayPath, subscribed: subscribed, reason: '' };
    }
    const reason = !onUnloadBody
      ? '订阅了事件但缺少 onUnload（无法取消订阅）'
      : '订阅了事件但 onUnload 未取消（内存泄漏）';
    return { status: 'error', displayPath: displayPath, subscribed: subscribed, reason: reason };
  }

  // 未订阅
  if (displaysBusinessData(content)) {
    return { status: 'warn', displayPath: displayPath, subscribed: 0, reason: '展示业务数据但未订阅事件' };
  }
  return { status: 'skip', displayPath: displayPath, subscribed: 0, reason: '' };
}

// ==================== 目录遍历 ====================

/**
 * 递归收集 baseDir 下所有名为 index.js 的文件绝对路径。
 */
function collectIndexJs(baseDir) {
  const results = [];
  let entries = [];
  try {
    entries = fs.readdirSync(baseDir, { withFileTypes: true });
  } catch (e) {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(baseDir, entry.name);
    if (entry.isDirectory()) {
      results.push.apply(results, collectIndexJs(full));
    } else if (entry.isFile() && entry.name === 'index.js') {
      results.push(full);
    }
  }
  return results;
}

// ==================== 主流程 ====================

function main() {
  const strict = process.argv.indexOf('--strict') !== -1;
  const projectRoot = path.resolve(__dirname, '..');
  const pagesDir = path.join(projectRoot, 'miniprogram', 'pages');

  console.log('[eventBus 订阅检查] 扫描 ' + pagesDir.replace(projectRoot + path.sep, '') + ' ...\n');

  if (!fs.existsSync(pagesDir)) {
    console.error('[错误] 未找到目录: ' + pagesDir);
    process.exit(1);
  }

  const files = collectIndexJs(pagesDir);
  if (files.length === 0) {
    console.log('未找到任何 index.js 文件。');
    process.exit(0);
  }

  const results = files.map(function (f) { return analyzeFile(f, projectRoot); });
  // 按路径排序，输出可预期
  results.sort(function (a, b) {
    return a.displayPath < b.displayPath ? -1 : (a.displayPath > b.displayPath ? 1 : 0);
  });

  const okList = [], warnList = [], errorList = [];
  results.forEach(function (r) {
    if (r.status === 'ok') okList.push(r);
    else if (r.status === 'warn') warnList.push(r);
    else if (r.status === 'error') errorList.push(r);
  });

  // 逐行输出（错误优先，其次警告，最后正常；同组内按路径序）
  errorList.forEach(function (r) {
    console.log('❌ ' + r.displayPath + ' - ' + r.reason);
  });
  warnList.forEach(function (r) {
    console.log('⚠️  ' + r.displayPath + ' - ' + r.reason);
  });
  okList.forEach(function (r) {
    console.log('✅ ' + r.displayPath + ' - 已订阅' + r.subscribed + '个事件，onUnload 已取消');
  });

  // 汇总
  const reported = okList.length + warnList.length + errorList.length;
  console.log('\n总计：' + reported + ' 个页面（跳过 ' + (results.length - reported) + ' 个非业务页面）');
  console.log('✅ 正常：' + okList.length);
  console.log('⚠️  警告：' + warnList.length);
  console.log('❌ 错误：' + errorList.length);

  // 退出码
  if (errorList.length > 0) {
    console.log('\n[错误] 发现 ' + errorList.length + ' 个内存泄漏风险，请修复后再提交！');
    process.exit(1);
  }
  if (strict && warnList.length > 0) {
    console.log('\n[严格模式] 发现 ' + warnList.length + ' 个警告，请订阅事件后再提交！');
    process.exit(1);
  }
  process.exit(0);
}

main();
