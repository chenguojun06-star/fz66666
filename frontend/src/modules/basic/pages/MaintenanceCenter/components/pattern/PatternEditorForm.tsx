import React from 'react';
import { Button, DatePicker, Form, Input, Select, Upload } from 'antd';
import { unlockNoteStyle, directFieldLabelStyle, directMetaStyle, editorGridStyle, uploadAreaStyle } from './patternPanelStyles';

const { TextArea } = Input;

const normalizeUploadFileList = (event: any) => {
  if (Array.isArray(event)) return event;
  return event?.fileList || [];
};

interface PatternEditorFormProps {
  form: ReturnType<typeof Form.useForm>[0];
}

export const PatternEditorForm: React.FC<PatternEditorFormProps> = ({ form }) => {
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
          <Input placeholder="其他说明" />
        </Form.Item>
      </div>

      <Form.Item name="revisionReason" label="修改原因" rules={[{ required: true, message: '请填写修改原因' }]} style={{ marginTop: 12, marginBottom: 0 }}>
        <TextArea autoSize={{ minRows: 4, maxRows: 6 }} placeholder="请说明需要修改的原因，例如版型收腰、袖笼调整、领口改窄等。" />
      </Form.Item>

      <div style={{ height: 10 }} />

      <div style={uploadAreaStyle}>
        <div style={directFieldLabelStyle}>上传新纸样文件</div>
        <Form.Item name="patternFile" valuePropName="fileList" getValueFromEvent={normalizeUploadFileList} style={{ marginBottom: 0 }}>
          <Upload beforeUpload={() => false} maxCount={1} accept=".pdf,.dwg,.dxf,.ai,.cdr,.zip,.rar,.plt,.pat,.ets,.hpg,.prj,.jpg,.jpeg,.png,.bmp,.gif,.svg">
            <Button>选择纸样文件</Button>
          </Upload>
        </Form.Item>
      </div>
    </Form>
  );
};
