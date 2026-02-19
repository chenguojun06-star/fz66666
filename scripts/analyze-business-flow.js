#!/usr/bin/env node

/**
 * 业务流程数据流转分析
 * 分析 Orchestrator 中的服务调用链路
 */

const fs = require('fs');
const path = require('path');

const BACKEND_DIR = path.join(__dirname, '../backend/src/main/java/com/fashion/supplychain');

// 匹配模式
const SERVICE_CALL_PATTERN = /(\w+Service)\.(\w+)\(/g;
const MAPPER_CALL_PATTERN = /(\w+Mapper)\.(\w+)\(/g;

// 业务流程定义
const BUSINESS_FLOWS = {
  '订单管理': ['ProductionOrderOrchestrator', 'OrderTransferOrchestrator'],
  '生产管理': ['CuttingTaskOrchestrator', 'ScanOrchestrator', 'QualityOrchestrator', 'BundleOrchestrator'],
  '对账管理': ['ShipmentReconciliationOrchestrator', 'FactoryReconciliationOrchestrator', 'MaterialReconciliationOrchestrator'],
  '财务管理': ['FinanceOrchestrator', 'PayrollOrchestrator', 'CostAnalysisOrchestrator'],
  '仓储管理': ['WarehousingOrchestrator', 'InventoryOrchestrator'],
  '采购管理': ['MaterialPurchaseOrchestrator', 'SupplierOrchestrator'],
};

// 分析单个文件
function analyzeOrchestrator(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const className = path.basename(filePath, '.java');

  const serviceCalls = new Map();
  const mapperCalls = new Map();

  // 提取服务调用
  let match;
  while ((match = SERVICE_CALL_PATTERN.exec(content)) !== null) {
    const service = match[1];
    const method = match[2];

    if (!serviceCalls.has(service)) {
      serviceCalls.set(service, []);
    }
    serviceCalls.get(service).push(method);
  }

  // 提取 Mapper 调用
  SERVICE_CALL_PATTERN.lastIndex = 0;
  while ((match = MAPPER_CALL_PATTERN.exec(content)) !== null) {
    const mapper = match[1];
    const method = match[2];

    if (!mapperCalls.has(mapper)) {
      mapperCalls.set(mapper, []);
    }
    mapperCalls.get(mapper).push(method);
  }

  return {
    className,
    serviceCalls,
    mapperCalls,
    totalServiceCalls: Array.from(serviceCalls.values()).flat().length,
    totalMapperCalls: Array.from(mapperCalls.values()).flat().length,
  };
}

// 递归扫描目录
function scanOrchestrators(dir) {
  const results = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  function scan(currentDir) {
    fs.readdirSync(currentDir).forEach(file => {
      const fullPath = path.join(currentDir, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        scan(fullPath);
      } else if (file.endsWith('Orchestrator.java')) {
        results.push(analyzeOrchestrator(fullPath));
      }
    });
  }

  scan(dir);
  return results;
}

// 评级函数
function getRating(totalCalls) {
  if (totalCalls <= 5) return { emoji: '✅', level: 'good', color: '\x1b[32m' };
  if (totalCalls <= 10) return { emoji: '⚠️ ', level: 'warning', color: '\x1b[33m' };
  return { emoji: '❌', level: 'critical', color: '\x1b[31m' };
}

// 主函数
function main() {
  console.log('🔍 服装供应链系统 - 业务流程数据流转分析');
  console.log('==========================================\n');

  const results = scanOrchestrators(BACKEND_DIR);

  if (results.length === 0) {
    console.log('⚠️  未找到 Orchestrator 文件');
    console.log('   检查路径:', BACKEND_DIR);
    return;
  }

  // 按业务流程分组
  const flowGroups = new Map();
  Object.entries(BUSINESS_FLOWS).forEach(([flowName, orchestrators]) => {
    flowGroups.set(flowName, []);
    orchestrators.forEach(orch => {
      const result = results.find(r => r.className === orch);
      if (result) {
        flowGroups.get(flowName).push(result);
      }
    });
  });

  // 其他 Orchestrator
  const categorized = new Set(
    Object.values(BUSINESS_FLOWS).flat()
  );
  const others = results.filter(r => !categorized.has(r.className));
  if (others.length > 0) {
    flowGroups.set('其他', others);
  }

  // 输出分析结果
  flowGroups.forEach((orchestrators, flowName) => {
    if (orchestrators.length === 0) return;

    console.log(`\n📋 ${flowName}`);
    console.log('='.repeat(40));

    orchestrators.forEach(orch => {
      const totalCalls = orch.totalServiceCalls + orch.totalMapperCalls;
      const rating = getRating(totalCalls);

      console.log(`\n${rating.color}${rating.emoji} ${orch.className}\x1b[0m`);
      console.log(`   📊 总调用: ${totalCalls} (Service: ${orch.totalServiceCalls}, Mapper: ${orch.totalMapperCalls})`);

      // 服务依赖
      if (orch.serviceCalls.size > 0) {
        console.log(`   🔗 依赖服务 (${orch.serviceCalls.size}):`);
        orch.serviceCalls.forEach((methods, service) => {
          console.log(`      - ${service}: ${methods.length} 次`);
        });
      }

      // Mapper 调用
      if (orch.mapperCalls.size > 0) {
        console.log(`   💾 数据访问 (${orch.mapperCalls.size}):`);
        orch.mapperCalls.forEach((methods, mapper) => {
          console.log(`      - ${mapper}: ${methods.length} 次`);
        });
      }

      // 优化建议
      if (rating.level === 'critical') {
        console.log(`   ${rating.color}💡 建议: 调用过多，考虑拆分或批量操作\x1b[0m`);
      } else if (rating.level === 'warning') {
        console.log(`   ${rating.color}💡 建议: 关注性能，考虑合并相似调用\x1b[0m`);
      }
    });
  });

  // 生成数据流转图（Mermaid 格式）
  console.log('\n\n📊 数据流转图（Mermaid）');
  console.log('='.repeat(40));

  const mermaidContent = generateMermaidDiagram(results);
  console.log(mermaidContent);

  // 保存到文件
  const diagramFile = path.join(__dirname, '../docs/diagrams/data-flow.md');
  fs.mkdirSync(path.dirname(diagramFile), { recursive: true });
  fs.writeFileSync(diagramFile, `# 数据流转图\n\n\`\`\`mermaid\n${mermaidContent}\n\`\`\`\n`);
  console.log(`\n📄 流转图已保存: docs/diagrams/data-flow.md`);

  // 统计总结
  console.log('\n\n📊 统计总结');
  console.log('='.repeat(40));

  const stats = {
    total: results.length,
    good: results.filter(r => getRating(r.totalServiceCalls + r.totalMapperCalls).level === 'good').length,
    warning: results.filter(r => getRating(r.totalServiceCalls + r.totalMapperCalls).level === 'warning').length,
    critical: results.filter(r => getRating(r.totalServiceCalls + r.totalMapperCalls).level === 'critical').length,
  };

  console.log(`   总 Orchestrator 数: ${stats.total}`);
  console.log(`   \x1b[32m✅ 良好: ${stats.good}\x1b[0m`);
  console.log(`   \x1b[33m⚠️  警告: ${stats.warning}\x1b[0m`);
  console.log(`   \x1b[31m❌ 严重: ${stats.critical}\x1b[0m`);

  if (stats.total > 0) {
    const healthScore = Math.round((stats.good / stats.total) * 100);
    console.log(`\n   健康度评分: ${healthScore}%`);
  }

  console.log('\n💡 评判标准');
  console.log('   ✅ 良好: 总调用 ≤ 5');
  console.log('   ⚠️  警告: 总调用 6-10');
  console.log('   ❌ 严重: 总调用 > 10');
  console.log('');
}

// 生成 Mermaid 流转图
function generateMermaidDiagram(results) {
  let mermaid = 'graph TB\n';

  // 只显示前5个最复杂的 Orchestrator
  const top5 = results
    .sort((a, b) => (b.totalServiceCalls + b.totalMapperCalls) - (a.totalServiceCalls + a.totalMapperCalls))
    .slice(0, 5);

  top5.forEach(orch => {
    const orchNode = orch.className.replace('Orchestrator', 'Orch');
    mermaid += `    ${orchNode}[${orch.className}]\n`;

    orch.serviceCalls.forEach((methods, service) => {
      const serviceNode = service.replace('Service', 'Svc');
      mermaid += `    ${orchNode} --> ${serviceNode}\n`;
    });

    orch.mapperCalls.forEach((methods, mapper) => {
      const mapperNode = mapper.replace('Mapper', 'Map');
      mermaid += `    ${orchNode} -.-> ${mapperNode}[(${mapper})]\n`;
    });
  });

  return mermaid;
}

// 运行
main();
