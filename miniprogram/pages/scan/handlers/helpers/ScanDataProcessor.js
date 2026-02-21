/**
 * 扫码数据处理器
 *
 * 职责：
 * 1. 处理采购模式扫码
 * 2. 处理订单+items扫码
 * 3. 处理SKU数量计算
 * 4. 处理订单数量计算
 * 5. 订单详情获取
 *
 * @author GitHub Copilot
 * @date 2026-02-15
 */

class ScanDataProcessor {
  constructor(api) {
    this.api = api;
  }

  /**
   * 处理采购模式扫码
   * @param {Object} parsedData - 解析后的二维码数据
   * @param {Object} orderDetail - 订单详情
   * @param {string} scanMode - 扫码模式
   * @returns {Promise<Object>} 扫码结果
   */
  async handleProcurementMode(parsedData, orderDetail, scanMode) {
    try {
      const rawResult = await this.api.production.getMaterialPurchases({
        orderNo: parsedData.orderNo,
      });

      // 兼容：API可能返回数组或分页对象 { records: [...] }
      let materialPurchases = Array.isArray(rawResult)
        ? rawResult
        : (rawResult && Array.isArray(rawResult.records) ? rawResult.records : []);

      // 兜底：当采购单为空时，从BOM清单获取物料信息作为只读参考
      let bomFallback = false;
      if (materialPurchases.length === 0 && orderDetail) {
        const styleId = orderDetail.styleId || orderDetail.style_id;
        if (styleId) {
          try {
            // 使用构造函数注入的 this.api（包含 style 模块）
            const bomList = await this.api.style.getBomList({ styleId });
            if (Array.isArray(bomList) && bomList.length > 0) {
              materialPurchases = bomList.map((item, idx) => ({
                id: item.id || `bom_${idx}`,
                materialName: item.materialName || '未知物料',
                materialCode: item.materialCode || '',
                materialType: item.materialType || '',
                specifications: item.specification || '',
                unit: item.unit || '米',
                purchaseQuantity: item.usageAmount || 0,
                arrivedQuantity: 0,
                pendingQuantity: item.usageAmount || 0,
                unitPrice: item.unitPrice,
                remark: item.remark || '',
                _fromBom: true, // 标记来源为BOM
              }));
              bomFallback = true;
            }
          } catch (_bomErr) {
            console.warn('[ScanDataProcessor] 获取BOM清单失败:', _bomErr);
          }
        }
      }

      // 计算订单总数量
      const orderQty = parsedData.quantity
        || orderDetail.quantity || orderDetail.totalQuantity
        || orderDetail.totalNum || orderDetail.orderQuantity || 0;

      return {
        success: true,
        needConfirm: true,
        scanMode: scanMode,
        data: {
          ...parsedData,
          quantity: Number(orderQty) || 0,
          materialPurchases: materialPurchases,
          bomFallback: bomFallback,
          progressStage: '采购',
          orderDetail: orderDetail,
        },
        message: bomFallback ? '未找到采购单，已显示BOM物料信息' : '请确认面料采购明细',
      };
    } catch (e) {
      console.error('[ScanDataProcessor] 查询面料采购单失败:', e);
      return this._errorResult('查询采购单失败: ' + (e.errMsg || e.message || '未知错误'));
    }
  }

  /**
   * 处理订单扫码（有SKU明细）
   * @param {Object} parsedData - 解析后的二维码数据
   * @param {Object} orderDetail - 订单详情
   * @param {Function} detectStageFn - 工序检测函数
   * @param {string} scanMode - 扫码模式
   * @returns {Promise<Object>} 扫码结果
   */
  async handleOrderWithItems(parsedData, orderDetail, detectStageFn, scanMode) {
    // 预判工序
    let nextStage = '未知';
    let stageCompleted = false;
    try {
      const stageRes = await detectStageFn(scanMode, parsedData, orderDetail);
      if (stageRes) {
        nextStage = stageRes.progressStage;
        stageCompleted = !!stageRes.isCompleted;
      }
    } catch (e) {
      // 如果是工序已完成的错误，向上传播而不是吞掉
      if (e.isCompleted) {
        throw e;
      }
      // 其他预判错误静默忽略
      console.warn('[ScanDataProcessor] 工序预判失败:', e.message);
    }

    // 所有工序已完成 → 阻止弹窗
    if (stageCompleted) {
      const err = new Error('进度节点已完成');
      err.isCompleted = true;
      throw err;
    }

    // 补救措施：如果预判是采购工序，补查采购单
    let materialPurchases = [];
    if (nextStage === '采购') {
      try {
        const rawResult = await this.api.production.getMaterialPurchases({
          orderNo: parsedData.orderNo,
        });
        // 兼容：API可能返回数组或分页对象 { records: [...] }
        materialPurchases = Array.isArray(rawResult)
          ? rawResult
          : (rawResult && Array.isArray(rawResult.records) ? rawResult.records : []);
      } catch (e) {
        console.error('[ScanDataProcessor] 补获采购单失败:', e);
      }
    }

    // 计算订单总数量（parsedData中可能没有quantity）
    const orderQty = parsedData.quantity
      || orderDetail.quantity || orderDetail.totalQuantity
      || orderDetail.totalNum || orderDetail.orderQuantity || 0;

    return {
      success: true,
      needConfirm: true,
      scanMode: scanMode,
      data: {
        ...parsedData,
        quantity: Number(orderQty) || 0,
        skuItems: orderDetail.items,
        progressStage: nextStage,
        materialPurchases: materialPurchases,
        orderDetail: orderDetail,
      },
      message: '请确认扫码明细',
    };
  }

  /**
   * 处理SKU模式的数量获取
   * @param {Object} parsedData - 解析后的数据
   * @param {Object} orderDetail - 订单详情
   * @returns {Promise<void>} 异步处理SKU数量
   */
  async handleSKUQuantity(parsedData, orderDetail) {
    if (parsedData.quantity) {
      return;
    } // 已有数量，无需处理

    // 尝试从订单明细中找到该SKU的数量
    if (orderDetail.items && orderDetail.items.length > 0) {
      const matchedItem = orderDetail.items.find(
        item => item.color === parsedData.color && item.size === parsedData.size,
      );

      if (matchedItem) {
        const skuQty = matchedItem.quantity || matchedItem.num;
        if (skuQty > 0) {
          parsedData.quantity = Number(skuQty);
        }
      }
    }

    // 如果还是没有数量，需要用户输入
    if (!parsedData.quantity) {
      const err = new Error(`请输入 ${parsedData.color}/${parsedData.size} 的数量`);
      err.needInput = true;
      throw err;
    }
  }

  /**
   * 处理订单模式的数量获取
   * @param {Object} parsedData - 解析后的数据
   * @param {Object} orderDetail - 订单详情
   * @returns {void}
   */
  handleOrderQuantity(parsedData, orderDetail) {
    if (parsedData.quantity) {
      return;
    } // 已有数量
    if (parsedData.skuItems) {
      return;
    } // 有明细，无需总数

    const orderQuantity = orderDetail.quantity || orderDetail.totalQuantity || orderDetail.totalNum;

    if (orderQuantity && orderQuantity > 0) {
      parsedData.quantity = Number(orderQuantity);
    } else {
      const err = new Error('请输入数量');
      err.needInput = true;
      throw err;
    }
  }

  /**
   * 获取订单详情（带缓存）
   * @param {string} orderNo - 订单号
   * @param {string} [orderId] - 订单ID（UUID，备用）
   * @returns {Promise<Object|null>} 订单详情（单条记录）
   */
  async getOrderDetail(orderNo, orderId) {
    // 防护：两个标识都为空时直接返回 null，避免空参数调用列表 API
    if (!orderNo && !orderId) {
      return null;
    }

    try {
      let res;
      if (orderNo) {
        res = await this.api.production.orderDetailByOrderNo(orderNo);
      } else {
        // 通过 orderId (UUID) 查询
        res = await this.api.production.orderDetail(orderId);
      }

      // 解包分页响应：orderDetailByOrderNo 实际调用 /list，返回 Page 对象
      if (res && res.records && Array.isArray(res.records)) {
        return res.records.length > 0 ? res.records[0] : null;
      }

      return res || null;
    } catch (e) {
      console.error('[ScanDataProcessor] 获取订单失败:', e);
      return null;
    }
  }

  /**
   * 归一化订单号（移除分隔符，兼容常见字段）
   * @param {any} value - 原始订单号
   * @returns {string} 标准订单号
   */
  normalizeOrderNo(value) {
    const raw = String(value || '').trim();
    if (!raw) {
      return '';
    }
    return raw.replace(/[-_]/g, '');
  }

  /**
   * 从订单详情中提取订单号（兼容多字段）
   * @param {Object} orderDetail - 订单详情
   * @returns {string} 订单号
   */
  extractOrderNoFromDetail(orderDetail) {
    if (!orderDetail) {
      return '';
    }
    return this.normalizeOrderNo(
      orderDetail.orderNo ||
        orderDetail.order_no ||
        orderDetail.productionOrderNo ||
        orderDetail.production_order_no ||
        orderDetail.orderCode ||
        orderDetail.order_code ||
        '',
    );
  }

  /**
   * 构建错误结果对象
   * @param {string} message - 错误消息
   * @returns {Object} 错误结果
   */
  _errorResult(message) {
    return {
      success: false,
      message: message,
    };
  }
}

module.exports = ScanDataProcessor;
