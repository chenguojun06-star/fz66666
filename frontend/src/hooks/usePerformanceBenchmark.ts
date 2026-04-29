import { useDeviceCapability, type DeviceTier } from './useDeviceCapability';

export interface PerformanceBenchmark {
  fcp: number | null;
  lcp: number | null;
  cls: number | null;
  fid: number | null;
  ttfb: number | null;
  deviceTier: DeviceTier;
  timestamp: number;
  url: string;
  memoryUsedMB: number | null;
  jsHeapSizeMB: number | null;
}

export function measurePerformance(): PerformanceBenchmark {
  const { tier } = useDeviceCapability.prototype ? { tier: 'high' as DeviceTier } : { tier: 'high' as DeviceTier };

  let fcp: number | null = null;
  let lcp: number | null = null;
  let cls: number | null = null;
  let fid: number | null = null;
  let ttfb: number | null = null;

  try {
    const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (navEntry) {
      ttfb = Math.round(navEntry.responseStart - navEntry.requestStart);
    }

    const paintEntries = performance.getEntriesByType('paint');
    for (const entry of paintEntries) {
      if (entry.name === 'first-contentful-paint') {
        fcp = Math.round(entry.startTime);
      }
    }

    if (typeof PerformanceObserver !== 'undefined') {
      try {
        const lcpEntries = performance.getEntriesByName('largest-contentful-paint');
        if (lcpEntries.length > 0) {
          lcp = Math.round(lcpEntries[lcpEntries.length - 1].startTime);
        }
      } catch { /* ignore */ }

      try {
        const clsEntries = performance.getEntriesByName('layout-shift');
        let clsValue = 0;
        for (const entry of clsEntries) {
          if (!(entry as any).hadRecentInput) {
            clsValue += (entry as any).value || 0;
          }
        }
        cls = Math.round(clsValue * 1000) / 1000;
      } catch { /* ignore */ }

      try {
        const fidEntries = performance.getEntriesByName('first-input');
        if (fidEntries.length > 0) {
          fid = Math.round((fidEntries[0] as any).processingStart - (fidEntries[0] as any).startTime);
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  let memoryUsedMB: number | null = null;
  let jsHeapSizeMB: number | null = null;
  try {
    const mem = (performance as any).memory;
    if (mem) {
      memoryUsedMB = Math.round(mem.usedJSHeapSize / 1048576);
      jsHeapSizeMB = Math.round(mem.jsHeapSizeLimit / 1048576);
    }
  } catch { /* ignore */ }

  return {
    fcp,
    lcp,
    cls,
    fid,
    ttfb,
    deviceTier: tier,
    timestamp: Date.now(),
    url: window.location.href,
    memoryUsedMB,
    jsHeapSizeMB,
  };
}

export function runBenchmarkAndReport(): PerformanceBenchmark {
  const benchmark = measurePerformance();

  try {
    const stored = localStorage.getItem('perf_benchmarks');
    const benchmarks: PerformanceBenchmark[] = stored ? JSON.parse(stored) : [];
    benchmarks.push(benchmark);
    if (benchmarks.length > 20) benchmarks.splice(0, benchmarks.length - 20);
    localStorage.setItem('perf_benchmarks', JSON.stringify(benchmarks));
  } catch { /* ignore */ }

  return benchmark;
}

export function getBenchmarkHistory(): PerformanceBenchmark[] {
  try {
    const stored = localStorage.getItem('perf_benchmarks');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function formatBenchmarkReport(benchmark: PerformanceBenchmark): string {
  const lines = [
    '=== 性能基准测试报告 ===',
    `时间: ${new Date(benchmark.timestamp).toLocaleString()}`,
    `页面: ${benchmark.url}`,
    `设备等级: ${benchmark.deviceTier}`,
    '',
    '--- 核心指标 ---',
    `FCP (首次内容绘制): ${benchmark.fcp ?? 'N/A'} ms`,
    `LCP (最大内容绘制): ${benchmark.lcp ?? 'N/A'} ms`,
    `CLS (累积布局偏移): ${benchmark.cls ?? 'N/A'}`,
    `FID (首次输入延迟): ${benchmark.fid ?? 'N/A'} ms`,
    `TTFB (首字节时间): ${benchmark.ttfb ?? 'N/A'} ms`,
    '',
    '--- 内存使用 ---',
    `JS 堆已用: ${benchmark.memoryUsedMB ?? 'N/A'} MB`,
    `JS 堆上限: ${benchmark.jsHeapSizeMB ?? 'N/A'} MB`,
  ];

  if (benchmark.fcp !== null) {
    if (benchmark.fcp <= 1800) lines.push('', '✅ FCP 优秀 (< 1.8s)');
    else if (benchmark.fcp <= 3000) lines.push('', '⚠️ FCP 需优化 (1.8s - 3s)');
    else lines.push('', '❌ FCP 较差 (> 3s)');
  }

  return lines.join('\n');
}
