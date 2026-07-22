import React from 'react';
import { Button, Form, Input } from 'antd';
import { StyleInfo } from '@/types/style';
import ProductionSummary from './ProductionSummary';
import {
  directCardStyle,
  directStackStyle,
  directMetaStyle,
  directFieldLabelStyle,
  processingBannerStyle,
  directTitleStyle,
} from './styles';

const { TextArea } = Input;

interface DirectModeViewProps {
  loading: boolean;
  directRow: StyleInfo | null;
  canManage: boolean;
  directLocked: boolean;
  directProcessing: boolean;
  editForm: any;
  editSaving: boolean;
  cancelLocking: boolean;
  returnDescForm: any;
  returnDescSaving: boolean;
  handleEditSave: () => void;
  handleReturnDescSave: () => void;
  handleCancelEdit: () => void;
}

const DirectModeView: React.FC<DirectModeViewProps> = ({
  loading,
  directRow,
  canManage,
  directLocked,
  directProcessing,
  editForm,
  editSaving,
  cancelLocking,
  returnDescForm,
  returnDescSaving,
  handleEditSave,
  handleReturnDescSave,
  handleCancelEdit,
}) => {
  if (loading && !directRow) return <div style={{ textAlign: 'center', padding: 24, color: 'rgba(0,0,0,0.45)' }}>加载中...</div>;
  if (!directRow && !loading) return <div style={{ textAlign: 'center', padding: 24, color: 'rgba(0,0,0,0.45)' }}>未找到该款号的数据</div>;
  if (!directRow) return <div style={{ textAlign: 'center', padding: 24, color: 'rgba(0,0,0,0.45)' }}>加载中...</div>;
  if (!canManage) {
    return (
      <div style={directCardStyle}>
        <ProductionSummary record={directRow} />
        <div style={directFieldLabelStyle}>生产要求 / 制单描述</div>
        <Input.TextArea value={String((directRow as any).description || '')} autoSize={{ minRows: 10 }} readOnly />
        <div style={{ ...directMetaStyle, marginTop: 10 }}>当前账号仅可查看制单内容，不能直接编辑或退回。</div>
      </div>
    );
  }
  if (directLocked) {
    return (
      <div style={directStackStyle}>
        <div style={directCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={directTitleStyle}>已锁定，退回后直接编辑</span>
            <span style={directMetaStyle}>制单维护</span>
          </div>
          <div style={{ ...directMetaStyle, marginBottom: 8 }}>退回原因填在这里，下面保留当前制单内容预览。</div>
          {(directRow as any).descriptionReturnComment ? (
            <div style={{ ...directMetaStyle, marginBottom: 8 }}>上次退回 {(directRow as any).descriptionReturnComment}（{(directRow as any).descriptionReturnBy || '系统'}）</div>
          ) : null}
          <Form form={returnDescForm} layout="vertical">
            <div style={directFieldLabelStyle}>退回原因</div>
            <Form.Item name="reason" rules={[{ required: true, message: '请填写退回原因' }]} style={{ marginBottom: 8 }}>
              <TextArea autoSize={{ minRows: 2 }} placeholder="请说明制单退回原因" />
            </Form.Item>
          </Form>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button danger type="default" loading={returnDescSaving} onClick={handleReturnDescSave} style={{ background: 'var(--color-bg-base)', color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}>确认退回</Button>
          </div>
        </div>
        <div style={directCardStyle}>
          <ProductionSummary record={directRow} />
          <div style={directFieldLabelStyle}>生产要求 / 制单描述</div>
          <Input.TextArea value={String((directRow as any).description || '')} autoSize={{ minRows: 10 }} readOnly />
        </div>
      </div>
    );
  }
  return (
    <div style={directCardStyle}>
      {directProcessing ? (
        <div style={processingBannerStyle}>
          <div style={{ ...directTitleStyle, color: '#d46b08' }}>处理中</div>
          <div style={{ ...directMetaStyle, color: '#ad6800' }}>制单内容已退回，当前还没有重新保存提交，保存后会结束这次处理。</div>
        </div>
      ) : null}
      <ProductionSummary record={directRow} />
      <Form form={editForm} layout="vertical">
        <div style={directFieldLabelStyle}>生产要求 / 制单描述</div>
        <Form.Item name="description" style={{ marginBottom: 0 }}>
          <TextArea autoSize={{ minRows: 10 }} placeholder={'请输入生产要求和制单描述信息\n示例：\n1. 面料：主面料用32支全棉平纹\n2. 颜色：藏蓝色（潘通色号19-4024）\n3. 缝制要求：1/4″四线包缝'} />
        </Form.Item>
      </Form>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, gap: 8 }}>
        <Button loading={cancelLocking} onClick={handleCancelEdit}>取消修改</Button>
        <Button type="primary" loading={editSaving} onClick={handleEditSave}>保存</Button>
      </div>
    </div>
  );
};

export default DirectModeView;
