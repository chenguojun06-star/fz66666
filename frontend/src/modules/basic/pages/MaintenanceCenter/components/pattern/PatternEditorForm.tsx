import React, { useRef } from 'react';
import { Button, DatePicker, Form, Input, Select } from 'antd';
import { unlockNoteStyle, directFieldLabelStyle, directMetaStyle, editorGridStyle, uploadAreaStyle } from './patternPanelStyles';

const { TextArea } = Input;

const ACCEPT_PATTERN = '.pdf,.dwg,.dxf,.ai,.cdr,.zip,.rar,.plt,.pat,.ets,.hpg,.prj,.jpg,.jpeg,.png,.bmp,.gif,.svg';

interface PatternEditorFormProps {
  form: ReturnType<typeof Form.useForm>[0];
}

export const PatternEditorForm: React.FC<PatternEditorFormProps> = ({ form }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const unlockRemark = String(form.getFieldValue('unlockRemark') || '').trim();

  return (
    <Form form={form} layout="vertical">
      {unlockRemark ? (
        <div style={unlockNoteStyle}>
          <div style={directFieldLabelStyle}>退回原因</div>
          <div style={directMetaStyle}>{unlockRemark}</div>
        </div>
      ) : null}

      {unlockRemark ? <div style={{ height: 12 }} /> : null}

      <div style={editorGridStyle}>
        <Form.Item name="revisionType" label="修改类型" rules={[{ required: true, message: '请选择修改类型' }]} style={{ marginBottom: 0 }}>
          <Select><Select.Option value="MINOR">小改</Select.Option><Select.Option value="MAJOR">大改</Select.Option><Select.Option value="URGENT">紧急修改</Select.Option></Select>
        </Form.Item>
        <Form.Item name="actualCompleteDate" label="完成时间" style={{ marginBottom: 0 }}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="remark" label="本次备注" style={{ marginBottom: 0 }}>
          <Input.TextArea rows={3} placeholder="其他说明" />
        </Form.Item>
      </div>

      <Form.Item name="revisionReason" label="修改原因" rules={[{ required: true, message: '请填写修改原因' }]} style={{ marginTop: 12, marginBottom: 0 }}>
        <TextArea autoSize={{ minRows: 4 }} placeholder="请说明需要修改的原因，例如版型收腰、袖笼调整、领口改窄等。" />
      </Form.Item>

      <div style={{ height: 10 }} />

      <div style={uploadAreaStyle}>
        <div style={directFieldLabelStyle}>上传新纸样文件</div>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_PATTERN}
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) form.setFieldValue('patternFile', [{ uid: '-1', name: f.name, originFileObj: f }]);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
        />
        <div
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) form.setFieldValue('patternFile', [{ uid: '-1', name: f.name, originFileObj: f }]);
          }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <Button onClick={() => fileInputRef.current?.click()}>选择纸样文件</Button>
          {form.getFieldValue('patternFile')?.[0] && (
            <Button size="small" onClick={() => form.setFieldValue('patternFile', [])}>移除</Button>
          )}
        </div>
      </div>
    </Form>
  );
};
