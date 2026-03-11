const fs = require('fs');
const file = 'miniprogram/components/ai-assistant/bellTaskActions.js';
let content = fs.readFileSync(file, 'utf8');

const targetStr = "safeNavigate({ url: '/pages/scan/index' }, 'switchTab').catch(() => {});";
const replaceStr = `const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1];
  if (currentPage && currentPage.route === 'pages/scan/index') {
    if (typeof currentPage.checkPendingQualityTask === 'function') currentPage.checkPendingQualityTask();
    if (typeof currentPage.checkPendingTasks === 'function') currentPage.checkPendingTasks();
  } else {
    safeNavigate({ url: '/pages/scan/index' }, 'switchTab').catch(() => {});
  }`;

content = content.split(targetStr).join(replaceStr);
fs.writeFileSync(file, content);
console.log('Done!');
