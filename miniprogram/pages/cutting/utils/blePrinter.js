const ESC = 0x1B;
const GS = 0x1D;
const CHUNK_DELAY_MS = 30;
const DISCOVERY_TIMEOUT_MS = 8000;
const CONNECTION_TIMEOUT_MS = 10000;

const PRINTER_SERVICE_UUIDS = [
  '0000ff00-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
];

const PRINTER_NAME_KEYWORDS = [
  'pr', 'PR', '印', '打', 'xp', 'XP',
  'hm', 'HM', 'gp', 'GP', 'qr', 'QR',
  'print', 'Print', 'pos', 'POS', 'label',
  'pt-', 'PT-', 'tp', 'TP', 'ab-', 'AB-',
  'jc-', 'JC-', 'bl', 'BL', 'gl', 'GL',
  'bt-', 'BT-', 'wk-', 'WK-', 'rk-', 'RK-',
  'csn', 'CSN', 'dc-', 'DC-', 'zd-', 'ZD-',
  'ht-', 'HT-', 'ht', 'HT',
];

/**
 * 手动 UTF-8 编码（不依赖 TextEncoder，兼容所有微信版本）
 * 中文字符 U+4E00~U+9FFF → 3 字节 UTF-8 (0xE4~0xE9 开头)
 * ASCII 0x00~0x7F → 1 字节
 */
function utf8Bytes(str) {
  const bytes = [];
  let i = 0;
  while (i < str.length) {
    const c = str.charCodeAt(i);
    if (c < 0x80) {
      bytes.push(c);
    } else if (c < 0x800) {
      bytes.push(0xC0 | (c >> 6));
      bytes.push(0x80 | (c & 0x3F));
    } else if (c >= 0xD800 && c < 0xDC00 && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xDC00 && next < 0xE000) {
        const full = 0x10000 + ((c - 0xD800) << 10) + (next - 0xDC00);
        bytes.push(0xF0 | (full >> 18));
        bytes.push(0x80 | ((full >> 12) & 0x3F));
        bytes.push(0x80 | ((full >> 6) & 0x3F));
        bytes.push(0x80 | (full & 0x3F));
        i += 2;
        continue;
      }
      bytes.push(0xE0 | (c >> 12));
      bytes.push(0x80 | ((c >> 6) & 0x3F));
      bytes.push(0x80 | (c & 0x3F));
    } else {
      bytes.push(0xE0 | (c >> 12));
      bytes.push(0x80 | ((c >> 6) & 0x3F));
      bytes.push(0x80 | (c & 0x3F));
    }
    i++;
  }
  return bytes;
}

function isPrinter(name) {
  if (!name) return false;
  const lower = name.toLowerCase();
  for (let i = 0; i < PRINTER_NAME_KEYWORDS.length; i++) {
    if (lower.indexOf(PRINTER_NAME_KEYWORDS[i].toLowerCase()) !== -1) return true;
  }
  return false;
}

/* ==================== ESC/POS 指令构建 ==================== */

function cmdInit() {
  return new Uint8Array([ESC, 0x40]);
}

function cmdAlign(align) {
  const v = align === 'center' ? 1 : align === 'right' ? 2 : 0;
  return new Uint8Array([ESC, 0x61, v]);
}

function cmdBold(on) {
  return new Uint8Array([ESC, 0x45, on ? 1 : 0]);
}

function cmdLineFeed() {
  return new Uint8Array([0x0A]);
}

function cmdFeed(lines) {
  return new Uint8Array([ESC, 0x64, Math.min(Math.max(lines || 3, 1), 255)]);
}

function cmdCut() {
  return new Uint8Array([GS, 0x56, 0x01]);
}

/**
 * 直接发送文本字节（不添加 ESC t 前缀）
 * 打印机在 init 后应已配置为 UTF-8 模式
 */
function cmdText(text) {
  const bytes = utf8Bytes(text);
  return new Uint8Array(bytes);
}

/**
 * 对齐标签文本
 */
function cmdLabelLine(text) {
  const line = text || '';
  const utf8 = utf8Bytes(text);
  return new Uint8Array(utf8);
}

/**
 * ESC/POS QR 码指令集 (GS ( k)
 * 参考 EPSON ESC/POS 规范，支持绝大多数热敏标签打印机
 */
function cmdQr(text, dotSize) {
  const data = utf8Bytes(text);
  const size = Math.min(Math.max(dotSize || 5, 2), 8);

  const storeLen = data.length + 3;
  const pL = storeLen & 0xFF;
  const pH = (storeLen >> 8) & 0xFF;

  const seq = [];

  // Model select: QR Code Model 2
  seq.push(GS, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);

  // Module size
  seq.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, size);

  // Error correction level: M (15%)
  seq.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31);

  // Store QR data
  seq.push(GS, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30);
  for (let i = 0; i < data.length; i++) seq.push(data[i]);

  // Print QR
  seq.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);

  return concatBytes(seq);
}

/* ==================== 字节拼接 ==================== */

function concatBytes(arrays) {
  let total = 0;
  for (var i = 0; i < arrays.length; i++) total += arrays[i].length;
  const result = new Uint8Array(total);
  let off = 0;
  for (var i = 0; i < arrays.length; i++) {
    result.set(arrays[i], off);
    off += arrays[i].length;
  }
  return result;
}

function computeQrCellSize(paperWidthCm, qrPxSize) {
  const w = paperWidthCm || 7;
  const px = qrPxSize || 84;
  // 每 cm ≈ 38 dot（203dpi 热敏打印机），QR 最多占纸张宽度的 70%
  const maxDots = Math.floor(w * 38 * 0.7);
  // QR cell = pixel / cellCount(~29 for version 3) ≈ qrPx / 29
  const cellSize = Math.floor(maxDots / (px / 8));
  return Math.min(Math.max(cellSize, 2), 8);
}

function buildOneLabel(bundle, orderNo, orderInfo, qrSize) {
  const parts = [];

  // 初始化打印机状态
  parts.push(cmdInit());
  parts.push(cmdAlign('center'));

  // QR 码
  const qrText = bundle.qrCode || '';
  if (qrText) {
    parts.push(cmdQr(qrText, qrSize || 4));
    parts.push(cmdLineFeed());
  }

  // 扎号（加粗居中）
  parts.push(cmdBold(true));
  parts.push(cmdText(bundle.bundleLabel || bundle.bundleNo || '-'));
  parts.push(cmdBold(false));
  parts.push(cmdLineFeed());

  // 订单信息（左对齐）
  parts.push(cmdAlign('left'));
  parts.push(printPair('订单', bundle.productionOrderNo || orderNo || '-'));
  parts.push(printPair('款号', bundle.styleNo || (orderInfo && orderInfo.styleNo) || '-'));
  parts.push(printPair('颜色', bundle.color || '-'));
  parts.push(printPair('码数', bundle.size || '-'));
  parts.push(printPair('数量', String(bundle.quantity || 0)));

  // 走纸 + 切纸（最后一张裁切）
  parts.push(cmdFeed(4));
  parts.push(cmdCut());

  return concatBytes(parts);
}

function printPair(label, value) {
  const line = label + ': ' + value;
  const parts = [cmdText(line), cmdLineFeed()];
  return concatBytes(parts);
}

function buildAllLabels(bundles, orderNo, orderInfo, qrCellSize) {
  const all = [];
  for (let i = 0; i < bundles.length; i++) {
    all.push(buildOneLabel(bundles[i], orderNo, orderInfo, qrCellSize));
  }
  return concatBytes(all);
}

/* ==================== BLE 服务/特征值查找 ==================== */

function findService(services) {
  if (!services || !services.length) return null;

  // 优先匹配已知打印机 Service UUID
  for (var i = 0; i < services.length; i++) {
    var uuid = (services[i].uuid || '').toLowerCase();
    for (let j = 0; j < PRINTER_SERVICE_UUIDS.length; j++) {
      if (uuid === PRINTER_SERVICE_UUIDS[j]) return services[i];
      // 部分匹配（最后 8 位）
      const suffix = PRINTER_SERVICE_UUIDS[j].substring(4, 8);
      if (uuid.indexOf(suffix) !== -1) return services[i];
    }
  }

  // 兜底：找第一个含 (write || writeWithoutResponse) 特征值的 Service
  for (var i = 0; i < services.length; i++) {
    const s = services[i];
    // 无法在 Service 级别判断 Characteristics，先返回第一个非通用 Service
    var uuid = (s.uuid || '').toLowerCase();
    if (uuid.indexOf('1800') === -1 && uuid.indexOf('1801') === -1 && uuid.indexOf('180a') === -1) {
      return s;
    }
  }

  return services[0];
}

function findWriteChar(characteristics) {
  if (!characteristics) return null;
  let withResp = null;
  let withoutResp = null;
  for (let i = 0; i < characteristics.length; i++) {
    const c = characteristics[i];
    if (!c || !c.properties) continue;
    if (c.properties.writeWithoutResponse) withoutResp = c;
    if (c.properties.write) withResp = c;
  }
  // writeWithoutResponse 通常更快（不需要 ACK），优先使用
  return withoutResp || withResp;
}

/* ==================== BLE 数据写入 ==================== */

/**
 * 分片写入数据
 * 微信 BLE 默认 MTU = 20，协商后可到 512
 * iOS 需要分片间有足够延时，Android 可以更快
 */
function writeInChunks(deviceId, serviceId, charId, data, mtu) {
  let effectiveMtu = Math.max(20, (mtu || 20) - 3);
  let offset = 0;

  return new Promise(function (resolve, reject) {
    function sendChunk() {
      if (offset >= data.length) {
        resolve();
        return;
      }

      const end = Math.min(offset + effectiveMtu, data.length);
      const chunk = data.slice(offset, end);

      wx.writeBLECharacteristicValue({
        deviceId: deviceId,
        serviceId: serviceId,
        characteristicId: charId,
        value: chunk.buffer,
        success: function () {
          offset = end;
          // 根据剩余数据量和平台调整延时
          const remaining = data.length - offset;
          const delay = remaining > 1024 ? CHUNK_DELAY_MS : Math.max(10, CHUNK_DELAY_MS - 15);
          setTimeout(sendChunk, delay);
        },
        fail: function (err) {
          // MTU 降级重试
          if (effectiveMtu > 20) {
            effectiveMtu = 20;
            sendChunk();
          } else {
            reject(new Error('写入失败: ' + (err.errMsg || err.message || '未知错误')));
          }
        },
      });
    }

    sendChunk();
  });
}

function negotiateMtu(deviceId) {
  return new Promise(function (resolve) {
    wx.setBLEMTU({
      deviceId: deviceId,
      mtu: 256,
      success: function (res) {
        resolve(res.mtu || 20);
      },
      fail: function () {
        resolve(20);
      },
    });
  });
}

/* ==================== 主打印流程 ==================== */

/**
 * @param {Array} bundles - 菲号数组
 * @param {string} orderNo - 订单号
 * @param {object} orderInfo - 订单信息对象
 * @param {object} opts - 打印选项 { qrCellSize, orientation, paperWidth, paperHeight }
 * @returns {Promise}
 */
function blePrint(bundles, orderNo, orderInfo, opts) {
  const options = opts || {};
  let qrCellSize = options.qrCellSize;
  if (!qrCellSize || qrCellSize < 2 || qrCellSize > 8) {
    qrCellSize = computeQrCellSize(options.paperWidth || 7, 80);
  }
  const printData = buildAllLabels(bundles, orderNo, orderInfo, qrCellSize);
  let deviceId = null;
  let adapterClosed = false;

  return new Promise(function (resolve, reject) {
    wx.showLoading({ title: '初始化蓝牙...', mask: true });
    // 超时保护：防止 openBluetoothAdapter 在开发者工具/不支持蓝牙的环境下无任何回调
    let adapterReady = false;
    const adapterTimer = setTimeout(function () {
      if (!adapterReady) {
        wx.hideLoading();
        reject(new Error('蓝牙初始化无响应\n\n• 开发者工具不支持蓝牙，请使用真机测试\n• 真机上请确认已授权蓝牙权限并开启蓝牙'));
      }
    }, 3000);

    wx.openBluetoothAdapter({
      mode: 'central',
      success: function () {
        adapterReady = true;
        clearTimeout(adapterTimer);
        wx.showLoading({ title: '搜索打印机...', mask: true });
        wx.startBluetoothDevicesDiscovery({
          allowDuplicatesKey: false,
          success: function () {
            const found = [];
            let timer = null;

            function onFound(res) {
              const devices = res.devices || [];
              for (let i = 0; i < devices.length; i++) {
                const d = devices[i];
                if (!d.name || !d.name.length) continue;
                if (!d.deviceId) continue;
                // 去重
                let dup = false;
                for (let j = 0; j < found.length; j++) {
                  if (found[j].deviceId === d.deviceId) { dup = true; break; }
                }
                if (!dup) found.push(d);
              }
            }

            wx.onBluetoothDeviceFound(onFound);

            // 搜索超时
            timer = setTimeout(function () {
              wx.offBluetoothDeviceFound(onFound);
              wx.stopBluetoothDevicesDiscovery();
              wx.hideLoading();

              // 过滤出打印机设备
              const printers = found.filter(function (d) { return isPrinter(d.name); });
              // 没有匹配到打印机时，显示所有命名设备（用户手动选择）
              const list = printers.length ? printers : found.filter(function (d) {
                return d.name && d.name.length > 0;
              });

              if (!list.length) {
                wx.closeBluetoothAdapter();
                adapterClosed = true;
                reject(new Error('未搜索到蓝牙打印机。请确认：\n1. 打印机已开机\n2. 手机蓝牙已开启\n3. 打印机未被其他设备连接'));
                return;
              }

              // 限制显示数量（ActionSheet 最多 6 项）
              const display = list.slice(0, 6);
              wx.showActionSheet({
                itemList: display.map(function (d) { return d.name || d.localName || '未知设备'; }),
                success: function (tapRes) {
                  deviceId = display[tapRes.tapIndex].deviceId;
                  connectAndSend(deviceId, printData, resolve, reject, function () {
                    adapterClosed = true;
                  });
                },
                fail: function () {
                  wx.closeBluetoothAdapter();
                  adapterClosed = true;
                  reject(new Error('已取消选择打印机'));
                },
              });
            }, DISCOVERY_TIMEOUT_MS);
          },
          fail: function (err) {
            wx.hideLoading();
            wx.closeBluetoothAdapter();
            adapterClosed = true;
            const msg = (err && err.errMsg) || '';
            if (msg.indexOf('location') !== -1 || msg.indexOf('定位') !== -1) {
              reject(new Error('搜索蓝牙需要开启手机定位（Android 系统要求）'));
            } else {
              reject(new Error('搜索蓝牙设备失败，请确认蓝牙已开启'));
            }
          },
        });
      },
      fail: function (err) {
        adapterReady = true;
        clearTimeout(adapterTimer);
        wx.hideLoading();
        const msg = (err && err.errMsg) || '';
        if (msg.indexOf('103') !== -1 || msg.indexOf('unauthorized') !== -1 || msg.indexOf('授权') !== -1) {
          reject(new Error('请授权蓝牙权限：点击右上角 ··· → 设置 → 蓝牙 → 允许'));
        } else if (msg.indexOf('10001') !== -1) {
          reject(new Error('请开启手机蓝牙后再试'));
        } else {
          reject(new Error('蓝牙初始化失败，请确认手机支持蓝牙功能'));
        }
      },
    });
  }).finally(function () {
    wx.hideLoading();
    if (deviceId && !adapterClosed) {
      setTimeout(function () {
        wx.closeBLEConnection({ deviceId: deviceId });
        wx.closeBluetoothAdapter();
      }, 1500);
    }
  });
}

function connectAndSend(deviceId, printData, resolve, reject, onDone) {
  let serviceId = null;
  let charId = null;
  let connectionEstablished = false;
  let done = false;

  function cleanup() {
    if (done) return;
    done = true;
    if (connectionEstablished) {
      setTimeout(function () {
        wx.closeBLEConnection({ deviceId: deviceId });
        wx.closeBluetoothAdapter();
        onDone && onDone();
      }, 1500);
    } else {
      wx.closeBluetoothAdapter();
      onDone && onDone();
    }
  }

  const connTimer = setTimeout(function () {
    if (!connectionEstablished) {
      cleanup();
      reject(new Error('连接打印机超时，请确认打印机处于待连接状态'));
    }
  }, CONNECTION_TIMEOUT_MS);

  wx.showLoading({ title: '连接打印机...', mask: true });

  wx.createBLEConnection({
    deviceId: deviceId,
    success: function () {
      connectionEstablished = true;
      clearTimeout(connTimer);

      wx.getBLEDeviceServices({
        deviceId: deviceId,
        success: function (res) {
          const service = findService(res.services);
          if (!service) {
            cleanup();
            reject(new Error('打印机服务不可用，请确认设备为热敏标签打印机'));
            return;
          }
          serviceId = service.uuid;

          wx.getBLEDeviceCharacteristics({
            deviceId: deviceId,
            serviceId: serviceId,
            success: function (charRes) {
              const ch = findWriteChar(charRes.characteristics);
              if (!ch) {
                cleanup();
                reject(new Error('打印机不支持数据写入'));
                return;
              }
              charId = ch.uuid;

              // MTU 协商
              negotiateMtu(deviceId).then(function (mtu) {
                wx.hideLoading();
                wx.showLoading({ title: '正在打印...', mask: true });

                // Step 4: 分片写入
                writeInChunks(deviceId, serviceId, charId, printData, mtu).then(function () {
                  wx.hideLoading();
                  wx.showToast({ title: '打印完成', icon: 'success', duration: 2000 });
                  cleanup();
                  resolve();
                }).catch(function (err) {
                  wx.hideLoading();
                  cleanup();
                  reject(err);
                });
              });
            },
            fail: function () {
              cleanup();
              reject(new Error('获取打印机特征值失败'));
            },
          });
        },
        fail: function () {
          cleanup();
          reject(new Error('获取打印机服务失败'));
        },
      });
    },
    fail: function (err) {
      clearTimeout(connTimer);
      cleanup();
      const code = (err && err.errCode) || 0;
      if (code === 10003) {
        reject(new Error('打印机已被其他设备连接，请先断开'));
      } else if (code === 10012) {
        reject(new Error('连接超时，请靠近打印机后重试'));
      } else {
        reject(new Error('连接失败(' + (code || '未知') + ')，请确认打印机已开机且在附近'));
      }
    },
  });
}

const WIFI_PRINT_PORT = 9100;
const WIFI_CONNECT_TIMEOUT_MS = 5000;

function wifiPrint(bundles, orderNo, orderInfo, opts) {
  const options = opts || {};
  const host = (options.wifiHost || '').replace(/^\s+|\s+$/g, '');
  const port = options.wifiPort || WIFI_PRINT_PORT;

  if (!host) {
    return Promise.reject(new Error('请输入打印机IP地址'));
  }

  let qrCellSize = options.qrCellSize;
  if (!qrCellSize || qrCellSize < 2 || qrCellSize > 8) {
    qrCellSize = computeQrCellSize(options.paperWidth || 7, 80);
  }
  const printData = buildAllLabels(bundles, orderNo, orderInfo, qrCellSize);

  return new Promise(function (resolve, reject) {
    let tcpSocket = null;
    let connected = false;
    let done = false;

    function cleanup() {
      if (done) return;
      done = true;
      if (tcpSocket) {
        try { tcpSocket.close(); } catch (e) {}
        tcpSocket = null;
      }
    }

    try {
      tcpSocket = wx.createTCPSocket();
    } catch (e) {
      reject(new Error('当前微信版本不支持TCP打印，请升级微信或使用蓝牙打印'));
      return;
    }

    const connTimer = setTimeout(function () {
      if (!connected) {
        cleanup();
        reject(new Error('连接打印机超时，请确认IP地址正确且打印机与手机在同一WiFi'));
      }
    }, WIFI_CONNECT_TIMEOUT_MS);

    wx.showLoading({ title: '连接 ' + host + '...', mask: true });

    tcpSocket.onConnect(function () {
      clearTimeout(connTimer);
      connected = true;
      wx.hideLoading();
      wx.showLoading({ title: '正在打印...', mask: true });

      const CHUNK_SIZE = 4096;
      let offset = 0;

      function sendChunk() {
        if (offset >= printData.length) {
          wx.hideLoading();
          wx.showToast({ title: '打印完成', icon: 'success', duration: 2000 });
          setTimeout(function () { cleanup(); }, 500);
          resolve();
          return;
        }
        const end = Math.min(offset + CHUNK_SIZE, printData.length);
        const chunk = printData.slice(offset, end);
        try {
          tcpSocket.write(chunk.buffer);
          offset = end;
          setTimeout(sendChunk, 20);
        } catch (e) {
          wx.hideLoading();
          cleanup();
          reject(new Error('发送打印数据失败'));
        }
      }

      sendChunk();
    });

    tcpSocket.onError(function (err) {
      clearTimeout(connTimer);
      wx.hideLoading();
      cleanup();
      if (!connected) {
        reject(new Error('无法连接 ' + host + ':' + port + '\n请确认：\n1. IP地址和端口正确\n2. 打印机与手机在同一WiFi\n3. 打印机已开机'));
      } else {
        reject(new Error('打印连接中断: ' + (err.errMsg || '未知错误')));
      }
    });

    tcpSocket.onClose(function () {
      if (!done) {
        wx.hideLoading();
        cleanup();
        if (connected) {
          resolve();
        } else {
          reject(new Error('连接被关闭'));
        }
      }
    });

    tcpSocket.connect({ address: host, port: port });
  });
}

module.exports = {
  blePrint: blePrint,
  wifiPrint: wifiPrint,
  buildAllLabels: buildAllLabels,
  buildOneLabel: buildOneLabel,
  cmdInit: cmdInit,
  cmdQr: cmdQr,
  cmdText: cmdText,
  cmdAlign: cmdAlign,
  cmdBold: cmdBold,
  cmdFeed: cmdFeed,
  cmdCut: cmdCut,
  cmdLineFeed: cmdLineFeed,
  concatBytes: concatBytes,
  utf8Bytes: utf8Bytes,
  findService: findService,
  findWriteChar: findWriteChar,
  writeInChunks: writeInChunks,
  isPrinter: isPrinter,
};
