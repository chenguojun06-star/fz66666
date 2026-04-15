const ErrorType = {
  VALIDATION: 'validation',
  AUTH: 'auth',
  PERMISSION: 'permission',
  NETWORK: 'network',
  TIMEOUT: 'timeout',
  SERVER: 'server',
  BUSINESS: 'business',
  UNKNOWN: 'unknown',
};

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
  }

  categorizeError(error) {
    if (!error) return { type: ErrorType.UNKNOWN, msg: '发生未知错误' };
    const status = error?.response?.status || error?.status;
    if (status && this.errorMap[status]) {
      return { type: this.errorMap[status].type, msg: error.message || this.errorMap[status].msg, code: status };
    }
    if (status >= 500) return { type: ErrorType.SERVER, msg: '服务暂时不可用', code: status };
    const errMsg = error?.message || '';
    if (errMsg.includes('timeout') || errMsg.includes('ECONNABORTED')) {
      return { type: ErrorType.TIMEOUT, msg: '请求超时，请检查网络' };
    }
    if (errMsg.includes('Network Error')) {
      return { type: ErrorType.NETWORK, msg: '网络连接失败' };
    }
    return { type: ErrorType.BUSINESS, msg: errMsg || '操作失败' };
  }

  formatError(error, defaultMsg = '操作失败') {
    return this.categorizeError(error).msg || defaultMsg;
  }

  isRetryable(error) {
    const result = this.categorizeError(error);
    return [ErrorType.TIMEOUT, ErrorType.NETWORK, ErrorType.SERVER].includes(result.type);
  }

  isAuthError(error) {
    return this.categorizeError(error).type === ErrorType.AUTH;
  }
}

export const errorHandler = new ErrorHandler();
export { ErrorType, ErrorHandler };
