/**
 * ESC/POS 打印指令生成器
 * 用于蓝牙热敏打印机
 */

const ESC = 0x1B;
const GS = 0x1D;

// ESC/POS 常用指令
const COMMANDS = {
  // 初始化打印机
  INIT: [ESC, 0x40],
  // 换行
  LF: [0x0A],
  // 设置对齐方式 (0=左, 1=中, 2=右)
  ALIGN_LEFT: [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  ALIGN_RIGHT: [ESC, 0x61, 0x02],
  // 设置字体大小 (0=正常, 1=双高, 2=双宽, 3=双高双宽)
  FONT_NORMAL: [ESC, 0x21, 0x00],
  FONT_DOUBLE_HEIGHT: [ESC, 0x21, 0x10],
  FONT_DOUBLE_WIDTH: [ESC, 0x21, 0x20],
  FONT_DOUBLE_BOTH: [ESC, 0x21, 0x30],
  // 设置加粗 (0=取消, 1=加粗)
  BOLD_OFF: [ESC, 0x45, 0x00],
  BOLD_ON: [ESC, 0x45, 0x01],
  // 打印并走纸
  PRINT_AND_FEED: [ESC, 0x64, 0x05],
  // 切纸
  CUT: [GS, 0x56, 0x00],
};

/**
 * 字符串转字节数组
 */
function stringToBytes(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 128) {
      bytes.push(code);
    } else {
      // 中文编码（GB2312 简化处理）
      bytes.push(code >> 8);
      bytes.push(code & 0xFF);
    }
  }
  return bytes;
}

/**
 * 根据字体大小映射到 ESC/POS 指令
 */
function getFontSizeCommand(fontSize) {
  if (fontSize <= 10) return COMMANDS.FONT_NORMAL;
  if (fontSize <= 14) return COMMANDS.FONT_DOUBLE_HEIGHT;
  if (fontSize <= 18) return COMMANDS.FONT_DOUBLE_WIDTH;
  return COMMANDS.FONT_DOUBLE_BOTH;
}

/**
 * 根据对齐方式映射到 ESC/POS 指令
 */
function getAlignCommand(align) {
  if (align === 'left') return COMMANDS.ALIGN_LEFT;
  if (align === 'center') return COMMANDS.ALIGN_CENTER;
  if (align === 'right') return COMMANDS.ALIGN_RIGHT;
  return COMMANDS.ALIGN_LEFT;
}

/**
 * 解析模板配置 JSON
 */
function parseTemplateConfig(configJson) {
  try {
    return JSON.parse(configJson);
  } catch (e) {
    return { fields: [], width: 80, height: 50 };
  }
}

/**
 * 生成打印指令
 * @param {Object} templateConfig 模板配置
 * @param {Object} data 打印数据
 * @returns {Array} 指令数组
 */
function generatePrintCommands(templateConfig, data) {
  const config = typeof templateConfig === 'string' 
    ? parseTemplateConfig(templateConfig) 
    : templateConfig;
  
  const commands = [];
  
  // 初始化打印机
  commands.push(...COMMANDS.INIT);
  
  // 按 Y 坐标排序字段
  const sortedFields = (config.fields || []).sort((a, b) => a.y - b.y);
  
  // 逐字段生成打印指令
  let currentY = -1;
  
  sortedFields.forEach((field) => {
    const fieldKey = field.id.split('-')[0];
    const value = data[fieldKey] || '';
    const displayText = `${field.label}: ${value}`;
    
    // Y 坐标变化时换行
    if (currentY !== -1 && field.y > currentY + 5) {
      commands.push(...COMMANDS.LF);
    }
    currentY = field.y;
    
    // 设置对齐
    commands.push(...getAlignCommand(field.align));
    
    // 设置字体大小
    commands.push(...getFontSizeCommand(field.fontSize));
    
    // 设置加粗
    if (field.bold) {
      commands.push(...COMMANDS.BOLD_ON);
    }
    
    // 打印文本
    commands.push(...stringToBytes(displayText));
    
    // 取消加粗
    if (field.bold) {
      commands.push(...COMMANDS.BOLD_OFF);
    }
    
    // 恢复正常字体
    commands.push(...COMMANDS.FONT_NORMAL);
    
    // 换行
    commands.push(...COMMANDS.LF);
  });
  
  // 打印并走纸
  commands.push(...COMMANDS.PRINT_AND_FEED);
  
  // 切纸（可选）
  if (config.type === 'LABEL') {
    commands.push(...COMMANDS.CUT);
  }
  
  return commands;
}

/**
 * 转换为 ArrayBuffer 用于蓝牙传输
 */
function commandsToBuffer(commands) {
  const buffer = new ArrayBuffer(commands.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < commands.length; i++) {
    view[i] = commands[i];
  }
  return buffer;
}

module.exports = {
  COMMANDS,
  generatePrintCommands,
  commandsToBuffer,
  parseTemplateConfig,
  stringToBytes,
};