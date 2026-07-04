/**
 * 蓝牙打印机适配器
 * 用于连接蓝牙热敏打印机并发送打印指令
 */

const { generatePrintCommands, commandsToBuffer } = require('./escpos');

// 蓝牙打印机服务 UUID（通用热敏打印机）
const PRINTER_SERVICE_UUID = '0000FF00-0000-1000-8000-00805F9B34FB';
const PRINTER_CHAR_UUID = '0000FF02-0000-1000-8000-00805F9B34FB';

class BluetoothPrinter {
  constructor() {
    this.deviceId = null;
    this.serviceId = PRINTER_SERVICE_UUID;
    this.charId = PRINTER_CHAR_UUID;
    this.connected = false;
  }

  /**
   * 初始化蓝牙适配器
   */
  async init() {
    try {
      await wx.openBluetoothAdapter();
      console.log('[BluetoothPrinter] 蓝牙适配器已初始化');
      return true;
    } catch (e) {
      console.error('[BluetoothPrinter] 初始化蓝牙适配器失败', e);
      throw new Error('请开启蓝牙权限');
    }
  }

  /**
   * 搜索打印机设备
   */
  async searchDevices() {
    await this.init();
    
    return new Promise((resolve, reject) => {
      wx.startBluetoothDevicesDiscovery({
        services: [this.serviceId],
        success: () => {
          wx.onBluetoothDeviceFound((res) => {
            const devices = res.devices.map((d) => ({
              deviceId: d.deviceId,
              name: d.name || d.localName || '未知设备',
              advertisData: d.advertisData,
            }));
            resolve(devices);
          });
        },
        fail: (e) => {
          console.error('[BluetoothPrinter] 搜索设备失败', e);
          reject(new Error('搜索蓝牙设备失败'));
        },
      });
    });
  }

  /**
   * 连接打印机
   */
  async connect(deviceId) {
    this.deviceId = deviceId;
    
    try {
      // 创建连接
      await wx.createBLEConnection({
        deviceId,
        timeout: 10000,
      });
      
      // 获取服务
      const services = await wx.getBLEDeviceServices({ deviceId });
      console.log('[BluetoothPrinter] 发现服务', services.services);
      
      // 获取特征值
      const chars = await wx.getBLEDeviceCharacteristics({
        deviceId,
        serviceId: this.serviceId,
      });
      console.log('[BluetoothPrinter] 发现特征值', chars.characteristics);
      
      this.connected = true;
      console.log('[BluetoothPrinter] 已连接打印机', deviceId);
      
      return true;
    } catch (e) {
      console.error('[BluetoothPrinter] 连接失败', e);
      throw new Error('连接打印机失败');
    }
  }

  /**
   * 断开连接
   */
  async disconnect() {
    if (this.deviceId) {
      try {
        await wx.closeBLEConnection({ deviceId: this.deviceId });
        this.connected = false;
        console.log('[BluetoothPrinter] 已断开连接');
      } catch (e) {
        console.error('[BluetoothPrinter] 断开连接失败', e);
      }
    }
    
    try {
      await wx.closeBluetoothAdapter();
    } catch (e) {
      // 忽略关闭失败
    }
  }

  /**
   * 发送打印数据
   */
  async sendPrintData(commands) {
    if (!this.connected || !this.deviceId) {
      throw new Error('打印机未连接');
    }
    
    const buffer = commandsToBuffer(commands);
    
    // 分包发送（蓝牙单次传输限制 20 字节）
    const chunkSize = 20;
    const totalChunks = Math.ceil(buffer.byteLength / chunkSize);
    
    for (let i = 0; i < totalChunks; i++) {
      const offset = i * chunkSize;
      const chunk = buffer.slice(offset, offset + chunkSize);
      
      await wx.writeBLECharacteristicValue({
        deviceId: this.deviceId,
        serviceId: this.serviceId,
        characteristicId: this.charId,
        value: chunk,
      });
      
      // 每包间隔 50ms
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    
    console.log('[BluetoothPrinter] 已发送打印数据', totalChunks, '包');
  }

  /**
   * 使用模板打印数据
   */
  async printWithTemplate(templateConfig, data) {
    const commands = generatePrintCommands(templateConfig, data);
    await this.sendPrintData(commands);
  }
}

module.exports = BluetoothPrinter;