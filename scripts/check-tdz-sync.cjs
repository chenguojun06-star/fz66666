/**
 * check-tdz-sync.cjs —— 检测「TDZ 高危」：引用处在**同步执行位置**、而目标 const/let
 * 在同一作用域中更晚才声明。
 *
 * 为什么需要它（事故背景，2026-10-20）：
 *   顾客点「报价单打印」白屏，控制台
 *     ReferenceError: Cannot access 'y' before initialization
 *   根因是 processRows 的 .map() 回调（立即执行）用了后面才声明的 FS_SMALL。
 *
 * 为什么 ESLint 现成的 no-use-before-define 不够：
 *   它把 166 处全报出来，其中 160 处是**不会崩的安全形态**
 *   （React 组件写在下面、useEffect 回调、事件处理器、TS 类型引用）。
 *   噪音一大就没人看了，所以本规则只报**真的会抛错**的那一类。
 *
 * 判定（保守但准确）：
 *   从引用点向上走到「声明所在的作用域」：
 *     ① 途中没有经过任何函数            → 危险（同一函数体内、声明前的同步语句）
 *     ② 经过的函数是**立即执行的数组方法**的回调（.map/.filter/.forEach/.reduce...）
 *                                        → 危险
 *     ③ 经过的函数是 useEffect / 事件处理器 / useCallback / 赋值给变量
 *                                        → 安全（渲染后或交互后才跑，那时已过声明行）
 *     ④ var / function 声明              → 安全（有提升，无死区）
 *
 * 用法：
 *   node scripts/check-tdz-sync.cjs          # 扫 src/，有高危则退出码 1
 *   node scripts/check-tdz-sync.cjs --list   # 额外打印全部命中（含安全形态，供审查）
 */

const fs = require('fs');
const path = require('path');
// 依赖装在 frontend/ 下：脚本放仓库根会 require 不到，必须显式指过去
// （这与"脚本放 /tmp 找不到 node_modules"是同一个坑）。
// 依赖装在 frontend/ 下。必须用 createRequire 从 frontend 目录解析 ——
// 直接拼 node_modules/@typescript-eslint/parser 会失败（真实目录名带版本后缀），
// 而且"脚本放 /tmp 找不到 node_modules"也是同一类坑。
const FRONTEND = path.join(__dirname, '..', 'frontend');
const { createRequire } = require('module');
const frontendRequire = createRequire(path.join(FRONTEND, 'package.json'));
const { Linter } = frontendRequire('eslint');
const tsParser = frontendRequire('@typescript-eslint/parser');

const SRC = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..', 'frontend', 'src');
const LIST_ALL = process.argv.includes('--list') || process.argv.includes('-l');

/** 这些方法的内联回调是同步执行的 */
const EAGER_METHODS = new Set([
  'map', 'filter', 'forEach', 'reduce', 'reduceRight', 'some', 'every',
  'find', 'findIndex', 'findLast', 'flatMap', 'sort', 'concat', 'join',
  'slice', 'indexOf', 'includes', 'reverse', 'flat',
]);

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git']);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts|cts|js|jsx)$/.test(name)) out.push(p);
  }
  return out;
}

/**
 * 核心规则：只报「同步执行位置上的 let/const 前向引用」。
 */
const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'disallow TDZ-risky forward references of let/const' },
  },
  create(context) {
    return {
      Identifier(node) {
        const parent = node.parent;
        if (!parent) return;

        // ── 排除非「值引用」的位置 ──────────────────────────────
        if (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) return;
        if (parent.type === 'Property' && parent.key === node && !parent.computed) return;
        if (parent.type === 'VariableDeclarator' && parent.id === node) return;
        if (parent.type === 'FunctionDeclaration' || parent.type === 'ClassDeclaration') return;
        if (parent.type === 'ImportDefaultSpecifier' || parent.type === 'ImportSpecifier') return;
        // TypeScript 类型位置：编译期擦除，运行期零影响
        if (/Type|TSType/.test(parent.type)) return;
        if (parent.type === 'TSQualifiedName') return;
        // 类型注解里的形参名（function f(x: Foo) 的 x 不是值引用）
        if (parent.type === 'Identifier' || parent.type === 'Parameter') return;
        // 属性访问的 property（a.b 的 b）
        if (parent.type === 'MemberExpression' && parent.property === node) return;
        // 对象/类的属性键
        if (parent.type === 'PropertyDefinition' || parent.type === 'TSPropertySignature') return;
        // 模板字符串里的纯文本不是 Identifier 节点，无需处理
        // 属性名/成员名
        if (parent.type === 'ObjectPattern' || parent.type === 'ArrayPattern') return;

        // ── 用作用域解析找到变量与其声明 ────────────────────────
        let scope = context.getScope();
        let variable = null;
        while (scope) {
          const v = scope.variables && scope.variables.find((x) => x.name === node.name);
          if (v) { variable = v; break; }
          scope = scope.upper;
        }
        if (!variable || !variable.defs || !variable.defs.length) return;
        const def = variable.defs[0];
        if (!def.node) return;
        // 只有 let/const 有死区（var / function / class 声明有提升或已由别的规则管）
        const kind = def.parent && def.parent.type === 'VariableDeclaration' ? def.parent.kind : null;
        if (kind !== 'const' && kind !== 'let') return;
        // 引用必须在声明之前
        if (node.range[0] >= def.node.range[0]) return;

        // ── 判定引用是否处在同步执行位置 ────────────────────────
        // 声明所在的**函数作用域**（或模块顶层 Program）。
        // 必须从 def.node.parent 开始找 —— def.node 自身是 VariableDeclarator，
        // 若直接用它，模块顶层 const 的"作用域"会被误判成 VariableDeclarator，
        // 导致永远走不到 Program，"引用在声明所处函数之外"这条安全分支失效。
        let declScopeFn = def.node.parent;
        while (declScopeFn && !/Function|Program/.test(declScopeFn.type)) {
          declScopeFn = declScopeFn.parent;
        }
        if (!declScopeFn) declScopeFn = null;

        // ── 判定引用是否处在同步执行位置 ────────────────────────
        //
        // 正确思路：**从最外层的函数容器往内判**。
        // 引用点可能嵌在多层的 map 回调里，但真正决定"什么时候跑"的是
        // **最外层那个容器**（组件函数 / useEffect 回调 / 模块顶层）。
        //
        //   - 模块顶层 const 被组件函数引用  → 安全（render 发生在模块求值后）
        //   - 组件函数里的 .map(cb) 用了它    → 要看组件函数何时跑：被 React 调用 → 安全
        //   - 同一函数体内、声明前的同步语句  → 危险
        //   - 立即执行的 .map(cb) 且外层无函数包裹（如 buildQuotationPrintHtml 里
        //     const processRows = list.map(cb)，cb 用了同作用域更晚的 const）→ 危险
        //
        // 所以：先收集从引用点到 declScopeFn 之间的**所有函数**，再从最外层开始判。
        const fnChain = [];
        let cur = node;
        while (cur && cur !== declScopeFn) {
          if (/Function/.test(cur.type)) fnChain.push(cur);
          cur = cur.parent;
        }
        // fnChain[0] = 最靠近引用的函数，fnChain[最后] = 最外层的函数

        let verdict = 'DANGER';
        let reason = '同一作用域内、声明之前的同步语句';

        if (fnChain.length === 0) {
          // 引用点和声明在同一个函数体里，且引用在前 → 同步语句 → 危险
          verdict = 'DANGER';
          reason = '同一函数体内、声明之前的同步语句';
        } else {
          // 从最外层函数开始判：它自己被"尽早执行"吗？
          const outermost = fnChain[fnChain.length - 1];
          const ogp = outermost.parent;
          const eagerMethod = ogp && ogp.type === 'CallExpression'
            ? (ogp.callee.type === 'MemberExpression' && ogp.callee.property.type === 'Identifier'
                ? ogp.callee.property.name
                : (ogp.callee.type === 'Identifier' ? ogp.callee.name : null))
            : null;
          const isArgOf = ogp && ogp.type === 'CallExpression'
            && ogp.arguments.indexOf(outermost) >= 0;

          if (isArgOf && EAGER_METHODS.has(eagerMethod)) {
            // 最外层函数本身就是某个立即执行的数组方法的回调 → 整条链同步跑
            verdict = 'DANGER';
            reason = `${eagerMethod}() 的内联回调（立即执行）`;
          } else if (isArgOf && /^(useEffect|useLayoutEffect|useMemo|useCallback|useImperativeHandle)$/.test(eagerMethod || '')) {
            verdict = 'SAFE'; reason = `${eagerMethod} 回调（渲染后执行）`;
          } else if (isArgOf) {
            verdict = 'SAFE'; reason = `作为实参传给 ${eagerMethod || '?(...)'}（调用时机由对方决定）`;
          } else if (ogp && (ogp.type === 'VariableDeclarator' || ogp.type === 'Property'
                  || ogp.type === 'ReturnStatement' || ogp.type === 'AssignmentExpression'
                  || ogp.type === 'ArrayExpression')) {
            verdict = 'SAFE'; reason = '赋值给变量/属性或作为返回值（稍后调用）';
          } else if (ogp && (ogp.type === 'JSXExpressionContainer' || /^JSX/.test(ogp.type))) {
            verdict = 'SAFE'; reason = 'JSX 事件/渲染属性（交互或渲染后）';
          } else if (ogp && /^CallExpression$/.test(ogp.type)) {
            verdict = 'SAFE'; reason = '被调用的函数（非立即执行参数）';
          } else {
            // 最外层函数既不是谁的回调也不是赋给变量 —— 它是"被调用"的那个，
            // 调用时机取决于别人何时 invoke 它 → 保守判安全，但标注出来供人工看
            verdict = 'SAFE'; reason = `最外层函数父节点 ${ogp ? ogp.type : 'null'}，调用时机不确定`;
          }
        }

        // 一次性报告：高危 / 安全用不同消息前缀区分，执行部分按前缀分类。
        // ⚠️ 不要重复 context.report —— 同一节点报两次会让分类混乱。
        if (verdict === 'DANGER') {
          context.report({
            node,
            message: `'${node.name}' 声明于第 ${def.node.loc ? def.node.loc.start.line : '?'} 行，`
                + `但在同步执行位置被引用（${reason}）`,
          });
        } else {
          context.report({
            node,
            message: `[SAFE] '${node.name}' 声明于第 ${def.node.loc ? def.node.loc.start.line : '?'} 行，`
                + `前向引用但不会抛错（${reason}）`,
          });
        }
      },
    };
  },
};

// ── 执行 ────────────────────────────────────────────────────────────
// 用 ESLint flat config 注册自定义规则；规则通过 context.report 输出，
// 比「往 settings 里塞东西」可靠得多（后者拿不到规则上下文）。
const linter = new Linter({ configType: 'flat' });

const flatConfig = {
  // 注意：files 必须覆盖传入目录（含点目录 .tdzcheck —— ESLint 默认忽略点目录，
  // 这里显式放开才能扫到）
  files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/.*.ts', '**/.*.tsx'],
  ignores: [],
  languageOptions: {
    parser: tsParser,
    parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  },
  plugins: { local: { rules: { 'tdz-sync': rule } } },
  rules: { 'local/tdz-sync': 'error' },
};

const files = walk(SRC);
const collected = [];
const parseErrors = [];

for (const file of files) {
  let code;
  try { code = fs.readFileSync(file, 'utf8'); } catch { continue; }
  const rel = path.relative(path.join(__dirname, '..'), file);
  let messages;
  try {
    messages = linter.verify(code, flatConfig, { filename: rel });
  } catch (e) {
    parseErrors.push(`${rel}: ${e.message}`);
    continue;
  }
  for (const m of messages) {
    if (m.fatal) continue;                       // 语法错误，跳过
    // 只处理本规则产生的消息。文件里若有 // eslint-disable react-hooks/... 之类注释，
    // 而我们没注册那些规则，ESLint 会报 "Definition for rule ... was not found"
    // —— 那不是 TDZ 问题，必须滤掉，否则守门被噪音淹没。
    if (m.ruleId !== 'local/tdz-sync') continue;
    collected.push({
      file: rel,
      line: m.line,
      name: (m.message.match(/^'([^']+)'/) || [])[1] || '?',
      declLine: (m.message.match(/声明于第 (\d+) 行/) || [])[1] || '?',
      // 高危消息以「'x' 声明于…」开头；安全消息带 [SAFE] 前缀
      verdict: /^\[SAFE\]/.test(m.message) ? 'SAFE' : 'DANGER',
      reason: m.message.replace(/^\[SAFE\]\s*/, '').replace(/^'[^']+'\s*/, ''),
    });
  }
}

const danger = collected.filter((x) => x.verdict === 'DANGER');
const safe = collected.filter((x) => x.verdict === 'SAFE');

console.log(`扫描 ${files.length} 个源文件`);
console.log(`  let/const 前向引用合计 : ${collected.length}`);
console.log(`  \u251c\u2500 安全（不会抛错）     : ${safe.length}`);
console.log(`  \u2514\u2500 \u26a0\ufe0f 高危（会抛 TDZ）  : ${danger.length}`);

if (parseErrors.length) {
  console.log(`\n解析失败 ${parseErrors.length} 个文件（已跳过）：`);
  for (const e of parseErrors.slice(0, 5)) console.log('  ' + e);
}

const show = (LIST_ALL ? collected : danger);
if (show.length) {
  console.log(LIST_ALL ? '\n── 全部命中明细 ──' : '\n── 高危明细 ──');
  for (const x of show) {
    const mark = danger.includes(x) ? '\u26a0\ufe0f ' : '   ';
    console.log(`${mark}${x.file}:${x.line}  '${x.name}'（声明 L${x.declLine}）  ${x.reason}`);
  }
}

process.exit(danger.length ? 1 : 0);
