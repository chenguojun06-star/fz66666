/**
 * 提醒管理器
 * 用于管理订单、任务等待处理项的定期提醒
 */

const REMINDER_STORAGE_KEY = 'pending_reminders';
const REMINDER_INTERVAL = 10 * 60 * 60 * 1000; // 10小时（毫秒）

/**
 * 添加待处理提醒
 * @param {Object} reminder - 提醒对象
 * @param {string} reminder.id - 唯一标识（订单号+类型）
 * @param {string} reminder.type - 类型：procurement(采购)、cutting(裁剪)、sewing(缝制)等
 * @param {string} reminder.orderNo - 订单号
 * @param {string} reminder.styleNo - 款号
 * @param {string} reminder.message - 提醒消息
 * @param {number} reminder.createdAt - 创建时间戳
 */
function addReminder(reminder) {
  try {
    const reminders = getReminders();
    const id = reminder.id || `${reminder.orderNo}_${reminder.type}_${Date.now()}`;

    // 检查是否已存在
    const existingIndex = reminders.findIndex(r => r.id === id);
    if (existingIndex >= 0) {
      // 更新最后提醒时间
      reminders[existingIndex].lastRemindAt = Date.now();
      reminders[existingIndex].remindCount = (reminders[existingIndex].remindCount || 0) + 1;
    } else {
      // 添加新提醒
      reminders.push({
        ...reminder,
        id,
        createdAt: reminder.createdAt || Date.now(),
        lastRemindAt: Date.now(),
        remindCount: 1,
      });
    }

    saveReminders(reminders);
    return id;
  } catch (e) {
    console.error('添加提醒失败', e);
    return null;
  }
}

/**
 * 移除提醒（任务完成时调用）
 * @param {string} id - 提醒ID
 */
function removeReminder(id) {
  try {
    const reminders = getReminders();
    const filtered = reminders.filter(r => r.id !== id);
    saveReminders(filtered);
    return true;
  } catch (e) {
    console.error('移除提醒失败', e);
    return false;
  }
}

/**
 * 批量移除提醒
 * @param {string} orderNo - 订单号
 * @param {string} type - 类型（可选）
 */
function removeRemindersByOrder(orderNo, type) {
  try {
    const reminders = getReminders();
    const filtered = reminders.filter(r => {
      if (r.orderNo !== orderNo) {
        return true;
      }
      if (type && r.type !== type) {
        return true;
      }
      return false;
    });
    saveReminders(filtered);
    return true;
  } catch (e) {
    console.error('批量移除提醒失败', e);
    return false;
  }
}

/**
 * 获取所有待提醒项
 */
function getReminders() {
  try {
    const data = wx.getStorageSync(REMINDER_STORAGE_KEY);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

/**
 * 保存提醒列表
 */
function saveReminders(reminders) {
  try {
    wx.setStorageSync(REMINDER_STORAGE_KEY, reminders);
  } catch (e) {
    console.error('保存提醒失败', e);
  }
}

/**
 * 检查并显示待处理提醒
 * 在页面onShow时调用
 */
function checkAndShowReminders() {
  try {
    const reminders = getReminders();
    const now = Date.now();
    const needRemind = [];

    reminders.forEach(reminder => {
      const lastRemindAt = reminder.lastRemindAt || reminder.createdAt || 0;
      const timeSinceLastRemind = now - lastRemindAt;

      // 超过10小时才提醒
      if (timeSinceLastRemind >= REMINDER_INTERVAL) {
        needRemind.push(reminder);
        // 更新最后提醒时间
        reminder.lastRemindAt = now;
        reminder.remindCount = (reminder.remindCount || 0) + 1;
      }
    });

    if (needRemind.length > 0) {
      saveReminders(reminders);
      showReminderNotification(needRemind);
    }

    return needRemind;
  } catch (e) {
    console.error('检查提醒失败', e);
    return [];
  }
}

/**
 * 显示提醒通知
 */
function showReminderNotification(reminders) {
  if (!reminders || reminders.length === 0) {
    return;
  }

  const typeNames = {
    procurement: '面辅料采购',
    cutting: '裁剪',
    sewing: '缝制',
    production: '生产',
    quality: '质检',
    warehouse: '入库',
    packing: '包装',
  };

  if (reminders.length === 1) {
    const r = reminders[0];
    const typeName = typeNames[r.type] || r.type;
    wx.showModal({
      title: '待处理提醒',
      content: `订单 ${r.orderNo}${r.styleNo ? `（${r.styleNo}）` : ''} 的${typeName}任务已领取超过10小时，请及时处理`,
      confirmText: '知道了',
      showCancel: false,
    });
  } else {
    // 多个提醒，显示汇总
    const groupByType = {};
    reminders.forEach(r => {
      const typeName = typeNames[r.type] || r.type;
      if (!groupByType[typeName]) {
        groupByType[typeName] = [];
      }
      groupByType[typeName].push(r);
    });

    const summary = Object.keys(groupByType)
      .map(typeName => {
        return `${typeName}(${groupByType[typeName].length}个)`;
      })
      .join('、');

    wx.showModal({
      title: '待处理提醒',
      content: `您有 ${reminders.length} 个待处理任务超过10小时：${summary}，请及时处理`,
      confirmText: '知道了',
      showCancel: false,
    });
  }
}

/**
 * 获取待处理任务数量
 */
function getPendingCount(type) {
  try {
    const reminders = getReminders();
    if (!type) {
      return reminders.length;
    }
    return reminders.filter(r => r.type === type).length;
  } catch (e) {
    return 0;
  }
}

/**
 * 清理过期提醒（超过7天的）
 */
function cleanupExpiredReminders() {
  try {
    const reminders = getReminders();
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    const filtered = reminders.filter(r => {
      const createdAt = r.createdAt || 0;
      return now - createdAt < sevenDays;
    });

    saveReminders(filtered);
    return true;
  } catch (e) {
    console.error('清理过期提醒失败', e);
    return false;
  }
}

module.exports = {
  addReminder,
  removeReminder,
  removeRemindersByOrder,
  getReminders,
  checkAndShowReminders,
  getPendingCount,
  cleanupExpiredReminders,
};
