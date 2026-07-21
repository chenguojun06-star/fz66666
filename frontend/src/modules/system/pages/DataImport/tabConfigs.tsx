import {
  SkinOutlined,
  TeamOutlined,
  ToolOutlined,
  ShopOutlined,
} from '@ant-design/icons';
import type { TabConfig } from './types';

export const TAB_CONFIGS: TabConfig[] = [
  {
    key: 'style',
    label: '款式资料',
    icon: <SkinOutlined />,
    description: '导入款式基础信息，包括款号、款名、品类、颜色、码数等',
    requiredFields: '款号（必填）',
    tips: [
      '款号必须唯一，重复的款号会导入失败',
      '颜色和码数支持多个，用逗号分隔（如：红色,白色）',
      '单次最多导入 500 条',
    ],
  },
  {
    key: 'factory',
    label: '供应商',
    icon: <ShopOutlined />,
    description: '导入合作供应商/工厂信息',
    requiredFields: '供应商名称（必填）',
    tips: [
      '供应商名称必须唯一',
      '导入后默认为"启用"状态',
      '单次最多导入 500 条',
    ],
  },
  {
    key: 'employee',
    label: '员工',
    icon: <TeamOutlined />,
    description: '导入员工/工人信息，系统自动创建账号',
    requiredFields: '姓名（必填）',
    tips: [
      '系统会自动生成用户名',
      '默认密码为 123456，请通知员工修改',
      '角色默认为"普通用户"',
      '单次最多导入 500 条',
    ],
  },
  {
    key: 'process',
    label: '工序',
    icon: <ToolOutlined />,
    description: '为已有款式导入工序模板（裁剪、车缝等）',
    requiredFields: '款号 + 工序名称（必填）',
    tips: [
      '款号必须是系统中已存在的，请先导入款式',
      '同一款号下可以有多道工序',
      '工序编码为空时会自动生成 P1, P2...',
      '进度节点可选：采购/裁剪/车缝/尾部/入库',
    ],
  },
];
