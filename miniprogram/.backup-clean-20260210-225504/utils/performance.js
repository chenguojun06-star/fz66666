/**
 * 性能优化工具
 * 提供setData优化、防抖、节流等性能优化功能
 */

/**
 * 批量setData优化
 * 将多个setData调用合并为一次，减少渲染次数
 *
 * @example
 * const batchSetData = createBatchSetData(this);
 * batchSetData({ a: 1 });
 * batchSetData({ b: 2 });
 * batchSetData({ c: 3 });
 * // 最终只调用一次setData({ a: 1, b: 2, c: 3 })
 */
function createBatchSetData(pageInstance, delay = 0) {
  let dataBuffer = {};
  let timer = null;

  return function setData(data) {
    // 合并数据
    Object.assign(dataBuffer, data);

    // 清除之前的定时器
    if (timer) {
      clearTimeout(timer);
    }

    // 延迟执行setData
    timer = setTimeout(() => {
      if (Object.keys(dataBuffer).length > 0) {
        pageInstance.setData(dataBuffer);
        dataBuffer = {};
      }
      timer = null;
    }, delay);
  };
}

/**
 * 防抖函数
 * @param {Function} fn - 要执行的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
function debounce(fn, delay = 300) {
  let timer = null;

  return function (...args) {
    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      fn.apply(this, args);
      timer = null;
    }, delay);
  };
}

/**
 * 节流函数
 * @param {Function} fn - 要执行的函数
 * @param {number} interval - 间隔时间（毫秒）
 * @returns {Function} 节流后的函数
 */
function throttle(fn, interval = 300) {
  let lastTime = 0;
  let timer = null;

  return function (...args) {
    const now = Date.now();

    if (now - lastTime >= interval) {
      // 直接执行
      lastTime = now;
      fn.apply(this, args);
    } else {
      // 延迟执行
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        lastTime = Date.now();
        fn.apply(this, args);
        timer = null;
      }, interval - (now - lastTime));
    }
  };
}

/**
 * 图片预加载
 * @param {string[]} urls - 图片URL数组
 * @returns {Promise<void>}
 */
function preloadImages(urls) {
  if (!urls || urls.length === 0) {
    return Promise.resolve();
  }

  const promises = urls.map(url => {
    return new Promise((resolve) => {
      wx.getImageInfo({
        src: url,
        success: () => resolve(),
        fail: () => resolve(), // 即使失败也继续
      });
    });
  });

  return Promise.all(promises);
}

/**
 * 列表数据分页加载优化
 * @param {Object} options - 配置选项
 * @param {number} options.page - 当前页码
 * @param {number} options.pageSize - 每页数量
 * @param {Array} options.currentList - 当前列表数据
 * @param {Array} options.newData - 新加载的数据
 * @param {string} options.listKey - 列表在data中的key
 * @returns {Object} setData数据对象
 */
function optimizeListData({
  page = 1,
  pageSize = 10,
  currentList = [],
  newData = [],
  listKey = 'list',
}) {
  // 如果是第一页，直接替换
  if (page === 1) {
    return {
      [listKey]: newData,
      [`${listKey}Page`]: page,
      [`${listKey}HasMore`]: newData.length >= pageSize,
    };
  }

  // 如果不是第一页，合并数据
  // 使用concat而不是展开运算符，避免大数据量时的性能问题
  const mergedList = currentList.length > 0
    ? currentList.concat(newData)
    : newData;

  return {
    [listKey]: mergedList,
    [`${listKey}Page`]: page,
    [`${listKey}HasMore`]: newData.length >= pageSize,
  };
}

/**
 * 计算列表差异，只更新变化的部分
 * @param {Array} oldList - 旧列表
 * @param {Array} newList - 新列表
 * @param {string} keyField - 唯一标识字段
 * @returns {Object} 差异对象 { changed: [], added: [], removed: [] }
 */
function diffList(oldList = [], newList = [], keyField = 'id') {
  const oldMap = new Map(oldList.map(item => [item[keyField], item]));
  const newMap = new Map(newList.map(item => [item[keyField], item]));

  const changed = [];
  const added = [];
  const removed = [];

  // 找出新增和变化的
  for (const [key, newItem] of newMap) {
    const oldItem = oldMap.get(key);
    if (!oldItem) {
      added.push(newItem);
    } else if (JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
      changed.push({ key, newItem });
    }
  }

  // 找出删除的
  for (const key of oldMap.keys()) {
    if (!newMap.has(key)) {
      removed.push(key);
    }
  }

  return { changed, added, removed };
}

module.exports = {
  createBatchSetData,
  debounce,
  throttle,
  preloadImages,
  optimizeListData,
  diffList,
};
