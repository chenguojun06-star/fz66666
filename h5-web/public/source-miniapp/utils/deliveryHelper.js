/**
 * 交期倒计时计算（从 factory/utils/orderTransform.js 提取到公共目录）
 * 与 PC 端 progressColor.ts getRemainingDaysDisplay 逻辑对齐
 */

function calcDeliveryInfo(source) {
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var status = String((source && source.status) || '').toLowerCase();
  var raw, dateStr, d;

  // 完成态/取消态
  if (status === 'completed' || status === 'cancelled' || status === 'canceled'
      || status === 'scrapped' || status === 'closed' || status === 'archived') {
    raw = (source && (source.plannedEndDate || source.expectedShipDate)) || '';
    dateStr = '';
    if (raw) {
      var s = String(raw);
      if (s.length > 10) {
        d = new Date(s.replace(/-/g, '/'));
        if (!isNaN(d.getTime())) {
          dateStr = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
            + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
        } else {
          dateStr = s.substring(0, 16);
        }
      } else {
        dateStr = s.substring(0, 10);
      }
    }
    return { deliveryDateStr: dateStr, remainDays: null, remainDaysText: '已关单', remainDaysClass: 'days-done' };
  }

  raw = (source && (source.plannedEndDate || source.expectedShipDate)) || '';
  if (!raw) return { deliveryDateStr: '', remainDays: null, remainDaysText: '', remainDaysClass: '' };

  dateStr = String(raw);
  if (dateStr.length > 10) {
    d = new Date(dateStr.replace(/-/g, '/'));
    if (!isNaN(d.getTime())) {
      dateStr = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
        + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    } else {
      dateStr = dateStr.substring(0, 16);
    }
  }
  var deliveryDateStr = dateStr;

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var rawDateOnly = String(raw).substring(0, 10);
  var dateParts = rawDateOnly.split('-');
  var target = new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2]));
  var diffMs = target.getTime() - today.getTime();
  var remainDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  var remainDaysText = '';
  var remainDaysClass = '';

  if (remainDays < 0) {
    remainDaysText = '逾' + Math.abs(remainDays) + '天';
    remainDaysClass = 'days-overdue';
  } else if (remainDays === 0) {
    remainDaysText = '今天';
    remainDaysClass = 'days-urgent';
  } else {
    var createRaw = (source && source.createTime) || '';
    if (createRaw) {
      var start = new Date(typeof createRaw === 'string' ? createRaw.replace(' ', 'T') : createRaw);
      var totalDays = Math.ceil((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) || 1;
      var ratio = remainDays / totalDays;
      if (ratio <= 0.2) { remainDaysText = remainDays + '天'; remainDaysClass = 'days-urgent'; }
      else if (ratio <= 0.5) { remainDaysText = remainDays + '天'; remainDaysClass = 'days-warn'; }
      else { remainDaysText = remainDays + '天'; remainDaysClass = 'days-safe'; }
    } else {
      if (remainDays <= 3) { remainDaysText = remainDays + '天'; remainDaysClass = 'days-urgent'; }
      else if (remainDays <= 7) { remainDaysText = remainDays + '天'; remainDaysClass = 'days-warn'; }
      else { remainDaysText = remainDays + '天'; remainDaysClass = 'days-safe'; }
    }
  }
  return { deliveryDateStr: deliveryDateStr, remainDays: remainDays, remainDaysText: remainDaysText, remainDaysClass: remainDaysClass };
}

module.exports = { calcDeliveryInfo: calcDeliveryInfo };
