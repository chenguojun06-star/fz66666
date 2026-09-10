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
 *   阅读态（有采购记录）: [批量领取▾(悬停:批量领取/批量回料确认/确认完成)] [编辑物料] [更多▾] [去物料明细]
 *   BOM 上下文          : [生成采购▾(primary)] [检查库存(样衣)] + 状态Tag
 *   列表页动作区        : [新增采购(primary)] [智能采购推荐] [更多▾]
 *   编辑态              : [添加物料] [保存(primary)] [取消]
 *   —— 每个区域只允许一个 primary；阅读态=批量领取/生成采购/新增采购，编辑态=保存。
 *
 * 状态机口径（D-360b 收紧）：
 *   PENDING(未领取) 只能「领取」；「登记到货/追加到货」仅 RECEIVED/PARTIAL 可用；
 *   「品质异常/回料确认」仅领取后（RECEIVED/PARTIAL/COMPLETED）可用。
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
  /**
   * 批量领取（主按钮直点即执行；原「采购全部」「批量采购」统一到这）。
   * 批量领取/回料确认/确认完成三个批量动作集成进同一个悬停下拉（D-360b）。
   */
  receive?: PurchaseActionButtonState;
  /** 批量回料确认（收进主按钮下拉） */
  batchReturn?: PurchaseActionButtonState;
  /** 确认回料完成（收进主按钮下拉） */
  confirmComplete?: PurchaseActionButtonState;
  /** 进入编辑态 */
  edit?: PurchaseActionButtonState;
  /** 编辑锁/信息不全等状态 Tag，跟在按钮组后 */
  extraTags?: React.ReactNode;
  /** 打印/下载采购单（D-360c：三弹层统一可见按钮，点击展开两项；原「采购单生成」无箭头不可发现） */
  sheet?: {
    disabled?: boolean;
    onPrint: () => void;
    onDownload: () => void;
  };
  /** 更多▾ 下拉（导出/打印/单据等低频动作），无则不渲染 */
  moreItems?: MenuProps['items'];
  /** 尾部跳转链接（去物料明细/去采购管理） */
  linkAction?: { label: string; onClick: () => void };
  size?: 'small' | 'middle';
}

/**
 * 阅读态标准操作条：[批量领取▾(悬停出菜单:批量领取/批量回料确认/确认完成)] [编辑物料] [更多▾] [跳转→]
 * 主按钮直接点击=批量领取；鼠标悬停出现全部批量动作菜单，点菜单项执行对应动作。
 */
export const PurchaseActionBar: React.FC<PurchaseActionBarProps> = ({
  receive,
  batchReturn,
  confirmComplete,
  edit,
  extraTags,
  sheet,
  moreItems,
  linkAction,
  size = 'small',
}) => {
  const batchMenuItems: MenuProps['items'] = [
    ...(receive ? [{ key: 'receive', label: PURCHASE_ACTION_LABELS.batchReceive, disabled: receive.disabled || receive.loading, onClick: receive.onClick }] : []),
    ...(batchReturn ? [{ key: 'batch-return', label: PURCHASE_ACTION_LABELS.batchReturn, disabled: batchReturn.disabled || batchReturn.loading, onClick: batchReturn.onClick }] : []),
    ...(confirmComplete ? [{ key: 'confirm-complete', label: PURCHASE_ACTION_LABELS.confirmComplete, disabled: confirmComplete.disabled || confirmComplete.loading, onClick: confirmComplete.onClick }] : []),
  ];

  return (
    <Space wrap size={8}>
      {batchMenuItems.length > 0 && receive && (
        <Dropdown menu={{ items: batchMenuItems }} trigger={['hover']}>
          <Button
            type="primary"
            size={size}
            disabled={receive.disabled}
            loading={receive.loading}
            title={receive.title}
            onClick={receive.onClick}
          >
            {PURCHASE_ACTION_LABELS.batchReceive} <DownOutlined />
          </Button>
        </Dropdown>
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
      {sheet && (
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'print', label: '打印采购单', onClick: sheet.onPrint },
              { key: 'download', label: '下载采购单', onClick: sheet.onDownload },
            ],
          }}
        >
          <Button size={size} disabled={sheet.disabled} title="打印或下载采购单文件">
            打印/下载采购单 <DownOutlined />
          </Button>
        </Dropdown>
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
};

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
