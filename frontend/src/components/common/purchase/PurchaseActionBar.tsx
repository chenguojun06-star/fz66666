import React from 'react';
import { Button, Dropdown, Space } from 'antd';
import type { MenuProps } from 'antd';
import { DownOutlined, PlusOutlined, ThunderboltOutlined } from '@ant-design/icons';

/**
 * 物料采购统一操作条（D-360 全量统一）
 *
 * 五个采购入口（样衣BOM Tab / 订单面辅料Tab / 订单采购节点弹窗 / 采购管理列表页 / 物料详情页）
 * 的按钮文案、分组、顺序、主次从这里取，禁止页面自造第四种叫法。
 *
 * 词汇表（全站唯一）：
 *   生成采购      = 从物料清单创建采购记录（先缺料分析：生成全部 / 仅缺料）
 *   加入采购车    = 物料进购物车合并下单
 *   批量领取/领取 = 从库存领取物料（原「采购全部」「批量采购」均为领取语义，统一改叫领取）
 *   登记到货      = 到货入库（confirm-arrival）
 *   出库领取      = 仓库领料出库（warehouse-pick）
 *   回料确认      = return-confirm
 *   确认完成      = confirm-complete
 *   撤回领取      = cancel-receive（原「撤回采购」）
 *   去采购管理    = 跳 /production/material（物料采购列表页）
 *   去物料明细    = 跳 /production/material/:styleNo
 *
 * 布局标准：
 *   阅读态（有采购记录）: [批量领取(primary)] [回料确认] [确认完成] [编辑物料] [更多▾] [去物料明细]
 *   BOM 上下文          : [生成采购▾(primary)] [检查库存(样衣)] + 状态Tag
 *   列表页动作区        : [新增采购(primary)] [智能采购推荐] [更多▾]
 *   编辑态              : [添加物料] [保存(primary)] [取消]
 *   —— 每个区域只允许一个 primary；阅读态=批量领取/生成采购/新增采购，编辑态=保存。
 */

export const PURCHASE_ACTION_LABELS = {
  generate: '生成采购',
  analyzeGenerate: '缺料分析生成（推荐）',
  addToCart: '加入采购车（全部物料）',
  batchReceive: '批量领取',
  receive: '领取',
  arrivalRegister: '登记到货',
  warehousePick: '出库领取',
  batchReturn: '回料确认',
  confirmComplete: '确认完成',
  editMaterial: '编辑物料',
  addMaterial: '添加物料',
  save: '保存',
  cancel: '取消',
  more: '更多',
  goPurchaseCenter: '去采购管理',
  goMaterialDetail: '去物料明细',
  checkStock: '检查库存',
  newPurchase: '新增采购',
  smartSourcing: '智能采购推荐',
} as const;

export interface PurchaseActionButtonState {
  disabled?: boolean;
  loading?: boolean;
  title?: string;
  onClick: () => void;
}

interface PurchaseActionBarProps {
  /** 批量领取（从库存领取全部可领取行；原「采购全部」「批量采购」统一到这） */
  receive?: PurchaseActionButtonState;
  /** 批量回料确认 */
  batchReturn?: PurchaseActionButtonState;
  /** 确认回料完成 */
  confirmComplete?: PurchaseActionButtonState;
  /** 进入编辑态 */
  edit?: PurchaseActionButtonState;
  /** 编辑锁/信息不全等状态 Tag，跟在按钮组后 */
  extraTags?: React.ReactNode;
  /** 更多▾ 下拉（导出/打印/单据等低频动作），无则不渲染 */
  moreItems?: MenuProps['items'];
  /** 尾部跳转链接（去物料明细/去采购管理） */
  linkAction?: { label: string; onClick: () => void };
  size?: 'small' | 'middle';
}

/** 阅读态标准操作条：批量领取 / 回料确认 / 确认完成 / 编辑物料 / 更多▾ / 跳转 */
export const PurchaseActionBar: React.FC<PurchaseActionBarProps> = ({
  receive,
  batchReturn,
  confirmComplete,
  edit,
  extraTags,
  moreItems,
  linkAction,
  size = 'small',
}) => (
  <Space wrap size={8}>
    {receive && (
      <Button
        type="primary"
        size={size}
        disabled={receive.disabled}
        loading={receive.loading}
        title={receive.title}
        onClick={receive.onClick}
      >
        {PURCHASE_ACTION_LABELS.batchReceive}
      </Button>
    )}
    {batchReturn && (
      <Button
        size={size}
        disabled={batchReturn.disabled}
        loading={batchReturn.loading}
        title={batchReturn.title}
        onClick={batchReturn.onClick}
      >
        {PURCHASE_ACTION_LABELS.batchReturn}
      </Button>
    )}
    {confirmComplete && (
      <Button
        size={size}
        disabled={confirmComplete.disabled}
        loading={confirmComplete.loading}
        title={confirmComplete.title}
        onClick={confirmComplete.onClick}
      >
        {PURCHASE_ACTION_LABELS.confirmComplete}
      </Button>
    )}
    {edit && (
      <Button
        size={size}
        disabled={edit.disabled}
        loading={edit.loading}
        title={edit.title}
        onClick={edit.onClick}
      >
        {PURCHASE_ACTION_LABELS.editMaterial}
      </Button>
    )}
    {extraTags}
    {moreItems && moreItems.length > 0 && (
      <Dropdown menu={{ items: moreItems }} trigger={['hover']}>
        <Button size={size}>
          {PURCHASE_ACTION_LABELS.more} <DownOutlined />
        </Button>
      </Dropdown>
    )}
    {linkAction && (
      <Button type="link" size={size} style={{ padding: 0 }} onClick={linkAction.onClick}>
        {linkAction.label} →
      </Button>
    )}
  </Space>
);

interface PurchaseEditActionsProps {
  onAdd?: () => void;
  addLabel?: string;
  addDisabled?: boolean;
  onSave: () => void;
  saving?: boolean;
  onCancel: () => void;
  size?: 'small' | 'middle';
}

/** 编辑态标准按钮组：添加物料 / 保存(primary) / 取消 */
export const PurchaseEditActions: React.FC<PurchaseEditActionsProps> = ({
  onAdd,
  addLabel = PURCHASE_ACTION_LABELS.addMaterial,
  addDisabled,
  onSave,
  saving,
  onCancel,
  size = 'small',
}) => (
  <Space wrap size={8}>
    {onAdd && (
      <Button type="dashed" size={size} icon={<PlusOutlined />} disabled={addDisabled} onClick={onAdd}>
        {addLabel}
      </Button>
    )}
    <Button type="primary" size={size} loading={saving} onClick={onSave}>
      {PURCHASE_ACTION_LABELS.save}
    </Button>
    <Button size={size} onClick={onCancel}>
      {PURCHASE_ACTION_LABELS.cancel}
    </Button>
  </Space>
);

interface PurchaseGenerateDropdownProps {
  /** 缺料分析生成（打开分析弹窗） */
  onAnalyze: () => void;
  /** 加入采购车（全部物料）；不传则不渲染该菜单项 */
  onAddToCart?: () => void;
  generating?: boolean;
  disabled?: boolean;
  primary?: boolean;
  size?: 'small' | 'middle';
}

/** BOM 上下文标准生成按钮：生成采购（有加购入口时为▾下拉，否则平铺按钮）；点击先开缺料分析 */
export const PurchaseGenerateDropdown: React.FC<PurchaseGenerateDropdownProps> = ({
  onAnalyze,
  onAddToCart,
  generating,
  disabled,
  primary = true,
  size = 'middle',
}) => {
  if (!onAddToCart) {
    return (
      <Button
        type={primary ? 'primary' : 'default'}
        size={size}
        icon={<ThunderboltOutlined />}
        loading={generating}
        disabled={disabled}
        onClick={onAnalyze}
      >
        {PURCHASE_ACTION_LABELS.generate}
      </Button>
    );
  }
  const items: MenuProps['items'] = [
    { key: 'analyze', label: PURCHASE_ACTION_LABELS.analyzeGenerate },
    { key: 'cart', label: PURCHASE_ACTION_LABELS.addToCart },
  ];
  return (
    <Dropdown
      disabled={disabled}
      menu={{
        items,
        onClick: ({ key }) => {
          if (key === 'analyze') onAnalyze();
          else onAddToCart();
        },
      }}
    >
      <Button type={primary ? 'primary' : 'default'} size={size} icon={<ThunderboltOutlined />} loading={generating} disabled={disabled}>
        {PURCHASE_ACTION_LABELS.generate} <DownOutlined />
      </Button>
    </Dropdown>
  );
};

export default PurchaseActionBar;
