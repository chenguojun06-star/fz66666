/**
 * 扫码离线缓存队列
 *
 * 无网络时将扫码数据持久化到本地 storage，联网恢复后自动批量上传。
 * 设计原则：
 * - 纯同步读写（wx.getStorageSync），无副作用
 * - 限制最大队列长度，防止 storage 膨胀
 * - queueId 保证每条记录可单独移除
 *
 * @version 1.0
 * @date 2026-03-02
 */

const QUEUE_KEY = 'scan_offline_queue';
const MAX_QUEUE_SIZE = 50; // 最多缓存 50 条，超出则丢弃最新（保护 storage）

// ─── 私有实现 ────────────────────────────────────────────────────────────────

function _load() {
  try {
    const raw = wx.getStorageSync(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function _save(queue) {
  try {
    wx.setStorageSync(QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn('[ScanOfflineQueue] storage 写入失败:', e);
  }
}

// ─── 公开 API ─────────────────────────────────────────────────────────────────

const ScanOfflineQueue = {
  /**
   * 当前待上传条数
   * @returns {number}
   */
  count() {
    return _load().length;
  },

  /**
   * 队列是否已满
   * @returns {boolean}
   */
  isFull() {
    return _load().length >= MAX_QUEUE_SIZE;
  },

  /**
   * 将一条扫码数据加入队列
   * @param {Object} scanData - 即将提交给后端的原始 scanData
   * @returns {boolean} 是否入队成功（队满时返回 false）
   */
  enqueue(scanData) {
    const queue = _load();
    if (queue.length >= MAX_QUEUE_SIZE) {
      console.warn('[ScanOfflineQueue] 队列已满（' + MAX_QUEUE_SIZE + '条），丢弃');
      return false;
    }
    const item = {
      queueId: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      queuedAt: Date.now(),
      scanData: { ...scanData },
    };
    queue.push(item);
    _save(queue);
    console.log('[ScanOfflineQueue] 已入队，当前数量:', queue.length);
    return true;
  },

  /**
   * 移除指定条目（上传成功后调用）
   * @param {string} queueId
   */
  dequeue(queueId) {
    const queue = _load().filter(i => i.queueId !== queueId);
    _save(queue);
  },

  /**
   * 获取全部待上传条目（可供调试/展示）
   * @returns {Array}
   */
  getAll() {
    return _load();
  },

  /**
   * 清空队列
   */
  clear() {
    _save([]);
  },

  /**
   * 批量上传队列中的所有扫码数据
   *
   * - 逐条上传，成功后立即从队列移除
   * - 遇到网络类错误时立即停止（不继续重试），等待下次调用
   * - 业务拒绝（如重复扫码）：移除该条，不计入 failed（已无意义重传）
   *
   * @param {Object} api          - utils/api 对象
   * @param {Function} [onProgress] - 进度回调 (submitted, failed, remaining)
   * @returns {Promise<{submitted: number, failed: number}>}
   */
  async flush(api, onProgress) {
    const queue = _load();
    if (queue.length === 0) return { submitted: 0, failed: 0 };

    let submitted = 0;
    let failed = 0;
    const total = queue.length;
    console.log('[ScanOfflineQueue] 开始批量上传，共', total, '条');

    for (const item of queue) {
      try {
        const res = await api.production.executeScan(item.scanData);
        if (res && (res.success === true || res.code === 200 || res.scanRecord)) {
          // ✅ 上传成功
          this.dequeue(item.queueId);
          submitted++;
          console.log('[ScanOfflineQueue] 上传成功:', submitted + '/' + total);
        } else {
          // 业务拒绝（如重复扫码），直接丢弃，不重传
          this.dequeue(item.queueId);
          console.warn('[ScanOfflineQueue] 服务端拒绝（直接丢弃）:', res?.message);
        }
      } catch (e) {
        failed++;
        const errMsg = (e && (e.errMsg || e.message)) || '';
        console.warn('[ScanOfflineQueue] 上传异常:', errMsg);
        // 网络仍断开 → 停止本次 flush，等待下次触发
        if (
          errMsg.includes('timeout') ||
          errMsg.includes('errcode:-101') ||
          errMsg.includes('errcode:-102') ||
          errMsg.includes('errcode:-105') ||
          errMsg.includes('ERR_CONNECTION') ||
          errMsg.includes('fail network')
        ) {
          console.log('[ScanOfflineQueue] 网络仍断开，停止上传');
          break;
        }
      }

      if (onProgress) {
        onProgress(submitted, failed, this.count());
      }
    }

    console.log('[ScanOfflineQueue] 批量上传完成 submitted=' + submitted + ' failed=' + failed + ' remaining=' + this.count());
    return { submitted, failed };
  },
};

module.exports = ScanOfflineQueue;
