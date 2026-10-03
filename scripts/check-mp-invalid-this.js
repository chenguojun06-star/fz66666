/**
 * 小程序 `this` 绑定扫描（D-723）
 *
 * 背景：i18n 四语言批次在 wx 回调（success/fail/.then(function(){})）里写了
 * `this._lang` —— 这类回调运行时 this 不指向页面实例，一触发就
 * "undefined is not an object (evaluating '(void 0)._lang')"。
 * no-undef 抓不到（属性访问），人工看 1200+ 处不现实，故用 TS AST 做精确判定：
 *
 *   this 有效性启发式（贴合微信小程序语义）：
 *   - 对象字面量属性上的 FunctionExpression / MethodSignature（Page({onLoad(){}})、
 *     wx.showModal({success(){}})）→ 运行时由框架/调用方绑定 → 视为有效
 *   - 其余 FunctionExpression（如 .then(function(){})、onFail 变量）、
 *     FunctionDeclaration → this 无绑定 → 视为无效
 *   - ArrowFunction → 继承外层有效性
 *
 * 报告：无效 this 作用域内的 this.XXX 属性访问（文件:行:列 表达式）。
 * 用法：node scripts/check-mp-invalid-this.js [目录，默认 ../miniprogram]
 * 退出码：发现违规 = 1（可作门禁）。
 */
const fs = require('fs');
const path = require('path');
const ts = require('../frontend/node_modules/typescript');

const root = process.argv[2] || path.join(__dirname, '..', 'miniprogram');

function walkDir(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === 'miniprogram_npm') continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkDir(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

function nodeKind(n) { return ts.SyntaxKind[n.kind]; }

/** 判定某节点的 this 是否有效：只在函数边界重算，非函数节点继承外层状态 */
function analyze(fnNode, parentValid, report, filePath) {
  let valid;
  if (fnNode.kind === ts.SyntaxKind.ArrowFunction) {
    // arrow：继承外层
    valid = parentValid;
  } else if (
    fnNode.kind === ts.SyntaxKind.MethodDeclaration ||
    fnNode.kind === ts.SyntaxKind.MethodSignature ||
    // 对象字面量属性值上的 function（Page({onLoad: function(){}})、wx调用({success: function(){}})）
    (fnNode.kind === ts.SyntaxKind.FunctionExpression &&
      fnNode.parent &&
      (fnNode.parent.kind === ts.SyntaxKind.PropertyAssignment ||
        fnNode.parent.kind === ts.SyntaxKind.ShorthandPropertyAssignment ||
        fnNode.parent.kind === ts.SyntaxKind.PropertyDeclaration))
  ) {
    valid = true;
  } else if (
    fnNode.kind === ts.SyntaxKind.FunctionExpression ||
    fnNode.kind === ts.SyntaxKind.FunctionDeclaration
  ) {
    // FunctionDeclaration、赋值给变量的 FunctionExpression、IIFE 等
    valid = false;
  } else {
    // 非函数节点：继承外层（这是原实现的关键 bug——否则方法体内部一律被当无效）
    valid = parentValid;
  }

  if (ts.isPropertyAccessExpression(fnNode) ||
      ts.isElementAccessExpression(fnNode)) {
    if (fnNode.expression.kind === ts.SyntaxKind.ThisKeyword && !valid) {
      const { line, character } = fnNode.expression.getSourceFile().getLineAndCharacterOfPosition(fnNode.getStart());
      report.push(`${filePath}:${line + 1}:${character + 1}  this.${fnNode.name && fnNode.name.getText ? fnNode.name.getText() : '?'}`);
    }
  }

  fnNode.forEachChild((child) => analyze(child, valid, report, filePath));
}

const files = walkDir(root, []);
let violations = 0;
for (const file of files) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf-8'), ts.ScriptTarget.ES2022, true);
  const report = [];
  sf.forEachChild((child) => analyze(child, false, report, path.relative(process.cwd(), file)));
  if (report.length) {
    violations += report.length;
    report.forEach((r) => console.log(r));
  }
}
console.log(`\n扫描 ${files.length} 个文件，无效 this 引用 ${violations} 处`);
process.exit(violations ? 1 : 0);
