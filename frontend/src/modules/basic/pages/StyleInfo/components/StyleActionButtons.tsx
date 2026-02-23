import React from 'react';
import { Button, Space } from 'antd';
import { SaveOutlined, CheckCircleOutlined, SendOutlined } from '@ant-design/icons';

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
 * 包含：返回列表、解锁编辑、保存、样衣完成、推送到订单
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
  onUnlock
}) => {
  const primaryButtonStyle: React.CSSProperties = {
    paddingInline: 12,
  };

  const sampleButtonStyle: React.CSSProperties = {
    ...primaryButtonStyle,
    backgroundColor: sampleCompleted ? 'var(--neutral-border)' : 'var(--color-success)',
    borderColor: sampleCompleted ? 'var(--neutral-border)' : 'var(--color-success)',
  };

  // 推送到下单管理需要：样衣完成 + 有工序数据 + 未推送
  const canPushToOrder = sampleCompleted && hasProcessData && !pushedToOrder;
  const pushToOrderTitle = !sampleCompleted
    ? '请先完成样衣制作'
    : !hasProcessData
    ? '请先配置工序'
    : pushedToOrder
    ? '已推送'
    : undefined;

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
        onClick={handleSaveOrUnlock}
        style={primaryButtonStyle}
        size="small"
      >
        {saveButtonText}
      </Button>

      {/* 样衣完成（仅详情页显示） */}
      {!isNewPage && (
        <Button
          type="primary"
          loading={completingSample}
          disabled={sampleCompleted}
          style={sampleButtonStyle}
          onClick={onCompleteSample}
          size="small"
        >
          {sampleCompleted ? '样衣已完成' : '样衣完成'}
        </Button>
      )}

      {/* 推送到下单管理（仅详情页显示） */}
      {!isNewPage && (
        <Button
          type="primary"
          loading={pushingToOrder}
          disabled={!canPushToOrder}
          onClick={onPushToOrder}
          style={primaryButtonStyle}
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
