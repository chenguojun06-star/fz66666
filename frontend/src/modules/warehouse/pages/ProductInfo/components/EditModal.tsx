import React from 'react';
import { Button } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { StyleInfo } from '@/types/style';
import ProductInfoForm from './ProductInfoForm';

interface EditModalProps {
  open: boolean;
  editingItem: StyleInfo | null;
  form: any;
  coverUrl: string | null;
  setCoverUrl: (v: string | null) => void;
  submitLoading: boolean;
  isMobile: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

/**
 * D-438：列表/新增入口的编辑弹窗——字段全集抽到 ProductInfoForm 共享组件，
 * 与详情抽屉编辑态共用同一份表单定义（详情抽屉的编辑已融合进抽屉本身，不再走这里）。
 */
const EditModal: React.FC<EditModalProps> = ({
  open,
  editingItem,
  form,
  coverUrl,
  setCoverUrl,
  submitLoading,
  isMobile,
  onCancel,
  onSubmit,
}) => {
  return (
    <ResizableModal
      title={editingItem?.id ? '编辑商品资料' : '新增商品资料'}
      open={open}
      onCancel={onCancel}
      width="40vw"
      footer={[
        <Button key="cancel" onClick={onCancel}>取消</Button>,
        <Button key="submit" type="primary" loading={submitLoading} onClick={onSubmit}>
          {editingItem?.id ? '保存' : '创建'}
        </Button>,
      ]}
    >
      <ProductInfoForm
        form={form}
        coverUrl={coverUrl}
        setCoverUrl={setCoverUrl}
        editingItem={editingItem}
        isMobile={isMobile}
      />
    </ResizableModal>
  );
};

export default EditModal;
