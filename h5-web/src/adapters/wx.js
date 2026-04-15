const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
const isWechat = /micromessenger/.test(ua);
const isMobile = /iphone|ipad|ipod|android/.test(ua);

function getWindowInfo() {
  return {
    windowWidth: window.innerWidth || 375,
    windowHeight: window.innerHeight || 667,
    statusBarHeight: 0,
    pixelRatio: window.devicePixelRatio || 1,
  };
}

function getMenuButtonBoundingClientRect() {
  return { top: 48, bottom: 80, left: 0, right: 0, width: 0, height: 32 };
}

function showToast({ title, icon = 'none', duration = 2000 }) {
  const existing = document.getElementById('wx-toast');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'wx-toast';
  el.style.cssText = `
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    background:rgba(0,0,0,.75);color:#fff;padding:12px 24px;border-radius:12px;
    font-size:14px;z-index:99999;text-align:center;max-width:80%;
    pointer-events:none;
  `;
  el.textContent = String(title || '').slice(0, 20);
  document.body.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.remove(); }, duration);
}

function showModal({ title = '', content = '', showCancel = true, confirmText = '确定', cancelText = '取消', editable = false, placeholderText = '' }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;top:0;left:0;right:0;bottom:0;
      background:rgba(0,0,0,.5);z-index:99998;display:flex;
      align-items:center;justify-content:center;padding:24px;
    `;

    const card = document.createElement('div');
    card.style.cssText = `
      background:#fff;border-radius:16px;width:min(100%,320px);
      overflow:hidden;
    `;

    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'padding:20px 20px 8px;font-size:17px;font-weight:700;text-align:center;';
    titleEl.textContent = title;

    const contentEl = document.createElement('div');
    contentEl.style.cssText = 'padding:0 20px 20px;font-size:14px;color:#666;text-align:center;word-break:break-word;';

    let inputEl = null;
    if (editable) {
      inputEl = document.createElement('textarea');
      inputEl.style.cssText = 'width:100%;min-height:60px;border:1px solid #ddd;border-radius:8px;padding:8px;margin-top:8px;font-size:14px;box-sizing:border-box;';
      inputEl.placeholder = placeholderText || '';
      contentEl.appendChild(inputEl);
    } else {
      contentEl.textContent = content;
    }

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;border-top:1px solid #eee;';

    function close(result) {
      overlay.remove();
      resolve(result);
    }

    if (showCancel) {
      const cancelBtn = document.createElement('button');
      cancelBtn.style.cssText = 'flex:1;padding:14px;border:none;background:none;font-size:16px;color:#999;cursor:pointer;';
      cancelBtn.textContent = cancelText;
      cancelBtn.onclick = () => close({ confirm: false, cancel: true });
      btnRow.appendChild(cancelBtn);

      const sep = document.createElement('div');
      sep.style.cssText = 'width:1px;background:#eee;';
      btnRow.appendChild(sep);
    }

    const confirmBtn = document.createElement('button');
    confirmBtn.style.cssText = 'flex:1;padding:14px;border:none;background:none;font-size:16px;color:#3b82f6;font-weight:700;cursor:pointer;';
    confirmBtn.textContent = confirmText;
    confirmBtn.onclick = () => close({
      confirm: true,
      cancel: false,
      content: inputEl ? inputEl.value : undefined,
    });
    btnRow.appendChild(confirmBtn);

    card.appendChild(titleEl);
    card.appendChild(contentEl);
    card.appendChild(btnRow);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  });
}

function showLoading({ title = '加载中...' } = {}) {
  let el = document.getElementById('wx-loading');
  if (el) return;
  el = document.createElement('div');
  el.id = 'wx-loading';
  el.style.cssText = `
    position:fixed;top:0;left:0;right:0;bottom:0;
    background:rgba(0,0,0,.3);z-index:99997;display:flex;
    align-items:center;justify-content:center;
  `;
  const inner = document.createElement('div');
  inner.style.cssText = 'background:rgba(0,0,0,.75);color:#fff;padding:16px 24px;border-radius:12px;font-size:14px;';
  const spinner = document.createElement('span');
  spinner.style.cssText = 'display:inline-block;animation:wxspin 1s linear infinite;margin-right:8px;';
  spinner.textContent = '⟳';
  inner.appendChild(spinner);
  inner.appendChild(document.createTextNode(String(title || '')));
  el.appendChild(inner);
  const style = document.createElement('style');
  style.textContent = '@keyframes wxspin{to{transform:rotate(360deg)}}';
  el.appendChild(style);
  document.body.appendChild(el);
}

function hideLoading() {
  const el = document.getElementById('wx-loading');
  if (el) el.remove();
}

function scanCode({ onlyFromCamera = true, scanType = ['qrCode', 'barCode'] } = {}) {
  return new Promise((resolve, reject) => {
    if (isWechat && typeof wx !== 'undefined' && wx.scanQRCode) {
      wx.scanQRCode({
        needResult: 1,
        scanType,
        success: (res) => resolve({ result: res.resultStr, scanType: 'QR_CODE' }),
        fail: (err) => reject(err),
      });
    } else {
      const event = new CustomEvent('wx:scanRequest', { detail: { resolve, reject } });
      window.dispatchEvent(event);
    }
  });
}

function vibrateShort() {
  if (isWechat && typeof wx !== 'undefined' && wx.vibrateShort) {
    wx.vibrateShort({ type: 'light' });
  } else if (navigator.vibrate) {
    navigator.vibrate(15);
  }
}

function vibrateLong() {
  if (isWechat && typeof wx !== 'undefined' && wx.vibrateLong) {
    wx.vibrateLong();
  } else if (navigator.vibrate) {
    navigator.vibrate(100);
  }
}

function getNetworkType() {
  return new Promise((resolve) => {
    if (isWechat && typeof wx !== 'undefined' && wx.getNetworkType) {
      wx.getNetworkType({
        success: (res) => resolve({ networkType: res.networkType }),
        fail: () => resolve({ networkType: 'unknown' }),
      });
    } else if (navigator.connection) {
      resolve({ networkType: navigator.connection.effectiveType || 'unknown' });
    } else {
      resolve({ networkType: 'unknown' });
    }
  });
}

function navigateTo({ url }) {
  const path = url.replace(/^\//, '').replace(/\?.*$/, '');
  const search = url.includes('?') ? url.substring(url.indexOf('?')) : '';
  window.__h5Navigate?.(path, search) || window.location.hash?.replace('#', '');
}

function navigateBack() {
  window.history.back();
}

function switchTab({ url }) {
  const path = url.replace(/^\//, '').replace(/\?.*$/, '');
  window.__h5Navigate?.(path, '');
}

function reLaunch({ url }) {
  const path = url.replace(/^\//, '').replace(/\?.*$/, '');
  window.__h5Navigate?.(path, '');
}

function redirectTo({ url }) {
  const path = url.replace(/^\//, '').replace(/\?.*$/, '');
  window.__h5Navigate?.(path, '');
}

function setNavigationBarTitle({ title }) {
  document.title = title || '服装供应链';
}

function setClipboardData({ data }) {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(data).then(() => {
      showToast({ title: '已复制', icon: 'success' });
    });
  }
  const ta = document.createElement('textarea');
  ta.value = data;
  ta.style.cssText = 'position:fixed;left:-9999px;';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
  showToast({ title: '已复制', icon: 'success' });
}

function chooseMedia({ count = 1, mediaType = ['image'], sourceType = ['album', 'camera'] } = {}) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = mediaType.includes('image') ? 'image/*' : '*/*';
    input.multiple = count > 1;
    if (sourceType.includes('camera') && !sourceType.includes('album')) {
      input.capture = 'environment';
    }
    input.onchange = (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) { reject(new Error('cancel')); return; }
      const tempFiles = files.slice(0, count).map((f) => ({
        tempFilePath: URL.createObjectURL(f),
        size: f.size,
        file: f,
      }));
      resolve({ tempFiles });
    };
    input.click();
  });
}

function previewImage({ current = '', urls = [] }) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;top:0;left:0;right:0;bottom:0;
    background:#000;z-index:99999;display:flex;
    align-items:center;justify-content:center;cursor:pointer;
  `;
  const img = document.createElement('img');
  img.src = current || urls[0] || '';
  img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;';
  overlay.appendChild(img);
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}

function openSetting() {
  showModal({ title: '权限设置', content: '请在浏览器设置中允许相关权限', showCancel: false });
}

function onNeedPrivacyAuthorization() {}

const wxAdapter = {
  isWechat,
  isMobile,
  getWindowInfo,
  getMenuButtonBoundingClientRect,
  showToast,
  showModal,
  showLoading,
  hideLoading,
  scanCode,
  vibrateShort,
  vibrateLong,
  getNetworkType,
  navigateTo,
  navigateBack,
  switchTab,
  reLaunch,
  redirectTo,
  setNavigationBarTitle,
  setClipboardData,
  chooseMedia,
  previewImage,
  openSetting,
  onNeedPrivacyAuthorization,
};

export default wxAdapter;
