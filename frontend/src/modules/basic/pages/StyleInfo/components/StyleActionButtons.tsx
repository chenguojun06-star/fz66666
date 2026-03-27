import React from 'react';
import { Button, Space } from 'antd';

interface StyleActionButtonsProps {
  // 状态
  saving: boolean;
  completingSample: boolean;
  pushingToOrder: boolean;
  editLocked: boolean;
  isNewPage: boolean;
  sampleCompleted: boolean;
  hasProcessData: boolean;
  pushedToOrder: boolean;

  // 操作
  onSave: () => void;
  onCompleteSample: () => void;
  onPushToOrder: () => void;
  onUnlock: () => void;
}

/**
 * 款式详情操作按钮组
 * 包含：返回列表、解锁编辑、保存、开发完成、推送到订单
 */
const StyleActionButtons: React.FC<StyleActionButtonsProps> = ({
  saving,
  completingSample,
  pushingToOrder,
  editLocked,
  isNewPage,
  sampleCompleted,
  hasProcessData,
  pushedToOrder,
  onSave,
  onCompleteSample,
  onPushToOrder,
  onUnlock,
}) => {
  const primaryButtonStyle: React.CSSProperties = {
    paddingInline: 12,
  };

  const disabledButtonStyle: React.CSSProperties = {
    ...primaryButtonStyle,
    backgroundColor: 'var(--neutral-border)',
    borderColor: 'var(--neutral-border)',
    color: 'var(--neutral-text-secondary)',
  };

  const sampleButtonStyle: React.CSSProperties = {
    ...primaryButtonStyle,
    backgroundColor: sampleCompleted ? 'var(--neutral-border)' : 'var(--color-success)',
    borderColor: sampleCompleted ? 'var(--neutral-border)' : 'var(--color-success)',
  };

  const unlockDisabled = !isNewPage && editLocked && sampleCompleted;
  const saveDisabled = !isNewPage && !editLocked && sampleCompleted;

  // 推送到下单管理需要：样衣开发完成 + 有工序数据 + 未推送
  const canPushToOrder = sampleCompleted && hasProcessData && !pushedToOrder;
  const pushDisabled = !canPushToOrder;
  const pushToOrderTitle = !sampleCompleted
    ? '请先标记样衣开发完成'
    : !hasProcessData
    ? '请先配置工序'
    : pushedToOrder
    ? '已推送'
    : undefined;
  const saveButtonTitle = unlockDisabled || saveDisabled ? '样衣完成后需先点击维护，才可重新编辑' : undefined;
  const sampleButtonTitle = sampleCompleted ? '样衣已完成，如需重新操作请先点击维护' : undefined;

  const saveButtonText = isNewPage
    ? '创建款式'
    : (editLocked ? '解锁编辑' : '保存信息');

  const handleSaveOrUnlock = () => {
    if (!isNewPage && editLocked) {
      onUnlock();
      return;
    }
    onSave();
  };

  return (
    <Space>
      {/* 保存信息 / 解锁编辑 */}
      <Button
        type="primary"
        loading={saving}
        disabled={unlockDisabled || saveDisabled}
        onClick={handleSaveOrUnlock}
        style={unlockDisabled || saveDisabled ? disabledButtonStyle : primaryButtonStyle}
        size="small"
        title={saveButtonTitle}
      >
        {saveButtonText}
      </Button>

      {/* 样衣开发完成（仅详情页显示） */}
      {!isNewPage && (
        <Button
          type="primary"
          loading={completingSample}
          disabled={sampleCompleted}
          style={sampleButtonStyle}
          onClick={onCompleteSample}
          size="small"
          title={sampleButtonTitle}
        >
          {sampleCompleted ? '开发已完成' : '标记开发完成'}
        </Button>
      )}

      {/* 推送到下单管理（仅详情页显示） */}
      {!isNewPage && (
        <Button
          type="primary"
          loading={pushingToOrder}
          disabled={pushDisabled}
          onClick={onPushToOrder}
          style={pushDisabled ? disabledButtonStyle : primaryButtonStyle}
          size="small"
          title={pushToOrderTitle}
        >
          {pushedToOrder ? '已推送' : '推送到下单管理'}
        </Button>
      )}

    </Space>
  );
};

export default StyleActionButtons;
