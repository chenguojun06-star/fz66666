const { DEBUG } = require('../config/debug');
/**
 * 小程序统一错误处理器
 * 将后端错误转换为用户友好的提示
 */
const _DEBUG = DEBUG; // 避免未使用警告

const ErrorType = {
  VALIDATION: 'validation', // 参数验证错误
  AUTH: 'auth', // 认证错误
  PERMISSION: 'permission', // 权限错误
  NETWORK: 'network', // 网络错误
  TIMEOUT: 'timeout', // 超时错误
  SERVER: 'server', // 服务器错误
  BUSINESS: 'business', // 业务逻辑错误
  UNKNOWN: 'unknown', // 未知错误
};

/**
 * 错误处理器类
 */
class ErrorHandler {
  constructor() {
    this.errorMap = {
      400: { type: ErrorType.VALIDATION, msg: '请求参数错误' },
      401: { type: ErrorType.AUTH, msg: '请登录后继续' },
      403: { type: ErrorType.PERMISSION, msg: '您没有权限执行此操作' },
      404: { type: ErrorType.BUSINESS, msg: '资源不存在' },
      500: { type: ErrorType.SERVER, msg: '服务器内部错误，请稍后重试' },
      502: { type: ErrorType.SERVER, msg: '服务暂时不可用，请稍后重试' },
      503: { type: ErrorType.SERVER, msg: '服务暂时不可用，请稍后重试' },
    };

    this.networkErrorMap = {
      ECONNABORTED: { type: ErrorType.TIMEOUT, msg: '请求超时，请检查网络连接并重试' },
      ERR_NETWORK: { type: ErrorType.NETWORK, msg: '网络连接失败，请检查网络设置' },
      timeout: { type: ErrorType.TIMEOUT, msg: '请求超时，请检查网络连接并重试' },
    };
  }

  /**
   * 处理业务错误
   * @private
   */
  _handleBusinessError(error) {
    const code = error.code;
    const errMsg = error.errMsg || error.message || '';

    if (this.errorMap[code]) {
      return {
        type: this.errorMap[code].type,
        msg: error.errMsg || this.errorMap[code].msg,
        code,
      };
    }

    // 服务端 5xx 错误
    if (code >= 500) {
      return {
        type: ErrorType.SERVER,
        msg: '服务暂时不可用，请稍后重试',
        code,
      };
    }

    // 其他接口错误
    return {
      type: ErrorType.BUSINESS,
      msg: errMsg || '操作失败',
      code,
    };
  }

  /**
   * 处理网络错误
   * @private
   */
  _handleNetworkError(errMsg) {
    for (const [key, value] of Object.entries(this.networkErrorMap)) {
      if (errMsg.includes(key) || errMsg.toLowerCase().includes(key.toLowerCase())) {
        return {
          type: value.type,
          msg: value.msg,
        };
      }
    }

    // 网络错误的其他情况
    if (errMsg.includes('request')) {
      return {
        type: ErrorType.NETWORK,
        msg: '网络请求失败，请检查网络连接',
      };
    }

    return null;
  }

  /**
   * 分类错误
   * @param {*} error 错误对象
   * @returns {Object} { type: string, msg: string, code?: number }
   */
  categorizeError(error) {
    if (!error) {
      return { type: ErrorType.UNKNOWN, msg: '发生未知错误' };
    }

    // 处理接口业务错误
    if (error.type === 'biz') {
      return this._handleBusinessError(error);
    }

    // 处理网络错误
    const errMsg = error.errMsg || error.message || '';
    const networkError = this._handleNetworkError(errMsg);
    if (networkError) {
      return networkError;
    }

    // 回退
    return {
      type: ErrorType.UNKNOWN,
      msg: errMsg || '操作失败，请稍后重试',
    };
  }

  /**
   * 格式化错误信息
   * @param {*} error 错误对象
   * @param {string} defaultMsg 默认错误信息
   * @returns {string} 用户友好的错误信息
   */
  formatError(error, defaultMsg = '操作失败') {
    const result = this.categorizeError(error);
    return result.msg || defaultMsg;
  }

  /**
   * 显示错误提示（Toast）
   * @param {*} error 错误对象
   * @param {string} defaultMsg 默认错误信息
   */
  showError(error, defaultMsg = '操作失败') {
    const msg = this.formatError(error, defaultMsg);
    wx.showToast({
      title: msg,
      icon: 'error',
      duration: 2000,
    });
  }

  /**
   * 记录错误（开发模式）
   * @param {*} error 错误对象
   * @param {string} context 错误上下文
   */
  logError(error, context = '') {
    const result = this.categorizeError(error);
    const timestamp = new Date().toISOString();

    console.error(`[${timestamp}] ${context}`, {
      type: result.type,
      msg: result.msg,
      code: result.code,
      originalError: error,
      raw: error,
    });
  }

  /**
   * 是否是可重试的错误
   * @param {*} error 错误对象
   * @returns {boolean}
   */
  isRetryable(error) {
    const result = this.categorizeError(error);

    // 这些错误类型建议重试
    const retryableTypes = [ErrorType.TIMEOUT, ErrorType.NETWORK, ErrorType.SERVER];

    return retryableTypes.includes(result.type);
  }

  /**
   * 是否是认证错误（需要重新登录）
   * @param {*} error 错误对象
   * @returns {boolean}
   */
  isAuthError(error) {
    const result = this.categorizeError(error);
    return result.type === ErrorType.AUTH;
  }

  /**
   * 是否是权限错误
   * @param {*} error 错误对象
   * @returns {boolean}
   */
  isPermissionError(error) {
    const result = this.categorizeError(error);
    return result.type === ErrorType.PERMISSION;
  }
}

// 创建全局错误处理器实例
const errorHandler = new ErrorHandler();

module.exports = { ErrorType, ErrorHandler, errorHandler };
