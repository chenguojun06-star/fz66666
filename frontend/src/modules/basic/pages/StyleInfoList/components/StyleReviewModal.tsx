import React from 'react';
import { Form, Input, Select } from 'antd';
import SmallModal from '@/components/common/SmallModal';
import MultiImageUploadBox from '@/components/common/MultiImageUploadBox';
import { REVIEW_STATUS_OPTIONS } from './styleTableViewUtils';
import type { UseStyleTableViewDataReturn } from './useStyleTableViewData';

type StyleReviewModalProps = Pick<
  UseStyleTableViewDataReturn,
  'confirm'
>;

/** 样衣审核结论弹窗：审核结论 / 审核意见 / 审核图片 */
const StyleReviewModal: React.FC<StyleReviewModalProps> = ({ confirm }) => {
  return (
    <SmallModal
      open={confirm.reviewModalOpen}
      title="记录样衣审核结论"
      onCancel={() => confirm.setReviewModalOpen(false)}
      onOk={() => void confirm.handleSaveReview()}
      okText="保存结论"
      confirmLoading={confirm.reviewSaving}
      destroyOnHidden={false}
    >
      <Form form={confirm.reviewForm} layout="vertical">
        <Form.Item
          name="reviewStatus"
          label="审核结论"
          rules={[{ required: true, message: '请选择审核结论' }]}
        >
          <Select options={REVIEW_STATUS_OPTIONS} placeholder="请选择审核结论" />
        </Form.Item>
        <Form.Item
          name="reviewComment"
          label="审核意见"
        >
          <Input.TextArea rows={4} placeholder="可填写审核意见或返修要求" />
        </Form.Item>
        <Form.Item name="reviewImages" label="审核图片">
          <MultiImageUploadBox
            maxCount={9}
            value={confirm.reviewImages}
            onChange={(urls) => confirm.setReviewImages(urls)}
          />
        </Form.Item>
      </Form>
    </SmallModal>
  );
};

export default StyleReviewModal;
