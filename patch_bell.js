const fs = require('fs');
const file = 'miniprogram/components/ai-assistant/bellTaskActions.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/function handleCuttingTask.*?\}/s, `function handleCuttingTask(task) {
  const orderNo = task.productionOrderNo || task.orderNo || '';
  try {
    wx.setStorageSync('pending_cutting_task', JSON.stringify(task));
    wx.setStorageSync('pending_order_hint', orderNo);
  } catch (e) {
    console.error('存储失败', e);
  }
  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1];
  if (currentPage && currentPage.route === 'pages/scan/index' && typeof currentPage.checkPendingTasks === 'function') {
    currentPage.checkPendingTasks();
  } else {
    safeNavigate({ url: '/pages/scan/index' }, 'switchTab').catch(() => {});
  }
}`);

content = content.replace(/function handleProcurementTask.*?\}/s, `function handleProcurementTask(task) {
  const orderNo = task.orderNo || '';
  try {
    wx.setStorageSync('pending_procurement_task', JSON.stringify(task));
    wx.setStorageSync('pending_order_hint', orderNo);
    wx.setStorageSync('mp_scan_type_index', 2); // 采购模式
  } catch (e) {
    console.error('存储失败', e);
  }
  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1];
  if (currentPage && currentPage.route === 'pages/scan/index' && typeof currentPage.checkPendingTasks === 'function') {
    currentPage.checkPendingTasks();
  } else {
    safeNavigate({ url: '/pages/scan/index' }, 'switchTab').catch(() => {});
  }
}`);

content = content.replace(/function handleQualityTask.*?\}\n\}/s, `function handleQualityTask(task) {
  try {
    wx.setStorageSync('pending_quality_task', JSON.stringify(task));
    wx.setStorageSync('pending_order_hint', task.orderNo || '');
  } catch (e) {
    console.error('存储失败', e);
  }

  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1];
  if (currentPage && currentPage.route === 'pages/scan/index' && typeof currentPage.checkPendingTasks === 'function') {
    currentPage.checkPendingTasks();
  } else {
    safeNavigate({ url: '/pages/scan/index' }, 'switchTab').catch(() => {});
  }
}`);

fs.writeFileSync(file, content);
console.log('Patch applied successfully.');
