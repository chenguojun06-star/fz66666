/**
 * 小云 AI 回复解析器
 * 从 AI 原始回复文本中提取结构化卡片数据
 * 对标 PC 端 xiaoyunChatAdapter.ts → parseXiaoyunLegacyMeta()
 */

function parseChatReply(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { displayText: rawText || '', actionCards: [], charts: [], teamStatusCards: [], bundleSplitCards: [], stepWizardCards: [], insightCards: [], clarificationHints: [] };
  }

  var actionCards = [];
  var charts = [];
  var teamStatusCards = [];
  var bundleSplitCards = [];
  var stepWizardCards = [];
  var insightCards = [];
  var clarificationHints = [];

  function safeParse(str) {
    try { return JSON.parse(str); } catch (e) { return null; }
  }

  function validateCard(item) {
    return item && typeof item === 'object' && item.title;
  }

  var actionsRe = /【ACTIONS】([\s\S]*?)【\/ACTIONS】/g;
  var m;
  while ((m = actionsRe.exec(rawText)) !== null) {
    var parsed = safeParse(m[1].trim());
    if (Array.isArray(parsed)) {
      parsed.forEach(function(item) { if (validateCard(item)) actionCards.push(item); });
    } else if (validateCard(parsed)) {
      actionCards.push(parsed);
    }
  }

  var chartRe = /【CHART】([\s\S]*?)【\/CHART】/g;
  while ((m = chartRe.exec(rawText)) !== null) {
    var cp = safeParse(m[1].trim());
    if (Array.isArray(cp)) {
      cp.forEach(function(item) { if (validateCard(item)) charts.push(item); });
    } else if (validateCard(cp)) {
      charts.push(cp);
    }
  }

  var teamRe = /【TEAM_STATUS】([\s\S]*?)【\/TEAM_STATUS】/g;
  while ((m = teamRe.exec(rawText)) !== null) {
    var tp = safeParse(m[1].trim());
    if (Array.isArray(tp)) {
      teamStatusCards = teamStatusCards.concat(tp);
    } else if (tp) {
      teamStatusCards.push(tp);
    }
  }

  var bundleRe = /【BUNDLE_SPLIT】([\s\S]*?)【\/BUNDLE_SPLIT】/g;
  while ((m = bundleRe.exec(rawText)) !== null) {
    var bp = safeParse(m[1].trim());
    if (Array.isArray(bp)) {
      bundleSplitCards = bundleSplitCards.concat(bp);
    } else if (bp) {
      bundleSplitCards.push(bp);
    }
  }

  var wizardRe = /【STEP_WIZARD】([\s\S]*?)【\/STEP_WIZARD】/g;
  while ((m = wizardRe.exec(rawText)) !== null) {
    var wp = safeParse(m[1].trim());
    if (Array.isArray(wp)) {
      stepWizardCards = stepWizardCards.concat(wp);
    } else if (wp) {
      stepWizardCards.push(wp);
    }
  }

  var insightRe = /【INSIGHT_CARDS】([\s\S]*?)【\/INSIGHT_CARDS】/g;
  while ((m = insightRe.exec(rawText)) !== null) {
    var ip = safeParse(m[1].trim());
    if (Array.isArray(ip)) {
      ip.forEach(function(item) { if (validateCard(item)) insightCards.push(item); });
    } else if (validateCard(ip)) {
      insightCards.push(ip);
    }
  }

  var clarifRe = /【CLARIFICATION】([\s\S]*?)【\/CLARIFICATION】/g;
  while ((m = clarifRe.exec(rawText)) !== null) {
    var clp = safeParse(m[1].trim());
    if (Array.isArray(clp)) {
      clp.forEach(function(item) { if (typeof item === 'string') clarificationHints.push(item); });
    }
  }

  var displayText = rawText
    .replace(/【CHART】[\s\S]*?【\/CHART】/g, '')
    .replace(/【ACTIONS】[\s\S]*?【\/ACTIONS】/g, '')
    .replace(/【TEAM_STATUS】[\s\S]*?【\/TEAM_STATUS】/g, '')
    .replace(/【BUNDLE_SPLIT】[\s\S]*?【\/BUNDLE_SPLIT】/g, '')
    .replace(/【STEP_WIZARD】[\s\S]*?【\/STEP_WIZARD】/g, '')
    .replace(/【INSIGHT_CARDS】[\s\S]*?【\/INSIGHT_CARDS】/g, '')
    .replace(/【CLARIFICATION】[\s\S]*?【\/CLARIFICATION】/g, '')
    .replace(/```ACTIONS_JSON\s*\n[\s\S]*?\n```/g, '')
    .trim();

  return { displayText: displayText, actionCards: actionCards, charts: charts, teamStatusCards: teamStatusCards, bundleSplitCards: bundleSplitCards, stepWizardCards: stepWizardCards, insightCards: insightCards, clarificationHints: clarificationHints };
}

function hasRichContent(msg) {
  return (msg.actionCards && msg.actionCards.length > 0)
    || (msg.charts && msg.charts.length > 0)
    || (msg.teamStatusCards && msg.teamStatusCards.length > 0)
    || (msg.bundleSplitCards && msg.bundleSplitCards.length > 0)
    || (msg.stepWizardCards && msg.stepWizardCards.length > 0)
    || (msg.insightCards && msg.insightCards.length > 0);
}

module.exports = { parseChatReply: parseChatReply, hasRichContent: hasRichContent };
