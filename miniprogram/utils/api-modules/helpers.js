/**
 * API 通用工具函数
 * 提供 ok / raw / pickMessage / createBizError 四个核心方法
 */
const { request, uploadFile: _rawUploadFile } = require('../request');

/**
 * 位置参数适配器：common.js 以 (url, filePath, name, formData) 调用，
 * 而 request.js uploadFile 期望单个 options 对象 {url, filePath, name, formData}。
 */
function uploadFile(url, filePath, name, formData) {
  return _rawUploadFile({ url: url, filePath: filePath, name: name, formData: formData });
}

function pickMessage(resp, fallback) {
  const msg = resp && resp.message !== null ? String(resp.message) : '';
  return msg || (fallback ? String(fallback) : '请求失败');
}

function createBizError(resp, fallback) {
  return {
    type: 'biz',
    code: resp && resp.code,
    errMsg: pickMessage(resp, fallback),
    resp,
  };
}

async function ok(url, method, data, options) {
  const resp = await request({ url, method, data, ...(options || {}) });
  if (resp && resp.code === 200) {
    return resp.data;
  }
  throw createBizError(resp, `${method} ${url}`);
}

async function raw(url, method, data, options) {
  return request({ url, method, data, ...(options || {}) });
}

module.exports = { ok, raw, pickMessage, createBizError, uploadFile };
