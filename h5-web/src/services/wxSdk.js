import { http } from './http';

let jsSdkConfigured = false;
let configPromise = null;

export async function configureWxJsSdk() {
  if (jsSdkConfigured) return;
  if (configPromise) return configPromise;

  configPromise = (async () => {
    try {
      const ua = navigator.userAgent.toLowerCase();
      if (!ua.includes('micromessenger')) return;

      if (typeof wx === 'undefined') {
        console.warn('[WX-SDK] wx object not found, JS-SDK not loaded');
        return;
      }

      const url = window.location.href.split('#')[0];
      const res = await http.get('/api/wechat/h5/jssdk-config', { params: { url } });

      if (!res || !res.data) {
        console.warn('[WX-SDK] Failed to get JS-SDK config');
        return;
      }

      const { appId, timestamp, nonceStr, signature } = res.data;

      wx.config({
        debug: false,
        appId,
        timestamp,
        nonceStr,
        signature,
        jsApiList: [
          'scanQRCode',
          'chooseImage',
          'uploadImage',
          'previewImage',
          'updateAppMessageShareData',
          'updateTimelineShareData',
          'getLocation',
          'openLocation',
          'chooseWXPay',
          'getNetworkType',
        ],
        openTagList: ['wx-open-launch-weapp'],
      });

      await new Promise((resolve, reject) => {
        wx.ready(() => {
          jsSdkConfigured = true;
          console.info('[WX-SDK] Configured successfully');
          resolve();
        });
        wx.error((err) => {
          console.warn('[WX-SDK] Config error:', err.errMsg);
          reject(err);
        });
      });
    } catch (err) {
      console.warn('[WX-SDK] Configure failed:', err?.message);
    } finally {
      configPromise = null;
    }
  })();

  return configPromise;
}

export function setupWxShare({ title = '衣智链｜多端协同智能提醒平台', desc = '多端协同智能提醒平台', link, imgUrl } = {}) {
  if (typeof wx === 'undefined') return;

  const shareData = {
    title,
    desc,
    link: link || window.location.href,
    imgUrl: imgUrl || `${window.location.origin}/logo.png`,
  };

  wx.ready(() => {
    wx.updateAppMessageShareData(shareData);
    wx.updateTimelineShareData({
      title: shareData.title,
      link: shareData.link,
      imgUrl: shareData.imgUrl,
    });
  });
}

export function isWxReady() {
  return jsSdkConfigured;
}
