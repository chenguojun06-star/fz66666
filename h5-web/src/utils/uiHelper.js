import wx from '@/adapters/wx';

const toast = {
  success(msg) { wx.showToast({ title: msg || '操作成功', icon: 'success' }); },
  error(msg) { wx.showToast({ title: msg || '操作失败', icon: 'none' }); },
  info(msg) { wx.showToast({ title: msg || '', icon: 'none' }); },
  loading(msg) { wx.showLoading({ title: msg || '加载中...' }); },
  hideLoading() { wx.hideLoading(); },
};

function safeNavigate(url, method = 'push') {
  if (!url) return Promise.resolve();
  const path = url.replace(/^\//, '').replace(/\?.*$/, '');
  const search = url.includes('?') ? url.substring(url.indexOf('?')) : '';
  if (window.__h5Navigate) {
    window.__h5Navigate(path, search);
  }
  return Promise.resolve();
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(String(dateStr).replace(' ', 'T'));
  if (isNaN(d.getTime())) return '';
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${m}-${day}`;
}

function formatDate(date) {
  const d = date instanceof Date ? date : new Date(String(date).replace(' ', 'T'));
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateTime(date) {
  const d = date instanceof Date ? date : new Date(String(date).replace(' ', 'T'));
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return '上午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

export { toast, safeNavigate, timeAgo, formatDate, formatDateTime, getGreeting };
