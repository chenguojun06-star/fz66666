/**
 * 小云 AI 回复解析器
 * 从 AI 原始回复文本中提取结构化卡片数据（ActionCard / Chart / TeamStatus / BundleSplit / StepWizard）
 * 对标 PC 端 xiaoyunChatAdapter.ts → parseXiaoyunLegacyMeta()
 */

/**
 * 解析 AI 回复中的标记块，返回纯文本 + 各类卡片数据
 * @param {string} rawText AI原始回复
 * @returns {{ displayText: string, actionCards: Array, charts: Array, teamStatusCards: Array, bundleSplitCards: Array, stepWizardCards: Array }}
 */
function parseChatReply(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { displayText: rawText || '', actionCards: [], charts: [], teamStatusCards: [], bundleSplitCards: [], stepWizardCards: [] };
  }

  var actionCards = [];
  var charts = [];
  var teamStatusCards = [];
  var bundleSplitCards = [];
  var stepWizardCards = [];

  // 【ACTIONS】[...]【/ACTIONS】
  var actionsRe = /【ACTIONS】([\s\S]*?)【\/ACTIONS】/g;
  var m;
  while ((m = actionsRe.exec(rawText)) !== null) {
    try {
      var parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) {
        actionCards = actionCards.concat(parsed);
      }
    } catch (e) { /* 解析失败静默忽略 */ }
  }

  // 【CHART】{...}【/CHART】
  var chartRe = /【CHART】([\s\S]*?)【\/CHART】/g;
  while ((m = chartRe.exec(rawText)) !== null) {
    try {
      charts.push(JSON.parse(m[1].trim()));
    } catch (e) { /* ignore */ }
  }

  // 【TEAM_STATUS】[...]【/TEAM_STATUS】
  var teamRe = /【TEAM_STATUS】([\s\S]*?)【\/TEAM_STATUS】/g;
  while ((m = teamRe.exec(rawText)) !== null) {
    try {
      var p = JSON.parse(m[1].trim());
      if (Array.isArray(p)) {
        teamStatusCards = teamStatusCards.concat(p);
      }
    } catch (e) { /* ignore */ }
  }

  // 【BUNDLE_SPLIT】[...]【/BUNDLE_SPLIT】
  var bundleRe = /【BUNDLE_SPLIT】([\s\S]*?)【\/BUNDLE_SPLIT】/g;
  while ((m = bundleRe.exec(rawText)) !== null) {
    try {
      var bp = JSON.parse(m[1].trim());
      if (Array.isArray(bp)) {
        bundleSplitCards = bundleSplitCards.concat(bp);
      }
    } catch (e) { /* ignore */ }
  }

  // 【STEP_WIZARD】[...]【/STEP_WIZARD】
  var wizardRe = /【STEP_WIZARD】([\s\S]*?)【\/STEP_WIZARD】/g;
  while ((m = wizardRe.exec(rawText)) !== null) {
    try {
      var wp = JSON.parse(m[1].trim());
      if (Array.isArray(wp)) {
        stepWizardCards = stepWizardCards.concat(wp);
      } else {
        stepWizardCards.push(wp);
      }
    } catch (e) { /* ignore */ }
  }

  // 剥离所有标记块 → 纯文本
  var displayText = rawText
    .replace(/【CHART】[\s\S]*?【\/CHART】/g, '')
    .replace(/【ACTIONS】[\s\S]*?【\/ACTIONS】/g, '')
    .replace(/【TEAM_STATUS】[\s\S]*?【\/TEAM_STATUS】/g, '')
    .replace(/【BUNDLE_SPLIT】[\s\S]*?【\/BUNDLE_SPLIT】/g, '')
    .replace(/【STEP_WIZARD】[\s\S]*?【\/STEP_WIZARD】/g, '')
    .replace(/【INSIGHT_CARDS】[\s\S]*?【\/INSIGHT_CARDS】/g, '')
    .replace(/```ACTIONS_JSON\s*\n[\s\S]*?\n```/g, '')
    .trim();

  return { displayText: displayText, actionCards: actionCards, charts: charts, teamStatusCards: teamStatusCards, bundleSplitCards: bundleSplitCards, stepWizardCards: stepWizardCards };
}

/**
 * 判断消息是否有富媒体卡片
 * @param {object} msg 消息对象
 * @returns {boolean}
 */
function hasRichContent(msg) {
  return (msg.actionCards && msg.actionCards.length > 0)
    || (msg.charts && msg.charts.length > 0)
    || (msg.teamStatusCards && msg.teamStatusCards.length > 0)
    || (msg.bundleSplitCards && msg.bundleSplitCards.length > 0)
    || (msg.stepWizardCards && msg.stepWizardCards.length > 0);
}

module.exports = { parseChatReply: parseChatReply, hasRichContent: hasRichContent };
