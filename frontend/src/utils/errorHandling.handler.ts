/**
 * 统一的错误处理和日志系统 - 错误处理管理器
 */

import { message, notification } from '@/utils/antdStatic';
import React from 'react';
import { ErrorType } from './errorHandling.types';
import { logger } from './errorHandling.logger';

/**
 * 错误处理管理器
 */
export class ErrorHandler {
  /**
   * 处理表单验证错误
   */
  handleFormValidationError(error: unknown): string {
    const errorFields = (error as { errorFields?: Array<{ errors?: string[] }> })?.errorFields;
    if (Array.isArray(errorFields) && errorFields.length > 0) {
      const messages = errorFields
        .map((f) => (Array.isArray(f?.errors) ? f.errors[0] : undefined))
        .filter(Boolean) as string[];
      const errorMsg = messages.length === 1
        ? messages[0]
        : `表单验证失败：${messages.join('；')}`;

      logger.warn('表单验证失败', { errorFields: messages });
      message.error(errorMsg);
      return errorMsg;
    }
    return '表单验证失败';
  }

  /**
   * 处理网络错误
   */
  handleNetworkError(error: unknown): string {
    const traceId = logger.error('网络请求失败', error);

    let errorMsg = '网络请求失败，请检查您的网络连接';
    const err = error as { code?: string; response?: { status?: number }; message?: string };

    if (err?.code === 'ECONNABORTED') {
      errorMsg = '请求超时，请稍后重试';
    } else if (err?.response?.status === 0) {
      errorMsg = '无法连接到服务器，请检查网络';
    } else if (err?.message?.includes('Network')) {
      errorMsg = '网络连接异常，请检查网络设置';
    }

    message.error(`${errorMsg} (${traceId})`);
    return errorMsg;
  }

  /**
   * 处理 API 错误
   */
  handleApiError(error: unknown, defaultMsg = '操作失败'): string {
    let errorMsg = defaultMsg;
    let errorType = ErrorType.Unknown;
    const err = error as { response?: { status?: number; data?: { message?: string } }; request?: unknown; message?: string };

    if (err?.response) {
      // 服务器返回了错误响应
      const status = typeof err.response.status === 'number' ? err.response.status : -1;
      const data = err.response.data;

      if (status === 400) {
        errorMsg = data?.message || '请求参数错误';
        errorType = ErrorType.Validation;
      } else if (status === 401) {
        errorMsg = '请登录后继续';
        errorType = ErrorType.Auth;
      } else if (status === 403) {
        errorMsg = '您没有权限执行此操作';
        errorType = ErrorType.Permission;
      } else if (status === 404) {
        errorMsg = '资源不存在';
        errorType = ErrorType.Business;
      } else if (status === 500) {
        errorMsg = data?.message || '服务器开小差了，请稍后重试';
        errorType = ErrorType.Server;
      } else if (status >= 500) {
        errorMsg = '服务暂时不可用，请稍后重试';
        errorType = ErrorType.Server;
      } else {
        errorMsg = data?.message || `请求失败 (${status})`;
        errorType = ErrorType.Business;
      }
    } else if (err?.request) {
      // 请求已发送但没有收到响应
      errorMsg = '服务器无响应，请检查网络连接';
      errorType = ErrorType.Network;
    } else if (err?.message) {
      errorMsg = err.message;
      errorType = ErrorType.Unknown;
    }

    const traceId = logger.error('API 请求错误', {
      status: err?.response?.status,
      message: errorMsg,
      type: errorType
    });

    message.error(`${errorMsg} (${traceId})`);
    return errorMsg;
  }

  /**
   * 判断错误是否可重试
   */
  isRetryableError(error: unknown): boolean {
    const err = error as { response?: { status?: number }; code?: string; message?: string; request?: unknown };

    // 网络超时
    if (err?.code === 'ECONNABORTED') return true;

    // 5xx 服务器错误
    if (err?.response?.status && err.response.status >= 500) return true;

    // 无响应（网络问题）
    if (err?.request && !err?.response) return true;

    // 网络连接错误
    if (err?.message?.includes('Network') || err?.message?.includes('网络')) return true;

    return false;
  }

  /**
   * 获取错误类型
   */
  getErrorType(error: unknown): ErrorType {
    const err = error as { response?: { status?: number }; request?: unknown; errorFields?: unknown };

    if (err?.errorFields) return ErrorType.Validation;

    if (err?.response?.status) {
      const status = err.response.status;
      if (status === 400) return ErrorType.Validation;
      if (status === 401) return ErrorType.Auth;
      if (status === 403) return ErrorType.Permission;
      if (status >= 500) return ErrorType.Server;
      return ErrorType.Business;
    }

    if (err?.request) return ErrorType.Network;

    return ErrorType.Unknown;
  }

  /**
   * 带重试按钮的错误通知
   *
   * @param error 错误对象
   * @param onRetry 重试回调函数
   * @param options 配置选项
   * @returns 错误消息
   */
  showErrorWithRetry(
    error: unknown,
    onRetry?: () => void,
    options: {
      title?: string;
      defaultMsg?: string;
      duration?: number;
    } = {}
  ): string {
    const { title = '操作失败', defaultMsg = '操作失败，请稍后重试', duration = 0 } = options;

    let errorMsg = defaultMsg;
    const err = error as { response?: { status?: number; data?: { message?: string } }; code?: string; message?: string };
    const errorType = this.getErrorType(error);
    const retryable = onRetry ? this.isRetryableError(error) : false;

    // 根据错误类型获取友好消息
    if (err?.response) {
      const status = err.response.status;
      const data = err.response.data;

      if (status === 400) {
        errorMsg = data?.message || '请求参数错误，请检查输入后重试';
      } else if (status === 401) {
        errorMsg = '登录已过期，请重新登录';
      } else if (status === 403) {
        errorMsg = '您没有权限执行此操作，请联系管理员开通权限';
      } else if (status === 404) {
        errorMsg = '请求的资源不存在';
      } else if (status === 500) {
        errorMsg = data?.message || '服务器开小差了，请稍后重试';
      } else if (status && status >= 500) {
        errorMsg = '服务暂时不可用，请稍后重试';
      } else {
        errorMsg = data?.message || `请求失败 (${status})`;
      }
    } else if (err?.code === 'ECONNABORTED') {
      errorMsg = '请求超时，请检查网络后重试';
    } else if (err?.message?.includes('Network') || err?.message?.includes('网络')) {
      errorMsg = '网络连接异常，请检查网络设置';
    } else if (err?.message) {
      errorMsg = err.message;
    }

    const traceId = logger.error('操作失败', {
      message: errorMsg,
      type: errorType,
      retryable
    });

    let btn: React.ReactNode | undefined;
    if (retryable) {
      btn = React.createElement(
        'button',
        {
          className: 'ant-btn ant-btn-primary ant-btn-sm',
          onClick: () => {
            notification.destroy(traceId);
            onRetry?.();
          },
        },
        '重试'
      );
    }

    const description = React.createElement(
      'div',
      null,
      React.createElement('div', null, errorMsg),
      React.createElement(
        'div',
        { style: { marginTop: 8, fontSize: 12, color: '#999' } },
        '追踪ID: ',
        traceId
      )
    );

    notification.error({
      key: traceId,
      message: title,
      description,
      btn,
      duration,
    });

    return errorMsg;
  }

  /**
   * 处理业务错误
   */
  handleBusinessError(msg: string, data?: unknown): string {
    const traceId = logger.error('业务错误', data);
    message.error(`${msg} (${traceId})`);
    return msg;
  }

  /**
   * 通用错误处理
   */
  handleError(error: unknown, defaultMsg = '操作失败'): string {
    const err = error as { response?: unknown; request?: unknown; message?: string; errorFields?: unknown };
    // 判断错误类型并调用相应的处理方法
    if (err?.errorFields) {
      // 表单验证错误
      return this.handleFormValidationError(error);
    } else if (err?.response || err?.request) {
      // 网络/接口错误
      return this.handleApiError(error, defaultMsg);
    } else if (err?.message) {
      // 其他错误
      const traceId = logger.error(defaultMsg, error);
      message.error(`${defaultMsg} (${traceId})`);
      return err.message;
    }

    const traceId = logger.error(defaultMsg, error);
    message.error(`${defaultMsg} (${traceId})`);
    return defaultMsg;
  }

  /**
   * 显示成功提示
   */
  showSuccess(msg: string) {
    logger.info('操作成功', { message: msg });
    message.success(msg);
  }

  /**
   * 显示信息提示
   */
  showInfo(msg: string) {
    logger.info('信息', { message: msg });
    message.info(msg);
  }

  /**
   * 显示警告提示
   */
  showWarning(msg: string) {
    logger.warn('警告', { message: msg });
    message.warning(msg);
  }
}

export const errorHandler = new ErrorHandler();
