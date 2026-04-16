const DB_NAME = 'fashion_h5_offline';
const DB_VERSION = 1;
const STORE_NAME = 'scan_queue';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

class ScanOfflineQueue {
  constructor() {
    this.db = null;
    this.flushing = false;
  }

  async init() {
    if (!this.db) {
      this.db = await openDB();
    }
    return this.db;
  }

  async enqueue(scanData) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record = {
        ...scanData,
        status: 'pending',
        createdAt: Date.now(),
        retryCount: 0,
      };
      const request = store.add(record);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getPending() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('status');
      const request = index.getAll('pending');
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getPendingCount() {
    const items = await this.getPending();
    return items.length;
  }

  async updateStatus(id, status) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const record = getReq.result;
        if (record) {
          record.status = status;
          record.updatedAt = Date.now();
          store.put(record);
        }
        resolve();
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  async remove(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async flush(api, onProgress) {
    if (this.flushing) return { submitted: 0, failed: 0 };
    this.flushing = true;

    let submitted = 0;
    let failed = 0;

    try {
      const pending = await this.getPending();
      if (pending.length === 0) return { submitted: 0, failed: 0 };

      for (const item of pending) {
        try {
          const res = await api.production.executeScan({
            scanCode: item.scanCode,
            scanType: item.scanType,
            quantity: item.quantity,
            processCode: item.processCode,
            orderId: item.orderId,
            bundleNo: item.bundleNo,
            requestId: item.requestId || `offline_${item.id}_${Date.now()}`,
          });
          await this.remove(item.id);
          submitted++;
          onProgress?.({ type: 'success', item, result: res });
        } catch (err) {
          item.retryCount = (item.retryCount || 0) + 1;
          if (item.retryCount >= 5) {
            await this.updateStatus(item.id, 'failed');
          }
          failed++;
          onProgress?.({ type: 'error', item, error: err });
        }
      }
    } finally {
      this.flushing = false;
    }

    return { submitted, failed };
  }

  async clearFailed() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('status');
      const request = index.openCursor('failed');
      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }
}

export const scanOfflineQueue = new ScanOfflineQueue();

export function isOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export function setupOfflineQueueSync(api, onSync) {
  const tryFlush = async () => {
    if (!isOnline()) return;
    const count = await scanOfflineQueue.getPendingCount();
    if (count > 0) {
      const result = await scanOfflineQueue.flush(api, onSync);
      if (result.submitted > 0 || result.failed > 0) {
        console.log(`[OfflineQueue] 同步完成: 成功=${result.submitted}, 失败=${result.failed}`);
      }
    }
  };

  window.addEventListener('online', tryFlush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isOnline()) {
      tryFlush();
    }
  });

  tryFlush();
  return tryFlush;
}
