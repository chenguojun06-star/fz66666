import React from 'react';
import { Button, Space } from 'antd';
import { ArrowLeftOutlined, SaveOutlined, CheckCircleOutlined, SendOutlined } from '@ant-design/icons';

interface StyleActionButtonsProps {
  // 状态
  saving: boolean;
  completingSample: boolean;
  pushingToOrder: boolean;
  editLocked: boolean;
  isNewPage: boolean;
  sampleCompleted: boolean;
  hasProcessData: boolean;

  // 操作
  onSave: () => void;
  onCompleteSample: () => void;
  onPushToOrder: () => void;
  onUnlock: () => void;
  onBackToList: () => void;
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
  onSave,
  onCompleteSample,
  onPushToOrder,
  onUnlock,
  onBackToList
}) => {
  return (
    <Space>
      {/* 返回列表（仅详情页显示） */}
      {!isNewPage && (
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={onBackToList}
        >
          返回列表
        </Button>
      )}

      {/* 解锁编辑（已保存且锁定时显示） */}
      {editLocked && (
        <Button
          onClick={onUnlock}
        >
          解锁编辑
        </Button>
      )}

      {/* 保存基础信息 */}
      <Button
        type="primary"
        icon={<SaveOutlined />}
        loading={saving}
        onClick={onSave}
      >
        {isNewPage ? '创建款式' : '保存基础信息'}
      </Button>

      {/* 样衣完成（仅详情页显示） */}
      {!isNewPage && (
        <Button
          type="primary"
          icon={<CheckCircleOutlined />}
          loading={completingSample}
          disabled={sampleCompleted}
          style={{ backgroundColor: sampleCompleted ? '#d9d9d9' : '#52c41a', borderColor: sampleCompleted ? '#d9d9d9' : '#52c41a' }}
          onClick={onCompleteSample}
        >
          {sampleCompleted ? '样衣已完成' : '样衣完成'}
        </Button>
      )}

      {/* 推送到下单管理（仅详情页显示） */}
      {!isNewPage && (
        <Button
          type="primary"
          icon={<SendOutlined />}
          loading={pushingToOrder}
          disabled={!hasProcessData}
          onClick={onPushToOrder}
        >
          推送到下单管理
        </Button>
      )}
    </Space>
  );
};

export default StyleActionButtons;
