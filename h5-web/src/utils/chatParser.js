export function parseAiResponse(rawText) {
  if (!rawText) return { displayText: '', actionCards: [], charts: [], teamStatusCards: [], bundleSplitCards: [], insightCards: [], followUpActions: [], recommendPills: [], stepWizardCards: [] };

  let text = rawText;
  const actionCards = [];
  const charts = [];
  const teamStatusCards = [];
  const bundleSplitCards = [];
  const insightCards = [];
  const followUpActions = [];
  const recommendPills = [];
  const stepWizardCards = [];

  const extractBlock = (tag) => {
    const re = new RegExp(`【${tag}】([\\s\\S]*?)【\\/${tag}】`, 'g');
    const matches = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      matches.push(m[1]);
    }
    text = text.replace(re, '');
    return matches;
  };

  const actionBlocks = extractBlock('ACTIONS');
  actionBlocks.forEach((block) => {
    try {
      const parsed = JSON.parse(block);
      if (Array.isArray(parsed)) {
        actionCards.push({ title: '操作建议', actions: parsed });
      } else if (parsed.actions) {
        actionCards.push({ title: parsed.title || '操作建议', actions: parsed.actions });
      }
    } catch (_) {
      block.split('\n').forEach((line) => {
        const lm = line.match(/[-*]\s*(.+)/);
        if (lm) followUpActions.push({ label: lm[1].trim(), type: 'navigate' });
      });
    }
  });

  const chartBlocks = extractBlock('CHART');
  chartBlocks.forEach((block) => {
    try {
      const parsed = JSON.parse(block);
      if (Array.isArray(parsed)) charts.push(...parsed);
      else charts.push(parsed);
    } catch (_) {}
  });

  const teamBlocks = extractBlock('TEAM_STATUS');
  teamBlocks.forEach((block) => {
    try { teamStatusCards.push(JSON.parse(block)); } catch (_) {}
  });

  const bundleBlocks = extractBlock('BUNDLE_SPLIT');
  bundleBlocks.forEach((block) => {
    try { bundleSplitCards.push(JSON.parse(block)); } catch (_) {}
  });

  const insightBlocks = extractBlock('INSIGHT_CARDS');
  insightBlocks.forEach((block) => {
    try {
      const parsed = JSON.parse(block);
      if (Array.isArray(parsed)) insightCards.push(...parsed);
      else insightCards.push(parsed);
    } catch (_) {}
  });

  const wizardBlocks = extractBlock('STEP_WIZARD');
  wizardBlocks.forEach((block) => {
    try {
      const parsed = JSON.parse(block);
      if (Array.isArray(parsed)) stepWizardCards.push(...parsed);
      else stepWizardCards.push(parsed);
    } catch (_) {}
  });

  if (text.includes('【推荐追问】：')) {
    const parts = text.split('【推荐追问】：');
    text = parts[0].trim();
    if (parts[1]) {
      parts[1].split('|').forEach((p) => {
        const trimmed = p.trim();
        if (trimmed) recommendPills.push(trimmed);
      });
    }
  }

  const codeActionRe = /```ACTIONS_JSON\s*([\s\S]*?)```/g;
  let codeMatch;
  while ((codeMatch = codeActionRe.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(codeMatch[1]);
      if (Array.isArray(parsed)) {
        actionCards.push({ title: '快捷操作', actions: parsed });
      }
    } catch (_) {}
  }
  text = text.replace(codeActionRe, '');

  return {
    displayText: text.trim(),
    actionCards,
    charts,
    teamStatusCards,
    bundleSplitCards,
    insightCards,
    followUpActions,
    recommendPills,
  };
}

export function buildOrderSegments(text) {
  if (!text) return null;
  const re = /\b(PO\d{8,15})\b/g;
  if (!re.test(text)) return null;
  re.lastIndex = 0;
  const segs = [];
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segs.push({ content: text.slice(last, m.index), isOrder: false });
    segs.push({ content: m[0], isOrder: true, orderNo: m[0] });
    last = re.lastIndex;
  }
  if (last < text.length) segs.push({ content: text.slice(last), isOrder: false });
  return segs;
}
