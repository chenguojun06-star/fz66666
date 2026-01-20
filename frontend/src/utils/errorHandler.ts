import { message } from 'antd';

/**
 * 统一错误处理工具
 */
export const errorHandler = {
  /**
   * 处理API请求错误
   * @param error 错误对象
   * @param defaultMessage 默认错误提示
   * @returns 错误信息字符串
   */
  handleApiError: (error: any, defaultMessage: string = '操作失败'): string => {
    let errorMessage = defaultMessage;

    if (error?.response) {
      // 服务器返回了错误响应
      const result = error.response.data;
      const status = error.response.status;
      errorMessage = result?.message || `请求失败 (${status})`;
    } else if (error?.request) {
      // 请求发送成功但没有收到响应
      errorMessage = '服务器无响应，请稍后重试';
    } else if (error?.message) {
      // 其他错误
      errorMessage = error.message;
    }

    // 显示错误消息
    message.error(errorMessage);
    return errorMessage;
  },

  /**
   * 处理表单验证错误
   * @param error 错误对象
   * @param defaultMessage 默认错误提示
   * @returns 错误信息字符串
   */
  handleFormError: (error: any, defaultMessage: string = '表单验证失败'): string => {
    let errorMessage = defaultMessage;

    // 处理Ant Design Form的验证错误
    if (error?.errorFields && error.errorFields.length > 0) {
      const firstError = error.errorFields[0];
      errorMessage = firstError.errors[0] || defaultMessage;
    } else if (error?.message) {
      errorMessage = error.message;
    }

    // 显示错误消息
    message.error(errorMessage);
    return errorMessage;
  },

  /**
   * 处理通用错误
   * @param error 错误对象
   * @param defaultMessage 默认错误提示
   * @returns 错误信息字符串
   */
  handleError: (error: any, defaultMessage: string = '操作失败'): string => {
    if (error?.errorFields) {
      // 表单验证错误
      return errorHandler.handleFormError(error, defaultMessage);
    } else {
      // 接口错误或其他错误
      return errorHandler.handleApiError(error, defaultMessage);
    }
  }
};

export default errorHandler;
