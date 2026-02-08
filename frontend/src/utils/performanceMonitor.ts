/**
 * 前端业务逻辑性能监控工具
 * 用于追踪 API 调用、页面渲染、业务操作的性能
 */

interface PerformanceMetric {
  name: string;
  durations: number[];
  errors: number;
  lastCall: number;
}

interface PerformanceReport {
  name: string;
  调用次数: number;
  平均耗时: string;
  最大耗时: string;
  最小耗时: string;
  错误次数: number;
  最后调用: string;
}

class PerformanceMonitor {
  private static metrics: Map<string, PerformanceMetric> = new Map();
  private static enabled: boolean = true;

  /**
   * 监控 API 调用性能
   */
  static async trackApiCall<T>(
    name: string,
    fn: () => Promise<T>,
    threshold: number = 1000
  ): Promise<T> {
    if (!this.enabled) return fn();

    const start = performance.now();
    const fullName = `[API] ${name}`;

    try {
      const result = await fn();
      const duration = performance.now() - start;

      this.recordMetric(fullName, duration, false);

      // 慢 API 警告
      if (duration > threshold) {
        console.warn(
          `🐌 慢API: ${name}`,
          `耗时: ${duration.toFixed(2)}ms`,
          `阈值: ${threshold}ms`
        );
      }

      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMetric(fullName, duration, true);

      console.error(
        `❌ API失败: ${name}`,
        `耗时: ${duration.toFixed(2)}ms`,
        error
      );
      throw error;
    }
  }

  /**
   * 监控同步业务操作
   */
  static track(name: string, fn: () => void, threshold: number = 100): void {
    if (!this.enabled) {
      fn();
      return;
    }

    const start = performance.now();
    const fullName = `[操作] ${name}`;

    try {
      fn();
      const duration = performance.now() - start;
      this.recordMetric(fullName, duration, false);

      if (duration > threshold) {
        console.warn(
          `🐌 慢操作: ${name}`,
          `耗时: ${duration.toFixed(2)}ms`,
          `阈值: ${threshold}ms`
        );
      }
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMetric(fullName, duration, true);
      throw error;
    }
  }

  /**
   * 监控异步业务操作
   */
  static async trackAsync<T>(
    name: string,
    fn: () => Promise<T>,
    threshold: number = 100
  ): Promise<T> {
    if (!this.enabled) return fn();

    const start = performance.now();
    const fullName = `[异步操作] ${name}`;

    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.recordMetric(fullName, duration, false);

      if (duration > threshold) {
        console.warn(
          `🐌 慢操作: ${name}`,
          `耗时: ${duration.toFixed(2)}ms`,
          `阈值: ${threshold}ms`
        );
      }

      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMetric(fullName, duration, true);
      throw error;
    }
  }

  /**
   * 记录指标
   */
  private static recordMetric(
    name: string,
    duration: number,
    isError: boolean
  ): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, {
        name,
        durations: [],
        errors: 0,
        lastCall: Date.now(),
      });
    }

    const metric = this.metrics.get(name)!;
    metric.durations.push(duration);
    metric.lastCall = Date.now();

    if (isError) {
      metric.errors++;
    }

    // 限制保存的数据点数量（最多100个）
    if (metric.durations.length > 100) {
      metric.durations.shift();
    }
  }

  /**
   * 获取性能报告
   */
  static getReport(): PerformanceReport[] {
    const report: PerformanceReport[] = [];

    this.metrics.forEach((metric) => {
      if (metric.durations.length === 0) return;

      const avg =
        metric.durations.reduce((a, b) => a + b, 0) / metric.durations.length;
      const max = Math.max(...metric.durations);
      const min = Math.min(...metric.durations);

      report.push({
        name: metric.name,
        调用次数: metric.durations.length,
        平均耗时: `${avg.toFixed(2)}ms`,
        最大耗时: `${max.toFixed(2)}ms`,
        最小耗时: `${min.toFixed(2)}ms`,
        错误次数: metric.errors,
        最后调用: new Date(metric.lastCall).toLocaleString('zh-CN'),
      });
    });

    // 按调用次数排序
    return report.sort((a, b) => b.调用次数 - a.调用次数);
  }

  /**
   * 获取最慢的操作
   */
  static getSlowestOperations(limit: number = 5): PerformanceReport[] {
    const report = this.getReport();
    return report
      .sort((a, b) => parseFloat(b.平均耗时) - parseFloat(a.平均耗时))
      .slice(0, limit);
  }

  /**
   * 打印报告到控制台
   */
  static printReport(): void {
    console.group('📊 性能监控报告');
    console.table(this.getReport());
    console.groupEnd();

    console.group('🐌 最慢的5个操作');
    console.table(this.getSlowestOperations());
    console.groupEnd();
  }

  /**
   * 清空所有统计数据
   */
  static clear(): void {
    this.metrics.clear();
  }

  /**
   * 启用/禁用监控
   */
  static setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * 导出数据为 JSON
   */
  static exportData(): string {
    const data = {
      timestamp: new Date().toISOString(),
      metrics: this.getReport(),
    };
    return JSON.stringify(data, null, 2);
  }
}

// 在开发环境下自动启用，并暴露到全局
const perfMetaEnv = (import.meta as unknown as { env?: { DEV?: boolean } }).env;
if (perfMetaEnv?.DEV) {
  (window as Window & { performanceMonitor?: typeof PerformanceMonitor }).performanceMonitor = PerformanceMonitor;

  // 定时输出报告（每2分钟）
  setInterval(() => {
    if (PerformanceMonitor.getReport().length > 0) {
      PerformanceMonitor.printReport();
    }
  }, 120000);

}

export default PerformanceMonitor;

/**
 * 使用示例：
 *
 * // 1. 监控 API 调用
 * import PerformanceMonitor from '@/utils/performanceMonitor';
 *
 * const fetchOrders = async () => {
 *   return PerformanceMonitor.trackApiCall('获取订单列表', async () => {
 *     const result = await api.get('/order/list');
 *     return result.data;
 *   });
 * };
 *
 * // 2. 监控同步操作
 * PerformanceMonitor.track('计算订单统计', () => {
 *   // 复杂计算逻辑
 *   const stats = calculateOrderStats(orders);
 *   setStats(stats);
 * });
 *
 * // 3. 监控异步操作
 * await PerformanceMonitor.trackAsync('处理裁剪数据', async () => {
 *   await processCuttingData(data);
 * });
 *
 * // 4. 查看报告（在控制台）
 * performanceMonitor.printReport();
 *
 * // 5. 获取最慢的操作
 * performanceMonitor.getSlowestOperations(10);
 */
