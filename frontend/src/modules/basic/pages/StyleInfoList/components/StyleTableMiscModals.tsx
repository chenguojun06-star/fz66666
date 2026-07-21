import React from 'react';
import { Form, Input, Modal } from 'antd';
import RemarkTimelineModal from '@/components/common/RemarkTimelineModal';
import StyleCopyModal from './StyleCopyModal';
import type { UseStyleTableViewDataReturn } from './useStyleTableViewData';

type StyleTableMiscModalsProps = Pick<
  UseStyleTableViewDataReturn,
  | 'copyModalOpen'
  | 'setCopyModalOpen'
  | 'copySource'
  | 'remarkTarget'
  | 'setRemarkTarget'
  | 'patternRemarkTarget'
  | 'setPatternRemarkTarget'
  | 'assigningData'
  | 'setAssigningData'
  | 'assignForm'
  | 'handleAssignPattern'
  | 'onRefresh'
>;

/**
 * StyleTableView 的杂项弹窗集合：
 * - 复制款号弹窗
 * - 款号备注记录弹窗
 * - 样衣备注日志弹窗（与小程序「备注日志」tab 数据同源：t_order_remark where targetType=pattern）
 * - 样板生产指派弹窗
 */
const StyleTableMiscModals: React.FC<StyleTableMiscModalsProps> = ({
  copyModalOpen,
  setCopyModalOpen,
  copySource,
  remarkTarget,
  setRemarkTarget,
  patternRemarkTarget,
  setPatternRemarkTarget,
  assigningData,
  setAssigningData,
  assignForm,
  handleAssignPattern,
  onRefresh,
}) => {
  return (
    <>
      <StyleCopyModal
        open={copyModalOpen}
        onCancel={() => setCopyModalOpen(false)}
        copySource={copySource}
        onSuccess={onRefresh}
      />

      {/* 通用备注记录弹窗 */}
      <RemarkTimelineModal
        open={remarkTarget.open}
        onClose={() => setRemarkTarget({ open: false, styleNo: '' })}
        targetType="style"
        targetNo={remarkTarget.styleNo}
        defaultRole={remarkTarget.defaultRole}
      />

      {/* 样衣备注日志弹窗（与小程序「备注日志」tab 数据同源：t_order_remark where targetType=pattern） */}
      <RemarkTimelineModal
        open={patternRemarkTarget.open}
        onClose={() => setPatternRemarkTarget({ open: false, patternId: '' })}
        targetType="pattern"
        targetNo={patternRemarkTarget.patternId}
      />

      {/* 样衣指派弹窗 */}
      <Modal
        title="指派样板生产"
        open={assigningData.open}
        onOk={handleAssignPattern}
        onCancel={() => setAssigningData({ open: false, patternId: '', currentAssignee: '' })}
        okText="确认指派"
        cancelText="取消"
      >
        <Form form={assignForm} layout="vertical">
          <Form.Item
            name="assignee"
            label="指派给"
            rules={[{ required: true, message: '请输入指派人员姓名' }]}
          >
            <Input placeholder="请输入姓名" />
          </Form.Item>
          <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', marginTop: '-8px' }}>
            当前领取人：{assigningData.currentAssignee || '无'}
          </div>
        </Form>
      </Modal>
    </>
  );
};

export default StyleTableMiscModals;
