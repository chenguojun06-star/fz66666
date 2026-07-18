const api = require('../../utils/api');

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    cart: { items: [] }, // 默认值，防止空指针
    mergeSuggestions: [],
    selectedItems: [],
    totalAmount: '0.00',
    previewVisible: false,
    previewData: null,
    submitting: false,
    isAllSelected: false, // 用 data 属性代替 getter
  },

  observers: {
    'visible': function (visible) {
      if (visible) {
        this.loadCart();
      }
    },
    // 监听 selectedItems 和 cart.items 变化，自动更新 isAllSelected
    'selectedItems, cart.items': function(selectedItems, cartItems) {
      const items = cartItems && cartItems.length ? cartItems : [];
      this.setData({
        isAllSelected: items.length > 0 && selectedItems && selectedItems.length === items.length,
      });
    },
  },

  methods: {
    onClose: function () {
      this.triggerEvent('close');
    },

    onDrawTap: function () {
      // 阻止冒泡
    },

    loadCart: function () {
      const self = this;
      wx.showLoading({ title: '加载中...' });

      Promise.all([
        api.purchaseCart.getCart(),
        api.purchaseCart.getMergeSuggestions(),
      ]).then(function (results) {
        wx.hideLoading();
        const cartResult = results[0];
        const mergeResult = results[1];

        const cart = cartResult && cartResult.data || cartResult || { items: [] };
        cart.items = cart.items || [];

        const mergeSuggestions = mergeResult && mergeResult.data || mergeResult || [];

        self.setData({
          cart: cart,
          mergeSuggestions: mergeSuggestions,
        });

        // 默认全选
        if (cart.items && cart.items.length > 0) {
          const allIds = cart.items.map(function (item) { return item.id; });
          self.setData({ selectedItems: allIds });
          self._computeTotal();
        }
      }).catch(function (_e) {
        wx.hideLoading();
        // API 可能不存在，设置默认空购物车
        self.setData({
          cart: { items: [] },
          mergeSuggestions: [],
          selectedItems: [],
          isAllSelected: false,
        });
      });
    },

    _computeTotal: function () {
      const self = this;
      const cart = this.data.cart || { items: [] };
      const items = cart.items || [];

      const selected = items.filter(function (item) {
        return self.data.selectedItems.indexOf(item.id) !== -1;
      });

      const total = selected.reduce(function (sum, item) {
        const qty = Number(item.quantity) || 0;
        const price = Number(item.unitPrice) || 0;
        return sum + qty * price;
      }, 0);

      this.setData({ totalAmount: total.toFixed(2) });
    },

    onToggleItem: function (e) {
      const id = e.currentTarget.dataset.id;
      const idx = this.data.selectedItems.indexOf(id);
      const selected = this.data.selectedItems.slice();

      if (idx === -1) {
        selected.push(id);
      } else {
        selected.splice(idx, 1);
      }

      this.setData({ selectedItems: selected });
      this._computeTotal();
    },

    onToggleAll: function () {
      const cart = this.data.cart || { items: [] };
      const items = cart.items || [];

      if (this.data.selectedItems.length === items.length) {
        this.setData({ selectedItems: [] });
      } else {
        const allIds = items.map(function (item) { return item.id; });
        this.setData({ selectedItems: allIds });
      }
      this._computeTotal();
    },

    onSupplierChange: function (e) {
      const id = e.currentTarget.dataset.id;
      const value = e.detail.value;
      this._updateItem(id, { supplierName: value });
    },

    onPriceChange: function (e) {
      const id = e.currentTarget.dataset.id;
      const value = e.detail.value;
      this._updateItem(id, { unitPrice: value });
    },

    onQuantityChange: function (e) {
      const id = e.currentTarget.dataset.id;
      const value = e.detail.value;
      if (Number(value) > 0) {
        this._updateItem(id, { quantity: Number(value) });
      }
    },

    onQuantityPlus: function (e) {
      const id = e.currentTarget.dataset.id;
      const item = this._findItem(id);
      if (item) {
        this._updateItem(id, { quantity: (Number(item.quantity) || 0) + 1 });
      }
    },

    onQuantityMinus: function (e) {
      const id = e.currentTarget.dataset.id;
      const item = this._findItem(id);
      if (item && (Number(item.quantity) || 0) > 1) {
        this._updateItem(id, { quantity: (Number(item.quantity) || 0) - 1 });
      }
    },

    _findItem: function (id) {
      const cart = this.data.cart || { items: [] };
      const items = cart.items || [];
      return items.find(function (i) { return i.id === id; });
    },

    _updateItem: function (id, payload) {
      const self = this;
      api.purchaseCart.updateItem(id, payload)
        .then(function () {
          self.loadCart();
        })
        .catch(function () {
          wx.showToast({ title: '更新失败', icon: 'none' });
        });
    },

    onMerge: function (e) {
      const suggestion = e.currentTarget.dataset.suggestion;
      if (!suggestion || !suggestion.itemIds || suggestion.itemIds.length === 0) return;

      const self = this;
      wx.showLoading({ title: '合并中...' });

      api.purchaseCart.mergeItems({ itemIds: suggestion.itemIds })
        .then(function () {
          wx.hideLoading();
          wx.showToast({ title: '合并成功', icon: 'success' });
          self.loadCart();
        })
        .catch(function () {
          wx.hideLoading();
          wx.showToast({ title: '合并失败', icon: 'none' });
        });
    },

    onSplit: function (e) {
      const id = e.currentTarget.dataset.id;
      const item = this._findItem(id);
      if (!item || item.quantity <= 1) return;

      const self = this;
      wx.showModal({
        title: '拆分物料',
        content: '确定要拆分成几份？',
        editable: true,
        placeholderText: '请输入份数',
        success: function (res) {
          if (res.confirm) {
            const parts = Number(res.content) || 2;
            wx.showLoading({ title: '拆分中...' });
            api.purchaseCart.splitItem({ itemId: id, splitCount: parts })
              .then(function () {
                wx.hideLoading();
                wx.showToast({ title: '拆分成功', icon: 'success' });
                self.loadCart();
              })
              .catch(function () {
                wx.hideLoading();
                wx.showToast({ title: '拆分失败', icon: 'none' });
              });
          }
        },
      });
    },

    onDelete: function (e) {
      const id = e.currentTarget.dataset.id;
      const self = this;

      wx.showModal({
        title: '删除确认',
        content: '确定要删除这个物料吗？',
        success: function (res) {
          if (res.confirm) {
            wx.showLoading({ title: '删除中...' });
            api.purchaseCart.removeItem(id)
              .then(function () {
                wx.hideLoading();
                wx.showToast({ title: '删除成功', icon: 'success' });
                self.loadCart();
              })
              .catch(function () {
                wx.hideLoading();
                wx.showToast({ title: '删除失败', icon: 'none' });
              });
          }
        },
      });
    },

    onPreview: function () {
      const self = this;
      wx.showLoading({ title: '加载中...' });

      api.purchaseCart.preview()
        .then(function (res) {
          wx.hideLoading();
          const data = res || {};
          self.setData({ previewVisible: true, previewData: data });
        })
        .catch(function () {
          wx.hideLoading();
          wx.showToast({ title: '预览失败', icon: 'none' });
        });
    },

    onClosePreview: function () {
      this.setData({ previewVisible: false });
    },

    onPreviewTap: function () {
      // 阻止冒泡
    },

    onConfirmFromPreview: function () {
      this.onClosePreview();
      this.onConfirm();
    },

    onConfirm: function () {
      if (this.data.submitting) return;
      if (this.data.selectedItems.length === 0) {
        wx.showToast({ title: '请先选择物料', icon: 'none' });
        return;
      }

      const self = this;

      wx.showModal({
        title: '确认下单',
        content: '确定要生成采购单吗？',
        success: function (res) {
          if (res.confirm) {
            self._doConfirm();
          }
        },
      });
    },

    _doConfirm: function () {
      const self = this;
      this.setData({ submitting: true });
      wx.showLoading({ title: '下单中...' });

      api.purchaseCart.confirm(this.data.selectedItems)
        .then(function (res) {
          wx.hideLoading();
          const data = res || {};
          const purchaseNos = data && data.purchaseNos || [];

          wx.showToast({
            title: '下单成功',
            icon: 'success',
          });

          self.setData({ submitting: false });
          self.triggerEvent('confirm', {
            purchaseIds: data && data.purchaseIds,
            purchaseNos: purchaseNos,
          });
          self.onClose();
        })
        .catch(function () {
          wx.hideLoading();
          self.setData({ submitting: false });
          wx.showToast({ title: '下单失败', icon: 'none' });
        });
    },

    /**
     * 外部调用此方法添加物料到购物车
     */
    addItem: function (payload) {
      const self = this;
      wx.showLoading({ title: '添加中...' });

      api.purchaseCart.addItem(payload)
        .then(function () {
          wx.hideLoading();
          wx.showToast({ title: '已添加到购物车', icon: 'success' });
          self.loadCart();
          self.triggerEvent('addSuccess');
        })
        .catch(function () {
          wx.hideLoading();
          wx.showToast({ title: '添加失败', icon: 'none' });
        });
    },
  },
});
