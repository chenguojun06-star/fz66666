const fs = require('fs');
const path = require('path');

function getFiles(dir) {
  const dirents = fs.readdirSync(dir, { withFileTypes: true });
  const files = dirents.map((dirent) => {
    const res = path.resolve(dir, dirent.name);
    return dirent.isDirectory() ? getFiles(res) : res;
  });
  return Array.prototype.concat(...files);
}

const allFiles = getFiles('frontend/src');
const exts = ['.ts', '.tsx', '.css'];

for (const file of allFiles) {
  if (!exts.includes(path.extname(file))) continue;
  let content = fs.readFileSync(file, 'utf8');
  const oldContent = content;

  content = content.replace(/-webkit-text-fill-color:\s*#000000\s*!important;?/g, '');
  content = content.replace(/-webkit-text-fill-color:\s*#000\s*!important;?/g, '');
  content = content.replace(/-webkit-text-fill-color:\s*#555\s*!important;?/g, '');
  content = content.replace(/-webkit-text-fill-color:\s*#777\s*!important;?/g, '');

  content = content.replace(/font-family:\s*'Heiti SC'[^;]*;/g, "font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'Microsoft YaHei', 'PingFang SC', sans-serif;");
  
  if (content.includes('Arial Unicode MS')) {
    content = content.replace(/font-family:[^;]*'Arial Unicode MS'[^;]*;/g, "font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'Microsoft YaHei', 'PingFang SC', sans-serif;");
  }

  if (content !== oldContent) {
    fs.writeFileSync(file, content);
    console.log('Fixed:', file);
  }
}
