/**
 * 打印模板渲染组件
 * 解析模板 JSON 配置，生成 ESC/POS 指令，发送到蓝牙打印机
 */

const BluetoothPrinter = require('./bluetoothPrinter');

Component({
  properties: {
    // 模板配置 JSON 字符串
    templateConfig: {
      type: String,
      value: '',
    },
    // 打印数据
    printData: {
      type: Object,
      value: {},
    },
    // 是否显示连接按钮
    showConnectButton: {
      type: Boolean,
      value: true,
    },
  },

  data: {
    connected: false,
    connecting: false,
    printerName: '',
    devices: [],
    showDeviceList: false,
  },

  lifetimes: {
    attached() {
      this.printer = new BluetoothPrinter();
    },

    detached() {
      if (this.printer) {
        this.printer.disconnect();
      }
    },
  },

  methods: {
    /**
     * 搜索打印机设备
     */
    async searchPrinters() {
      this.setData({ connecting: true });
      
      try {
        const devices = await this.printer.searchDevices();
        this.setData({
          devices,
          showDeviceList: true,
          connecting: false,
        });
        
        if (devices.length === 0) {
          wx.showToast({
            title: '未找到打印机',
            icon: 'none',
          });
        }
      } catch (e) {
        wx.showToast({
          title: e.message || '搜索失败',
          icon: 'none',
        });
        this.setData({ connecting: false });
      }
    },

    /**
     * 连接打印机
     */
    async connectPrinter(e) {
      const { deviceId, name } = e.currentTarget.dataset;
      
      wx.showLoading({ title: '连接中...' });
      
      try {
        await this.printer.connect(deviceId);
        this.setData({
          connected: true,
          printerName: name,
          showDeviceList: false,
        });
        
        wx.hideLoading();
        wx.showToast({
          title: '连接成功',
          icon: 'success',
        });
        
        // 停止搜索
        wx.stopBluetoothDevicesDiscovery();
      } catch (e) {
        wx.hideLoading();
        wx.showToast({
          title: e.message || '连接失败',
          icon: 'none',
        });
      }
    },

    /**
     * 断开连接
     */
    async disconnectPrinter() {
      await this.printer.disconnect();
      this.setData({
        connected: false,
        printerName: '',
      });
      
      wx.showToast({
        title: '已断开连接',
        icon: 'success',
      });
    },

    /**
     * 执行打印
     */
    async doPrint() {
      if (!this.data.connected) {
        wx.showToast({
          title: '请先连接打印机',
          icon: 'none',
        });
        return;
      }
      
      wx.showLoading({ title: '打印中...' });
      
      try {
        await this.printer.printWithTemplate(
          this.properties.templateConfig,
          this.properties.printData
        );
        
        wx.hideLoading();
        wx.showToast({
          title: '打印成功',
          icon: 'success',
        });
        
        // 触发打印成功事件
        this.triggerEvent('printsuccess');
      } catch (e) {
        wx.hideLoading();
        wx.showToast({
          title: e.message || '打印失败',
          icon: 'none',
        });
        
        // 触发打印失败事件
        this.triggerEvent('printfail', { error: e.message });
      }
    },

    /**
     * 关闭设备列表弹窗
     */
    closeDeviceList() {
      this.setData({ showDeviceList: false });
      wx.stopBluetoothDevicesDiscovery();
    },
  },
});