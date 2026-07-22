import React from 'react';
import { Button, Form, Input } from 'antd';
import type { FormInstance } from 'antd';
import TemplateInlineEditor from '../../../TemplateCenter/components/inlineEditor/TemplateInlineEditor';
import type { TemplateLibrary } from '@/types/style';

const { TextArea } = Input;

const directCardStyle = {
  border: '1px solid #ececec',
  borderRadius: 10,
  padding: 12,
  background: 'var(--color-bg-base)',
} as const;

const directStackStyle = { display: 'grid', gap: 10 } as const;

const directTitleStyle = {
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--color-text-primary)',
  lineHeight: 1.2,
} as const;

const directFieldLabelStyle = {
  marginBottom: 4,
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--neutral-text-secondary)',
} as const;

const processingBannerStyle = {
  marginBottom: 10,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #ffd591',
  background: '#FFF7E6',
  display: 'grid',
  gap: 4,
} as const;

const directMetaStyle = {
  fontSize: 14,
  color: 'var(--neutral-text-secondary)',
  lineHeight: 1.4,
} as const;

interface DirectModeViewProps {
  loading: boolean;
  hydratingTemplate: boolean;
  directRow: TemplateLibrary | null;
  isLocked: (row?: TemplateLibrary | null) => boolean;
  isProcessing: (row?: TemplateLibrary | null) => boolean;
  directRollbackForm: FormInstance;
  rollbackLoading: boolean;
  handleDirectRollback: () => Promise<void>;
  handleCancelEdit: () => Promise<void>;
  fetchList: (next?: { page?: number; pageSize?: number }) => Promise<void>;
}

const DirectModeView: React.FC<DirectModeViewProps> = ({
  loading,
  hydratingTemplate,
  directRow,
  isLocked,
  isProcessing,
  directRollbackForm,
  rollbackLoading,
  handleDirectRollback,
  handleCancelEdit,
  fetchList,
}) => {
  if (loading) {
    return <div style={{ textAlign: 'center', padding: 16, color: 'rgba(0,0,0,0.45)' }}>加载中...</div>;
  }
  if (hydratingTemplate) {
    return <div style={{ textAlign: 'center', padding: 16, color: 'rgba(0,0,0,0.45)' }}>正在根据当前款号生成尺寸模板...</div>;
  }
  if (!directRow) {
    return <div style={{ textAlign: 'center', padding: 16, color: 'rgba(0,0,0,0.45)' }}>未找到该款号的数据</div>;
  }
  if (isLocked(directRow)) {
    return (
      <div style={directStackStyle}>
        <div style={directCardStyle}>
          <div style={{ marginBottom: 8 }}>
            <span style={directTitleStyle}>退回后再维护</span>
          </div>
          <Form form={directRollbackForm} layout="vertical">
            <div style={directFieldLabelStyle}>退回原因</div>
            <Form.Item name="reason" rules={[{ required: true, message: '请填写退回原因' }]} style={{ marginBottom: 8 }}>
              <TextArea autoSize={{ minRows: 2 }} placeholder="请说明本次退回原因" />
            </Form.Item>
          </Form>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="default"
              danger
              loading={rollbackLoading}
              onClick={handleDirectRollback}
              style={{ background: 'var(--color-bg-base)', color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
            >
              确认退回
            </Button>
          </div>
        </div>
        <div style={directCardStyle}>
          <TemplateInlineEditor row={directRow} readOnly compact maintenanceMode onSaved={() => fetchList({ page: 1 })} />
        </div>
      </div>
    );
  }
  return (
    <div style={directCardStyle}>
      {isProcessing(directRow) ? (
        <div style={processingBannerStyle}>
          <div style={{ ...directTitleStyle, color: '#d46b08' }}>处理中</div>
          <div style={{ ...directMetaStyle, color: '#ad6800' }}>这份尺寸模板已退回，当前还没有重新保存提交，保存后会自动重新锁定。</div>
        </div>
      ) : null}
      <TemplateInlineEditor
        row={directRow}
        compact
        maintenanceMode
        onCancel={handleCancelEdit}
        onSaved={async () => {
          await fetchList({ page: 1 });
        }}
      />
    </div>
  );
};

export default DirectModeView;
