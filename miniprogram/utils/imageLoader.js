/**
 * 图片加载和缓存工具
 * 提供图片预加载、懒加载、缓存管理等功能
 */

// 图片缓存池
const imageCache = new Map();

// 最大缓存数量
const MAX_CACHE_SIZE = 50;

/**
 * 预加载单张图片
 * @param {string} url - 图片URL
 * @returns {Promise<Object>} 图片信息
 */
function preloadImage(url) {
  if (!url) {
    return Promise.reject(new Error('URL is required'));
  }

  // 检查缓存
  if (imageCache.has(url)) {
    return Promise.resolve(imageCache.get(url));
  }

  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src: url,
      success: (res) => {
        // 缓存图片信息
        cacheImage(url, res);
        resolve(res);
      },
      fail: reject,
    });
  });
}

/**
 * 预加载多张图片
 * @param {string[]} urls - 图片URL数组
 * @param {Function} onProgress - 进度回调 (current, total)
 * @returns {Promise<Object[]>} 图片信息数组
 */
async function preloadImages(urls, onProgress) {
  if (!urls || urls.length === 0) {
    return [];
  }

  const results = [];
  const total = urls.length;

  for (let i = 0; i < urls.length; i++) {
    try {
      const info = await preloadImage(urls[i]);
      results.push(info);
    } catch (e) {
      results.push(null);
    }

    if (onProgress) {
      onProgress(i + 1, total);
    }
  }

  return results;
}

/**
 * 缓存图片信息
 * @param {string} url - 图片URL
 * @param {Object} info - 图片信息
 */
function cacheImage(url, info) {
  // 如果缓存已满，删除最早的缓存
  if (imageCache.size >= MAX_CACHE_SIZE) {
    const firstKey = imageCache.keys().next().value;
    imageCache.delete(firstKey);
  }

  imageCache.set(url, {
    ...info,
    cacheTime: Date.now(),
  });
}

/**
 * 获取缓存的图片信息
 * @param {string} url - 图片URL
 * @returns {Object|null} 图片信息
 */
function getCachedImage(url) {
  return imageCache.get(url) || null;
}

/**
 * 检查图片是否已缓存
 * @param {string} url - 图片URL
 * @returns {boolean}
 */
function isImageCached(url) {
  return imageCache.has(url);
}

/**
 * 清除图片缓存
 * @param {string} [url] - 指定URL，不传则清除所有
 */
function clearImageCache(url) {
  if (url) {
    imageCache.delete(url);
  } else {
    imageCache.clear();
  }
}

/**
 * 获取缓存统计
 * @returns {Object} 缓存统计信息
 */
function getCacheStats() {
  return {
    size: imageCache.size,
    maxSize: MAX_CACHE_SIZE,
    urls: Array.from(imageCache.keys()),
  };
}

/**
 * 懒加载图片（用于长列表）
 * @param {string} url - 图片URL
 * @param {Object} options - 配置选项
 * @param {number} options.threshold - 提前加载的阈值（像素）
 * @returns {Promise<Object>}
 */
function lazyLoadImage(url, options = {}) {
  const { threshold = 100 } = options;

  return new Promise((resolve, reject) => {
    // 创建IntersectionObserver（小程序基础库2.0以上支持）
    if (wx.createIntersectionObserver) {
      const observer = wx.createIntersectionObserver({
        thresholds: [0],
        initialRatio: 0,
      });

      observer.relativeToViewport({ bottom: threshold });
      observer.observe(url, (res) => {
        if (res.intersectionRatio > 0) {
          preloadImage(url)
            .then(resolve)
            .catch(reject);
          observer.disconnect();
        }
      });
    } else {
      // 不支持IntersectionObserver，直接加载
      preloadImage(url)
        .then(resolve)
        .catch(reject);
    }
  });
}

/**
 * 下载图片到本地（用于需要本地路径的场景）
 * @param {string} url - 图片URL
 * @returns {Promise<string>} 本地临时文件路径
 */
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode === 200) {
          resolve(res.tempFilePath);
        } else {
          reject(new Error(`Download failed with status ${res.statusCode}`));
        }
      },
      fail: reject,
    });
  });
}

/**
 * 获取图片尺寸（优先从缓存）
 * @param {string} url - 图片URL
 * @returns {Promise<{width: number, height: number}>}
 */
async function getImageSize(url) {
  const cached = getCachedImage(url);
  if (cached && cached.width && cached.height) {
    return {
      width: cached.width,
      height: cached.height,
    };
  }

  const info = await preloadImage(url);
  return {
    width: info.width,
    height: info.height,
  };
}

/**
 * 计算图片显示尺寸（保持比例）
 * @param {Object} options - 配置选项
 * @param {number} options.originalWidth - 原始宽度
 * @param {number} options.originalHeight - 原始高度
 * @param {number} options.maxWidth - 最大显示宽度
 * @param {number} options.maxHeight - 最大显示高度
 * @returns {{width: number, height: number}} 计算后的尺寸
 */
function calculateImageSize({
  originalWidth,
  originalHeight,
  maxWidth,
  maxHeight,
}) {
  if (!originalWidth || !originalHeight) {
    return { width: maxWidth, height: maxHeight };
  }

  const ratio = originalWidth / originalHeight;
  let width = maxWidth;
  let height = maxWidth / ratio;

  if (height > maxHeight) {
    height = maxHeight;
    width = maxHeight * ratio;
  }

  return {
    width: Math.round(width),
    height: Math.round(height),
  };
}

module.exports = {
  preloadImage,
  preloadImages,
  cacheImage,
  getCachedImage,
  isImageCached,
  clearImageCache,
  getCacheStats,
  lazyLoadImage,
  downloadImage,
  getImageSize,
  calculateImageSize,
};
