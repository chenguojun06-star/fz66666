/**
 * 进度看板 — 老板/管理者移动端生产进度总览
 * 数据来源：复用 work/ 页面的 orderTransform + progressNodes 工具链
 */
const app = getApp();
const api = require('../../utils/api');
const { transformOrderData } = require('../work/utils/orderTransform');
const { resolveNodesFromOrder, getNodeIndexFromProgress, clampPercent } = require('../work/utils/progressNodes');

/**
 * 状态筛选键 → 后端 status 值映射
 */
const STATUS_MAP = {
  all: '',
  development: 'DEVELOPMENT',
  in_production: 'IN_PRODUCTION',
  warehousing: 'WAREHOUSING',
  completed: 'COMPLETED',
};

/**
 * 根据订单整体进度，推算每个工序节点的进度百分比
 * 思路：仅有一个总 productionProgress，按节点数量线性分配
 *   - 当前节点之前的节点：100%
 *   - 当前节点：剩余百分比
 *   - 当前节点之后的节点：0%
 */
function buildProcessNodes(order) {
  const nodes = resolveNodesFromOrder(order);
  const progress = clampPercent(order.productionProgress || 0);
  const total = nodes.length;
  if (total === 0) return [];

  const activeIdx = getNodeIndexFromProgress(nodes, progress);

  return nodes.map((node, i) => {
    let percent = 0;
    if (i < activeIdx) {
      percent = 100;
    } else if (i === activeIdx) {
      // 当前节点的局部进度
      if (total <= 1) {
        percent = progress;
      } else {
        const segSize = 100 / total;
        const segStart = segSize * i;
        percent = Math.min(100, Math.round(((progress - segStart) / segSize) * 100));
        percent = Math.max(0, percent);
      }
    }
    return { id: node.id, name: node.name, percent };
  });
}

/**
 * 对转换后的订单补充看板专属字段
 */
function enrichForDashboard(order) {
  const totalQty = order.sizeTotal || order.orderQuantity || 0;
  const completedQty = order.completedQuantity || 0;
  const remainQty = Math.max(0, totalQty - completedQty);

  return Object.assign({}, order, {
    processNodes: buildProcessNodes(order),
    remainQuantity: remainQty,
    expanded: false,
  });
}

Page({
  data: {
    activeStat: 'all',
    stats: {
      total: 0,
      development: 0,
      inProduction: 0,
      warehousing: 0,
      completed: 0,
    },
    orders: {
      loading: false,
      page: 1,
      pageSize: 15,
      hasMore: true,
      list: [],
    },
    // 存放全量统计用原始列表（不受筛选影响）
    _allOrders: [],
  },

  onLoad() {
    this.loadOrders(true);
  },

  onShow() {
    // 从其他页面返回时静默刷新
    if (this._hasLoaded) {
      this.loadOrders(true);
    }
    this._hasLoaded = true;
  },

  onPullDownRefresh() {
    this.loadOrders(true);
  },

  onReachBottom() {
    if (!this.data.orders.loading && this.data.orders.hasMore) {
      this.loadOrders(false);
    }
  },

  /* ======== 加载订单列表 ======== */
  loadOrders(reset) {
    const that = this;
    const statusFilter = STATUS_MAP[this.data.activeStat] || '';

    const params = {
      deleteFlag: 0,
      sort: 'createdAt',
      order: 'desc',
    };
    if (statusFilter) {
      params.status = statusFilter;
    }

    app.loadPagedList(
      that,
      'orders',
      reset,
      function fetchPage(page, pageSize) {
        params.page = page;
        params.pageSize = pageSize;
        return api.production.listOrders(params);
      },
      function mapRecord(r) {
        const base = transformOrderData(r);
        return enrichForDashboard(base);
      },
    );

    // 同时刷新统计（全量，不受 status 筛选）
    if (reset) {
      that.refreshStats();
    }
  },

  /* ======== 刷新统计计数 ======== */
  refreshStats() {
    const that = this;
    api.production.listOrders({ deleteFlag: 0, page: 1, pageSize: 1 }).then(function (res) {
      const total = (res && res.total) || 0;
      // 用单独查询各状态数量
      const promises = [
        api.production.listOrders({ deleteFlag: 0, status: 'DEVELOPMENT', page: 1, pageSize: 1 }),
        api.production.listOrders({ deleteFlag: 0, status: 'IN_PRODUCTION', page: 1, pageSize: 1 }),
        api.production.listOrders({ deleteFlag: 0, status: 'WAREHOUSING', page: 1, pageSize: 1 }),
        api.production.listOrders({ deleteFlag: 0, status: 'COMPLETED', page: 1, pageSize: 1 }),
      ];
      Promise.all(promises).then(function (results) {
        that.setData({
          'stats.total': total,
          'stats.development': (results[0] && results[0].total) || 0,
          'stats.inProduction': (results[1] && results[1].total) || 0,
          'stats.warehousing': (results[2] && results[2].total) || 0,
          'stats.completed': (results[3] && results[3].total) || 0,
        });
      }).catch(function () {
        // 统计失败不影响列表加载
      });
    }).catch(function () {});
  },

  /* ======== 统计条点击切换 ======== */
  onStatTap(e) {
    var key = e.currentTarget.dataset.key || 'all';
    if (key === this.data.activeStat) return;
    this.setData({ activeStat: key });
    this.loadOrders(true);
  },

  /* ======== 卡片展开/收起 ======== */
  onCardToggle(e) {
    var index = e.currentTarget.dataset.index;
    var path = 'orders.list[' + index + '].expanded';
    this.setData({
      [path]: !this.data.orders.list[index].expanded,
    });
  },
});
