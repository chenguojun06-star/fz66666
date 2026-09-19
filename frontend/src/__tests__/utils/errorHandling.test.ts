import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { logger, errorHandler } from '../../utils/errorHandling';

vi.mock('@/utils/antdStatic', () => ({
  message: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

describe('Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    logger.clear();
  });

  it('应该记录不同级别的日志', () => {
    logger.debug('debug message');
    logger.info('info message');
    logger.warn('warn message');
    const traceId = logger.error('error message');

    expect(traceId).toMatch(/^TRC-\d+-\w{9}$/);
  });

  it('应该限制日志数量', () => {
    for (let i = 0; i < 1100; i++) {
      logger.info(`log ${i}`);
    }

    const logs = logger.getLogs();
    expect(logs.length).toBe(1000);
  });

  it('应该导出日志为JSON', () => {
    logger.info('test log', { data: 'test' });
    const json = logger.exportJson();
    
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json);
    expect(parsed.length).toBe(1);
    expect(parsed[0].message).toBe('test log');
  });

  it('应该获取最近的日志', () => {
    for (let i = 0; i < 50; i++) {
      logger.info(`log ${i}`);
    }

    const recent = logger.getRecent(10);
    expect(recent.length).toBe(10);
    expect(recent[0].message).toBe('log 40');
  });

  it('应该清空日志', () => {
    logger.info('test');
    logger.clear();
    
    const logs = logger.getLogs();
    expect(logs.length).toBe(0);
  });
});

describe('ErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleFormValidationError', () => {
    it('应该处理表单验证错误', () => {
      const error = {
        errorFields: [
          { errors: ['字段1不能为空'] },
          { errors: ['字段2格式错误'] },
        ],
      };

      const result = errorHandler.handleFormValidationError(error);
      
      expect(result).toBe('表单验证失败：字段1不能为空；字段2格式错误');
    });

    it('应该处理单个字段错误', () => {
      const error = {
        errorFields: [
          { errors: ['字段不能为空'] },
        ],
      };

      const result = errorHandler.handleFormValidationError(error);
      
      expect(result).toBe('字段不能为空');
    });

    it('应该处理空错误字段', () => {
      const result = errorHandler.handleFormValidationError({ errorFields: [] });
      
      expect(result).toBe('表单验证失败');
    });
  });

  describe('handleNetworkError', () => {
    it('应该处理超时错误', () => {
      const error = { code: 'ECONNABORTED' };
      
      const result = errorHandler.handleNetworkError(error);
      
      expect(result).toBe('请求超时，请稍后重试');
    });

    it('应该处理连接失败', () => {
      const error = { response: { status: 0 } };
      
      const result = errorHandler.handleNetworkError(error);
      
      expect(result).toBe('无法连接到服务器，请检查网络');
    });

    it('应该处理通用网络错误', () => {
      const error = { message: 'Network Error' };
      
      const result = errorHandler.handleNetworkError(error);
      
      expect(result).toBe('网络连接异常，请检查网络设置');
    });
  });

  describe('handleApiError', () => {
    it('应该处理400错误', () => {
      const error = {
        response: { status: 400, data: { message: '参数错误' } },
      };
      
      const result = errorHandler.handleApiError(error);
      
      expect(result).toBe('参数错误');
    });

    it('应该处理401错误', () => {
      const error = { response: { status: 401 } };
      
      const result = errorHandler.handleApiError(error);
      
      expect(result).toBe('请登录后继续');
    });

    it('应该处理403错误', () => {
      const error = { response: { status: 403 } };
      
      const result = errorHandler.handleApiError(error);
      
      expect(result).toBe('您没有权限执行此操作');
    });

    it('应该处理404错误', () => {
      const error = { response: { status: 404 } };
      
      const result = errorHandler.handleApiError(error);
      
      expect(result).toBe('资源不存在');
    });

    it('应该处理500错误', () => {
      const error = { response: { status: 500 } };
      
      const result = errorHandler.handleApiError(error);
      
      expect(result).toBe('服务器开小差了，请稍后重试');
    });

    it('应该处理服务器无响应', () => {
      const error = { request: {} };
      
      const result = errorHandler.handleApiError(error);
      
      expect(result).toBe('服务器无响应，请检查网络连接');
    });

    it('应该处理未知错误', () => {
      const error = { message: 'unknown error' };
      
      const result = errorHandler.handleApiError(error);
      
      expect(result).toBe('unknown error');
    });
  });

  describe('handleBusinessError', () => {
    it('应该处理业务错误', () => {
      const result = errorHandler.handleBusinessError('业务规则验证失败', { data: 'test' });
      
      expect(result).toBe('业务规则验证失败');
    });
  });

  describe('handleError', () => {
    it('应该正确识别并处理表单验证错误', () => {
      const error = { errorFields: [{ errors: ['字段错误'] }] };
      
      const result = errorHandler.handleError(error);
      
      expect(result).toBe('字段错误');
    });

    it('应该正确识别并处理API错误', () => {
      const error = { response: { status: 404 } };
      
      const result = errorHandler.handleError(error);
      
      expect(result).toBe('资源不存在');
    });

    it('应该正确处理通用错误', () => {
      const error = { message: 'something went wrong' };
      
      const result = errorHandler.handleError(error);
      
      expect(result).toBe('something went wrong');
    });

    it('应该处理未知错误类型', () => {
      const result = errorHandler.handleError('unknown error', '默认消息');
      
      expect(result).toBe('默认消息');
    });
  });

  describe('提示方法', () => {
    it('showSuccess应该显示成功提示', () => {
      errorHandler.showSuccess('操作成功');
    });

    it('showInfo应该显示信息提示', () => {
      errorHandler.showInfo('信息提示');
    });

    it('showWarning应该显示警告提示', () => {
      errorHandler.showWarning('警告信息');
    });
  });
});
