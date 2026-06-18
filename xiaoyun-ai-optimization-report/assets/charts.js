(function() {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();
  var danger = style.getPropertyValue('--danger').trim();
  var success = style.getPropertyValue('--success').trim();

  // --- Chart 1: Gap Analysis Radar ---
  var chartGap = echarts.init(document.getElementById('chart-gap'), null, { renderer: 'svg' });

  var dimensions = [
    '对话循环引擎', '工具调用能力', '多Agent协作', '记忆系统',
    'RAG检索', '语义缓存', '自我进化', '输出质量门控',
    'MCP协议', '主动洞察', '流式响应', '结构化输出',
    'Agentic RAG', '记忆治理', 'MCP Client', '多模态',
    '自然语言查询', '智能排产', '数字孪生'
  ];

  var currentScores = [85, 90, 75, 80, 78, 82, 70, 30, 75, 72, 88, 35, 20, 25, 15, 5, 15, 20, 25];
  var targetScores =  [90, 90, 85, 90, 90, 85, 85, 90, 85, 85, 90, 90, 85, 85, 80, 70, 80, 75, 70];

  chartGap.setOption({
    tooltip: {
      trigger: 'item',
      appendToBody: true,
      formatter: function(params) {
        return params.name + '<br/>小云当前: ' + currentScores[params.dataIndex] + '<br/>前沿标准: ' + targetScores[params.dataIndex];
      }
    },
    legend: {
      data: ['小云AI当前', '前沿标准'],
      bottom: 0,
      textStyle: { color: muted, fontSize: 12 }
    },
    radar: {
      indicator: dimensions.map(function(d, i) {
        return { name: d, max: 100 };
      }),
      shape: 'polygon',
      splitNumber: 5,
      axisName: {
        color: muted,
        fontSize: 10,
        lineHeight: 14
      },
      splitLine: { lineStyle: { color: rule } },
      splitArea: { show: false },
      axisLine: { lineStyle: { color: rule } }
    },
    series: [{
      type: 'radar',
      data: [
        {
          name: '小云AI当前',
          value: currentScores,
          areaStyle: { color: accent + '33' },
          lineStyle: { color: accent, width: 2 },
          itemStyle: { color: accent },
          symbol: 'circle',
          symbolSize: 4
        },
        {
          name: '前沿标准',
          value: targetScores,
          areaStyle: { color: accent2 + '22' },
          lineStyle: { color: accent2, width: 2, type: 'dashed' },
          itemStyle: { color: accent2 },
          symbol: 'diamond',
          symbolSize: 4
        }
      ]
    }]
  });
  window.addEventListener('resize', function() { chartGap.resize(); });

  // --- Chart 2: Roadmap Timeline ---
  var chartRoadmap = echarts.init(document.getElementById('chart-roadmap'), null, { renderer: 'svg' });

  var phases = [
    { name: '第一阶段\n修复失效能力', start: 0, end: 2, priority: 'P0', color: danger },
    { name: '第二阶段\n架构治理', start: 2, end: 5, priority: 'P1', color: accent2 },
    { name: '第三阶段\n能力升级', start: 5, end: 9, priority: 'P1', color: accent },
    { name: '第四阶段\n行业深化', start: 9, end: 15, priority: 'P2', color: muted }
  ];

  var items = [
    { name: 'SelfCritiqueGate前移', phase: 0, row: 0 },
    { name: 'DataTruthGuards接入', phase: 0, row: 1 },
    { name: 'Guardrails拦截生效', phase: 0, row: 2 },
    { name: 'MCP租户隔离', phase: 0, row: 3 },
    { name: 'Orchestrator拆分', phase: 1, row: 0 },
    { name: 'LoopEngine瘦身', phase: 1, row: 1 },
    { name: 'Redis N+1修复', phase: 1, row: 2 },
    { name: '线程池统一', phase: 1, row: 3 },
    { name: 'Agentic RAG', phase: 2, row: 0 },
    { name: '记忆治理升级', phase: 2, row: 1 },
    { name: 'MCP Client', phase: 2, row: 2 },
    { name: '交期预测ML', phase: 2, row: 3 },
    { name: 'NL查询引擎', phase: 2, row: 4 },
    { name: '工艺单OCR', phase: 3, row: 0 },
    { name: '智能排产增强', phase: 3, row: 1 },
    { name: '知识智能体深化', phase: 3, row: 2 },
    { name: '数字孪生全链路', phase: 3, row: 3 },
    { name: 'GraphRAG升级', phase: 3, row: 4 }
  ];

  var phaseBarData = phases.map(function(p) {
    return {
      name: p.name,
      value: [p.start, p.end - p.start, p.end],
      itemStyle: { color: p.color + '44', borderColor: p.color, borderWidth: 1, borderRadius: 4 }
    };
  });

  var itemData = items.map(function(item) {
    var phase = phases[item.phase];
    return {
      name: item.name,
      value: [phase.start + 0.3, item.row, (phase.end - phase.start) - 0.6],
      itemStyle: { color: phase.color }
    };
  });

  chartRoadmap.setOption({
    tooltip: {
      trigger: 'item',
      appendToBody: true,
      formatter: function(params) {
        return params.name;
      }
    },
    grid: {
      left: 120,
      right: 40,
      top: 30,
      bottom: 60
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: 15,
      name: '周',
      axisLabel: { color: muted, formatter: '{value}W' },
      axisLine: { lineStyle: { color: rule } },
      splitLine: { lineStyle: { color: rule, type: 'dashed' } }
    },
    yAxis: {
      type: 'value',
      min: -0.5,
      max: 5,
      inverse: true,
      axisLabel: { show: false },
      axisLine: { show: false },
      splitLine: { show: false }
    },
    series: [
      {
        type: 'custom',
        renderItem: function(params, api) {
          var categoryIndex = api.value(1);
          var start = api.coord([api.value(0), categoryIndex]);
          var end = api.coord([api.value(0) + api.value(2), categoryIndex]);
          var height = api.size([0, 1])[1] * 0.6;
          var rectShape = echarts.graphic.clipRectByRect(
            { x: start[0], y: start[1] - height / 2, width: end[0] - start[0], height: height },
            { x: params.coordSys.x, y: params.coordSys.y, width: params.coordSys.width, height: params.coordSys.height }
          );
          return rectShape && {
            type: 'rect',
            transition: ['shape'],
            shape: rectShape,
            style: api.style()
          };
        },
        encode: { x: [0, 2], y: 1 },
        data: phaseBarData,
        z: 1
      },
      {
        type: 'custom',
        renderItem: function(params, api) {
          var categoryIndex = api.value(1);
          var start = api.coord([api.value(0), categoryIndex]);
          var end = api.coord([api.value(0) + api.value(2), categoryIndex]);
          var height = api.size([0, 1])[1] * 0.35;
          var rectShape = echarts.graphic.clipRectByRect(
            { x: start[0], y: start[1] - height / 2, width: end[0] - start[0], height: height },
            { x: params.coordSys.x, y: params.coordSys.y, width: params.coordSys.width, height: params.coordSys.height }
          );
          return rectShape && {
            type: 'rect',
            transition: ['shape'],
            shape: rectShape,
            style: api.style()
          };
        },
        encode: { x: [0, 2], y: 1 },
        data: itemData,
        z: 2
      }
    ]
  });
  window.addEventListener('resize', function() { chartRoadmap.resize(); });

})();
