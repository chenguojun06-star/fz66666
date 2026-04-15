import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const miniappRoot = path.join(projectRoot, 'miniprogram');
const reportPath = path.join(projectRoot, 'h5-web', 'reports', 'miniapp-capabilities.json');

const capabilityMap = {
  'wx.login': { category: 'auth', h5Status: 'adapt', note: '改为微信公众号 OAuth / 静默登录流程' },
  'wx.scanCode': { category: 'scan', h5Status: 'adapt', note: '改为微信浏览器 camera + 二维码识别库' },
  'wx.uploadFile': { category: 'upload', h5Status: 'keep', note: '改为 FormData + fetch/axios 上传' },
  'wx.getStorageSync': { category: 'storage', h5Status: 'keep', note: '改为 localStorage/sessionStorage' },
  'wx.setStorageSync': { category: 'storage', h5Status: 'keep', note: '改为 localStorage/sessionStorage' },
  'wx.requestPayment': { category: 'payment', h5Status: 'adapt', note: '如存在需接 JSAPI 支付' },
  'wx.chooseImage': { category: 'media', h5Status: 'adapt', note: '改为 input[file]/camera' },
  'wx.previewImage': { category: 'media', h5Status: 'keep', note: '改为 H5 图片预览组件' },
  'wx.getAccountInfoSync': { category: 'env', h5Status: 'replace', note: '改为 UA / URL / 环境变量判断' },
  'wx.navigateTo': { category: 'router', h5Status: 'keep', note: '改为 H5 Router' },
  'wx.redirectTo': { category: 'router', h5Status: 'keep', note: '改为 H5 Router replace' },
  'wx.reLaunch': { category: 'router', h5Status: 'keep', note: '改为 H5 Router reset' },
  'wx.switchTab': { category: 'router', h5Status: 'keep', note: '改为底部导航切换' },
  'wx.showToast': { category: 'ui', h5Status: 'keep', note: '改为 Toast 组件' },
  'wx.showModal': { category: 'ui', h5Status: 'keep', note: '改为 Dialog 组件' },
  'wx.createSelectorQuery': { category: 'dom', h5Status: 'keep', note: '改为 DOM 查询' },
  'wx.getSystemInfoSync': { category: 'env', h5Status: 'adapt', note: '改为 window / navigator 信息' },
  'wx.getWindowInfo': { category: 'env', h5Status: 'adapt', note: '改为 window.innerWidth/innerHeight' }
};

function walk(dirPath, files = []) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'miniprogram_npm' || entry.name === '.git') {
        continue;
      }
      walk(fullPath, files);
    } else if (/\.(js|wxml|wxss|json)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function collectCapabilities() {
  const files = walk(miniappRoot);
  const usage = {};
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const apiName of Object.keys(capabilityMap)) {
      const escaped = apiName.replace('.', '\\.');
      const regex = new RegExp(escaped, 'g');
      const matches = content.match(regex);
      if (!matches) {
        continue;
      }
      if (!usage[apiName]) {
        usage[apiName] = [];
      }
      usage[apiName].push({
        file: path.relative(projectRoot, filePath).replace(/\\/g, '/'),
        count: matches.length,
      });
    }
  }
  return usage;
}

function main() {
  const capabilityUsage = collectCapabilities();
  const summary = Object.entries(capabilityUsage).map(([apiName, files]) => ({
    apiName,
    category: capabilityMap[apiName]?.category || 'unknown',
    h5Status: capabilityMap[apiName]?.h5Status || 'unknown',
    note: capabilityMap[apiName]?.note || '',
    files,
    totalCount: files.reduce((sum, item) => sum + item.count, 0),
  })).sort((a, b) => b.totalCount - a.totalCount);

  const report = {
    generatedAt: new Date().toISOString(),
    sourceRoot: 'miniprogram',
    conclusion: {
      overall: 'feasible_with_adaptation',
      message: '当前项目为微信原生小程序，不能零改动直接编译为H5，但绝大多数业务逻辑、样式资产、页面结构、接口层可复用；微信专属能力需做适配层。'
    },
    appJson: JSON.parse(fs.readFileSync(path.join(miniappRoot, 'app.json'), 'utf8')),
    capabilities: summary,
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`[analyze-miniapp-capabilities] report generated: ${reportPath}`);
}

main();
