/**
 * 小程序全局智能引导映射（零侵入骨架）
 * 说明：
 * - 仅提供路由到引导信息的解析能力
 * - 不修改任何现有页面行为
 * - 由页面按需接入展示（后续灰度）
 */

function resolveSmartGuideByRoute(route) {
  const path = String(route || '').trim();
  if (!path) return null;

  if (path.indexOf('pages/login') === 0 || path.indexOf('pages/register') === 0) {
    return {
      stage: '账号模块',
      nextStep: '先完成登录/注册，再进入业务页面',
      hints: ['建议优先确认租户与角色，再开始业务操作'],
    };
  }

  if (path.indexOf('pages/home') === 0) {
    return {
      stage: '首页模块',
      nextStep: '先查看待办与异常，再进入处理页面',
      hints: ['建议先处理超期与待审批事项'],
    };
  }

  if (path.indexOf('pages/privacy') === 0) {
    return {
      stage: '隐私模块',
      nextStep: '确认隐私授权后继续使用业务功能',
      hints: ['建议完成隐私授权，避免扫码/上传等能力受限'],
    };
  }

  if (path.indexOf('pages/scan') === 0 || path.indexOf('pages/work') === 0) {
    return {
      stage: '生产模块',
      nextStep: '先确认扫码模式和工序，再执行提交',
      hints: ['建议优先处理失败/待重试记录，避免重复扫码'],
    };
  }

  if (path.indexOf('pages/warehouse') === 0) {
    return {
      stage: '仓库模块',
      nextStep: '先查看库存与预警，再执行出入库操作',
      hints: ['建议先处理库存不足和异常库存项'],
    };
  }

  if (path.indexOf('pages/admin') === 0) {
    return {
      stage: '管理模块',
      nextStep: '先核对待办与审批，再执行批量操作',
      hints: ['建议先处理超期单据与审批积压'],
    };
  }

  return null;
}

module.exports = {
  resolveSmartGuideByRoute,
};
