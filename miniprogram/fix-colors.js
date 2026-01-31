/**
 * 批量修复硬编码颜色值脚本
 * 将硬编码颜色替换为CSS变量
 */

const fs = require('fs');
const path = require('path');

// 颜色映射表
const colorMap = {
  // 主色
  '#3b82f6': 'var(--color-primary)',
  // 功能色
  '#10b981': 'var(--color-success)',
  '#f59e0b': 'var(--color-warning)',
  '#ef4444': 'var(--color-error)',
  // 文字色
  '#6b7280': 'var(--color-text-secondary)',
  '#9ca3af': 'var(--color-text-disabled)',
  // 其他常用色
  '#ff4757': 'var(--color-error)',
  '#ff6b6b': 'var(--color-error)',
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

  // 替换颜色
  Object.entries(colorMap).forEach(([hex, variable]) => {
    const regex = new RegExp(hex.replace('#', '\\#'), 'g');
    if (regex.test(content)) {
      content = content.replace(regex, variable);
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
console.log('🎨 开始修复硬编码颜色值...\n');
targetFiles.forEach(fixFile);
console.log('\n✨ 修复完成！');
