const ERROR_MESSAGE_MAP = {
  AUTH_EXPIRED: '登录已过期，请重新登录',
  NO_PERMISSION: '无权限执行此操作，请联系管理员开通权限',
  PARAM_INVALID: '输入信息不完整或格式不正确，请检查后重试',
  RESOURCE_NOT_FOUND: '数据不存在或已被删除，请刷新后重试',
  ORDER_LOCKED: '订单已完成，无法继续操作',
  STOCK_NOT_ENOUGH: '库存不足，请减少数量或补货后再试',
  SCAN_DUPLICATE: '检测到重复扫码，请稍后再试',
  PAYROLL_SETTLED_DENY_UNDO: '该扫码记录已参与工资结算，无法撤回',
  NETWORK_TIMEOUT: '网络超时，请检查网络后重试',
  SERVER_UNAVAILABLE: '服务暂不可用，请稍后重试',
  FILE_INVALID: '文件格式不支持，请上传正确文件',
  FILE_TOO_LARGE: '文件过大，请压缩后重试',
  SYSTEM_ERROR: '系统繁忙，请稍后重试',
};

const HTTP_STATUS_FALLBACK_MAP = {
  400: '请求参数错误，请检查后重试',
  401: '登录已过期，请重新登录',
  403: '无权限执行此操作，请联系管理员开通权限',
  404: '请求资源不存在，请刷新后重试',
  409: '数据冲突，请刷新后重试',
  422: '请求数据验证失败，请检查后重试',
  429: '操作过于频繁，请稍后重试',
  500: '系统繁忙，请稍后重试',
  502: '服务网关异常，请稍后重试',
  503: '服务暂不可用，请稍后重试',
  504: '请求超时，请稍后重试',
};

function normalizeText(value) {
  if (typeof value === 'string') {
    return value.trim();
  }
  return '';
}

function normalizeErrorCode(value) {
  return normalizeText(value).toUpperCase();
}

/**
 * 解析统一错误提示文案（独立工具，不直接耦合业务页面）。
 * @param {Object} input - 错误输入
 * @param {string} [input.errorCode] - 后端错误码
 * @param {string} [input.message] - 后端消息
 * @param {number} [input.statusCode] - HTTP状态码
 * @param {string} [input.requestId] - 请求追踪ID
 * @returns {string} 统一错误提示文案
 */
function resolveUnifiedErrorMessage(input) {
  const payload = input && typeof input === 'object' ? input : {};
  const errorCode = normalizeErrorCode(payload.errorCode);
  const serverMessage = normalizeText(payload.message);
  const requestId = normalizeText(payload.requestId);
  const statusCode = typeof payload.statusCode === 'number' ? payload.statusCode : 0;

  const baseMessage =
    (errorCode && ERROR_MESSAGE_MAP[errorCode]) ||
    (statusCode && HTTP_STATUS_FALLBACK_MAP[statusCode]) ||
    serverMessage ||
    ERROR_MESSAGE_MAP.SYSTEM_ERROR;

  if (!requestId) {
    return baseMessage;
  }

  const shortRequestId = requestId.slice(0, 8);
  return `${baseMessage}（RID: ${shortRequestId}）`;
}

module.exports = {
  ERROR_MESSAGE_MAP,
  HTTP_STATUS_FALLBACK_MAP,
  resolveUnifiedErrorMessage,
};
