/**
 * 扫码组件
 *
 * 功能：
 * 1. 扫描二维码/条形码
 * 2. 解析扫描结果
 * 3. 防重复扫描
 *
 * 使用示例：
 * <qr-scanner
 *   bind:success="onScanSuccess"
 *   bind:error="onScanError">
 * </qr-scanner>
 */
Component({
  properties: {
    // 防重复扫描的时间间隔（毫秒）
    duplicateInterval: {
      type: Number,
      value: 2000,
    },
    // 是否自动扫描
    autoScan: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    scanning: false,
    recentScans: new Map(), // 最近扫描记录
  },

  lifetimes: {
    attached() {
      if (this.data.autoScan) {
        this.startScan();
      }
    },
    detached() {
      // 清理定时器
      this.clearRecentScans();
    },
  },

  methods: {
    /**
     * 开始扫描
     */
    startScan() {
      if (this.data.scanning) {
        return;
      }

      this.setData({ scanning: true });

      wx.scanCode({
        onlyFromCamera: true,
        scanType: ['qrCode', 'barCode'],
        success: res => {
          this.handleScanResult(res.result, res.scanType);
        },
        fail: err => {
          this.triggerEvent('error', {
            message: '扫码失败',
            error: err,
          });
        },
        complete: () => {
          this.setData({ scanning: false });
        },
      });
    },

    /**
     * 处理扫描结果
     */
    handleScanResult(result, scanType) {
      if (!result) {
        this.triggerEvent('error', { message: '扫描结果为空' });
        return;
      }

      // 防重复扫描检查
      if (this.isRecentDuplicate(result)) {
        wx.showToast({
          title: '重复扫描',
          icon: 'none',
          duration: 1500,
        });
        return;
      }

      // 标记为最近扫描
      this.markRecent(result);

      // 触发成功事件
      this.triggerEvent('success', {
        code: result,
        scanType: scanType,
        timestamp: Date.now(),
      });
    },

    /**
     * 检查是否是重复扫描
     */
    isRecentDuplicate(code) {
      const now = Date.now();
      const lastScanTime = this.data.recentScans.get(code);

      if (lastScanTime && now - lastScanTime < this.properties.duplicateInterval) {
        return true;
      }

      return false;
    },

    /**
     * 标记为最近扫描
     */
    markRecent(code) {
      const recentScans = this.data.recentScans;
      recentScans.set(code, Date.now());

      // 清理过期记录
      this.cleanupRecentScans();
    },

    /**
     * 清理过期的扫描记录
     */
    cleanupRecentScans() {
      const recentScans = this.data.recentScans;
      if (recentScans.size <= 80) {
        return;
      }

      const now = Date.now();
      const expiredKeys = [];

      for (const [code, time] of recentScans.entries()) {
        if (now - time > this.properties.duplicateInterval) {
          expiredKeys.push(code);
        }
      }

      expiredKeys.forEach(key => recentScans.delete(key));

      // 如果还是太多，删除最旧的20个
      if (recentScans.size > 80) {
        const entries = Array.from(recentScans.entries())
          .sort((a, b) => a[1] - b[1])
          .slice(0, 20);
        entries.forEach(([key]) => recentScans.delete(key));
      }
    },

    /**
     * 清除所有扫描记录
     */
    clearRecentScans() {
      this.data.recentScans.clear();
    },

    /**
     * 手动触发扫描（供外部调用）
     */
    scan() {
      this.startScan();
    },
  },
});
