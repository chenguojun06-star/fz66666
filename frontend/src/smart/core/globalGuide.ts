import type { SmartHintItem } from './types';

export interface SmartGlobalGuide {
  stage: string;
  nextStep: string;
  hints: SmartHintItem[];
}

const withDefaultHint = (title: string): SmartHintItem[] => [
  {
    key: 'smart-default',
    level: 'low',
    title,
  },
];

export const resolveSmartGlobalGuide = (pathname: string): SmartGlobalGuide | null => {
  const path = String(pathname || '').trim();
  if (!path) return null;

  if (
    path.startsWith('/style-info') ||
    path.startsWith('/basic/template-center') ||
    path.startsWith('/basic/pattern-revision') ||
    path.startsWith('/pattern-production') ||
    path.startsWith('/order-management') ||
    path.startsWith('/data-center')
  ) {
    return {
      stage: '开发模块',
      nextStep: '按阶段完成纸样、尺码、工序、报价后提交生产',
      hints: withDefaultHint('建议先完成基础信息与颜色码数，再进入BOM/工序'),
    };
  }

  if (path.startsWith('/production')) {
    return {
      stage: '生产模块',
      nextStep: '先确认状态节点，再执行扫码/入库/流转',
      hints: withDefaultHint('建议扫码前检查订单状态与当前工序，避免跨阶段操作'),
    };
  }

  if (path.startsWith('/finance')) {
    return {
      stage: '财务模块',
      nextStep: '先核对来源数据，再执行审批与付款',
      hints: withDefaultHint('建议优先处理差异记录与待审批单据，降低反复修改成本'),
    };
  }

  if (path.startsWith('/warehouse')) {
    return {
      stage: '仓库模块',
      nextStep: '先查库存预警，再执行出入库操作',
      hints: withDefaultHint('建议优先处理库存不足与异常库存项'),
    };
  }

  if (path.startsWith('/system') || path.startsWith('/app-store') || path.startsWith('/data-import')) {
    return {
      stage: '系统模块',
      nextStep: '按“用户/角色/权限/字典”顺序完成配置',
      hints: withDefaultHint('建议先完成角色权限，再配置业务字典，避免功能不可见'),
    };
  }

  if (path.startsWith('/integration')) {
    return {
      stage: '集成模块',
      nextStep: '先确认对接配置，再执行数据联调与验收',
      hints: withDefaultHint('建议先完成基础鉴权与字段映射，再进行接口联调'),
    };
  }

  if (path.startsWith('/dashboard')) {
    return {
      stage: '总览模块',
      nextStep: '先看异常告警，再进入对应业务页面处理',
      hints: withDefaultHint('建议优先处理逾期、审批、库存告警类事项'),
    };
  }

  return null;
};
