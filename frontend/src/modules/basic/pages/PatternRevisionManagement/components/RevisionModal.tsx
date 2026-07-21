import React from 'react';
import { DatePicker, Form, Input, Select } from 'antd';
import type { FormInstance } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { formatDateTime } from '@/utils/datetime';
import type { PatternRevision } from '@/types/patternRevision';
import { REVISION_TYPE_OPTIONS } from '@/types/patternRevision';

const { TextArea } = Input;

export interface RevisionModalProps {
  form: FormInstance;
  modalOpen: boolean;
  modalMode: 'create' | 'edit' | 'view';
  currentRecord: PatternRevision | null;
  saving: boolean;
  onCancel: () => void;
  onOk: () => void;
}

/**
 * 纸样修改记录 - 编辑/查看弹窗
 */
const RevisionModal: React.FC<RevisionModalProps> = ({
  form,
  modalOpen,
  modalMode,
  currentRecord,
  saving,
  onCancel,
  onOk,
}) => {
  return (
    <ResizableModal
      title={
        modalMode === 'create'
          ? '新增修改记录'
          : modalMode === 'edit'
          ? '编辑修改记录'
          : '查看修改记录'
      }
      open={modalOpen}
      onCancel={onCancel}
      onOk={modalMode === 'view' ? undefined : onOk}
      okText="保存"
      cancelText={modalMode === 'view' ? '关闭' : '取消'}
      confirmLoading={saving}
      width="40vw"
    >
      <Form
        form={form}
        layout="vertical"
        disabled={modalMode === 'view'}
      >
        <Form.Item
          name="styleNo"
          label="款号"
          rules={[{ required: true, message: '请输入款号' }]}
        >
          <Input placeholder="请输入款号" />
        </Form.Item>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Form.Item name="revisionNo" label="版本号">
            <Input placeholder="自动生成" />
          </Form.Item>
          <Form.Item
            name="revisionType"
            label="修改类型"
            rules={[{ required: true, message: '请选择修改类型' }]}
          >
            <Select placeholder="请选择">
              {REVISION_TYPE_OPTIONS.map((opt) => (
                <Select.Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="revisionDate" label="修改日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </div>

        <Form.Item
          name="revisionReason"
          label="修改原因"
          rules={[{ required: true, message: '请输入修改原因' }]}
        >
          <TextArea rows={3} placeholder="请描述修改原因" />
        </Form.Item>

        <Form.Item name="revisionContent" label="修改内容">
          <TextArea rows={4} placeholder="请详细描述修改内容" />
        </Form.Item>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item name="patternMakerName" label="纸样师傅">
            <Input placeholder="请输入纸样师傅姓名" />
          </Form.Item>
          <Form.Item name="expectedCompleteDate" label="预计完成日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </div>

        <Form.Item name="remark" label="备注">
          <TextArea rows={2} placeholder="其他备注信息" />
        </Form.Item>

        {/* 查看模式显示额外信息 */}
        {modalMode === 'view' && currentRecord && (
          <>
            {currentRecord.maintainerName && (
              <Form.Item label="维护信息">
                <div>
                  维护人：{currentRecord.maintainerName} |{' '}
                  维护时间：{formatDateTime(currentRecord.maintainTime)}
                </div>
              </Form.Item>
            )}
            {currentRecord.submitterName && (
              <Form.Item label="提交信息">
                <div>
                  提交人：{currentRecord.submitterName} |{' '}
                  提交时间：{formatDateTime(currentRecord.submitTime)}
                </div>
              </Form.Item>
            )}
            {currentRecord.approverName && (
              <Form.Item label="审核信息">
                <div>
                  审核人：{currentRecord.approverName} |{' '}
                  审核时间：{formatDateTime(currentRecord.approvalTime)}
                </div>
                {currentRecord.approvalComment && (
                  <div style={{ marginTop: 8 }}>
                    审核意见：{currentRecord.approvalComment}
                  </div>
                )}
              </Form.Item>
            )}
            {currentRecord.actualCompleteDate && (
              <Form.Item label="实际完成日期">
                <div>{currentRecord.actualCompleteDate}</div>
              </Form.Item>
            )}
          </>
        )}
      </Form>
    </ResizableModal>
  );
};

export default RevisionModal;
