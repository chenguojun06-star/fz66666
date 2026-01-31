/**
 * 批量修复字体大小脚本
 * 将硬编码字体大小替换为CSS变量
 */

const fs = require('fs');
const path = require('path');

// 字体大小映射表（px -> CSS变量）
const fontSizeMap = {
  '10px': 'var(--font-size-xs)',   // 极小字体 -> xs
  '11px': 'var(--font-size-xs)',   // 辅助文字 -> xs
  '12px': 'var(--font-size-sm)',   // 小文字 -> sm
  '13px': 'var(--font-size-base)', // 接近正文 -> base
  '14px': 'var(--font-size-base)', // 正文 -> base
  '15px': 'var(--font-size-lg)',   // 接近标题 -> lg
  '16px': 'var(--font-size-lg)',   // 二级标题 -> lg
  '18px': 'var(--font-size-xl)',   // 一级标题 -> xl
  '20px': 'var(--font-size-2xl)',  // 数值强调 -> 2xl
};

// 需要处理的文件
const targetFiles = [
  'pages/scan/index.wxss',
  'pages/work/index.wxss',
  'pages/admin/index.wxss',
  'pages/home/index.wxss',
  'components/floating-bell/index.wxss',
  'app.wxss',
];

// 修复单个文件
function fixFile(filePath) {
  const fullPath = path.join(__dirname, filePath);

  if (!fs.existsSync(fullPath)) {
    console.log(`❌ 文件不存在: ${filePath}`);
    return;
  }

  let content = fs.readFileSync(fullPath, 'utf-8');
  let hasChanges = false;

  // 替换字体大小（排除注释中的）
  Object.entries(fontSizeMap).forEach(([px, variable]) => {
    // 匹配 font-size: XXpx; 但不匹配 /* font-size: XXpx */
    const escapedPx = px.replace('.', '\.');
    const regex = new RegExp(`(font-size:\s*)${escapedPx}(\s*;)(?!\s*\\*\\/)`, 'g');
    if (regex.test(content)) {
      content = content.replace(regex, `$1${variable}$2`);
      hasChanges = true;
    }
  });

  if (hasChanges) {
    fs.writeFileSync(fullPath, content, 'utf-8');
    console.log(`✅ 已修复: ${filePath}`);
  } else {
    console.log(`⏭️  无需修复: ${filePath}`);
  }
}

// 执行修复
console.log('🔤 开始修复字体大小...\n');
targetFiles.forEach(fixFile);
console.log('\n✨ 修复完成！');
