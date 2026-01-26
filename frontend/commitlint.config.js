/* eslint-env node */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',     // 新功能
        'fix',      // Bug 修复
        'docs',     // 文档更新
        'style',    // 格式调整（不影响代码逻辑）
        'refactor', // 重构
        'perf',     // 性能优化
        'test',     // 测试相关
        'chore',    // 构建/工具链
        'revert',   // 回滚
      ],
    ],
    'subject-case': [0], // 关闭主题大小写检查（支持中文）
  },
};
