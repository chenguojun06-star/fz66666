import React, { useMemo } from 'react';
import { App, Button, Card, Form, Input, Space } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import SmallModal from '@/components/common/SmallModal';
import RowActions from '@/components/common/RowActions';
import StandardToolbar from '@/components/common/StandardToolbar';
import { StyleAttachmentsButton } from '@/components/StyleAssets';
import api from '@/utils/api';
import { StyleInfo } from '@/types/style';
import { getErrorMessage } from '../../TemplateCenter/utils/templateUtils';
import { toCategoryCn } from '@/utils/styleCategory';
import { formatDateTime } from '@/utils/datetime';
import { PatternSummary } from './pattern/PatternSummary';
import { PatternEditorForm } from './pattern/PatternEditorForm';
import { AttachmentThumb } from './pattern/AttachmentThumb';
import usePatternPanelActions from './pattern/usePatternPanelActions';
import {
  directCardStyle, directStackStyle, directMetaStyle, directFieldLabelStyle,
  editorSectionTitleStyle, splitGridStyle, actionBarStyle, processingBannerStyle,
  directTitleStyle,
} from './pattern/patternPanelStyles';

const { TextArea } = Input;

interface PatternPanelProps { styleNo?: string; }

const PatternPanel: React.FC<PatternPanelProps> = ({ styleNo }) => {
  const { message } = App.useApp();
  const {
    queryParams, setQueryParams, styleNoInput, setStyleNoInput, styleNameInput, setStyleNameInput,
    styles, total, loading, canManage,
    patternRevisionModalVisible, setPatternRevisionModalVisible, patternRevisionRecord, setPatternRevisionRecord,
    patternRevisionForm, patternRevisionSaving, cancelLocking, setCancelLocking,
    returnPatternModalVisible, setReturnPatternModalVisible, returnPatternRecord, setReturnPatternRecord,
    returnPatternSaving, returnPatternForm,
    directRow, directLocked, directProcessing,
    latestPatternRevision, currentPatternFile, patternVersionCount, patternVersionList,
    nextRevisionNo, patternMetaLoading,
    fetchStyles, openPatternRevisionModal, handlePatternRevisionSave,
    handleReturnPatternSave,
  } = usePatternPanelActions(styleNo);

  const columns = useMemo(() => [
    { title: '图片', dataIndex: 'cover', key: 'cover', width: 72, render: (_: any, record: StyleInfo) => <AttachmentThumb styleId={(record as any).id} cover={(record as any).cover || null} /> },
    { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 140 },
    { title: '款名', dataIndex: 'styleName', key: 'styleName', ellipsis: true },
    { title: '品类', dataIndex: 'category', key: 'category', width: 100, render: (v: any) => toCategoryCn(v) },
    { title: '纸样', key: 'attachments', width: 100, render: (_: any, record: StyleInfo) => <StyleAttachmentsButton styleId={(record as any).id} styleNo={(record as any).styleNo} /> },
    { title: '维护人', dataIndex: 'updateBy', key: 'updateBy', width: 100, render: (v: any) => v || '-' },
    { title: '维护时间', dataIndex: 'updateTime', key: 'updateTime', width: 150, render: (v: any) => v ? formatDateTime(v) : '-' },
    {
      title: '操作', key: 'action', width: 120,
      render: (_: any, record: StyleInfo) => {
        if (!canManage) return '-';
        const locked = Number(record.patternRevLocked) === 1;
        const editable = !!String(record.patternRevReturnComment || '').trim();
        return (
          <RowActions maxInline={1} actions={[
            locked
              ? { key: 'rollback', label: '退回', title: '退回后可重新维护', onClick: () => { setReturnPatternRecord(record); setReturnPatternModalVisible(true); } }
              : { key: 'edit', label: editable ? '继续处理' : '编辑', title: editable ? '继续处理纸样修改' : '编辑纸样修改', onClick: () => openPatternRevisionModal(record) },
          ]} />
        );
      },
    }
  ], [canManage, openPatternRevisionModal, setReturnPatternModalVisible, setReturnPatternRecord]);

  const summaryProps = {
    patternMetaLoading,
    latestPatternRevision,
    currentPatternFile,
    patternVersionCount,
    patternVersionList,
    nextRevisionNo,
  };

  if (styleNo) {
    if (loading && !directRow) return <div style={{ textAlign: 'center', padding: 24, color: 'rgba(0,0,0,0.45)' }}>加载中...</div>;
    if (!directRow && !loading) return <div style={{ textAlign: 'center', padding: 24, color: 'rgba(0,0,0,0.45)' }}>未找到该款号的数据</div>;
    if (!directRow) return <div style={{ textAlign: 'center', padding: 24, color: 'rgba(0,0,0,0.45)' }}>加载中...</div>;
    if (!canManage) {
      return (
        <div style={directStackStyle}>
          <div style={directCardStyle}><PatternSummary record={directRow} readOnly {...summaryProps} /></div>
          <div style={directCardStyle}><div style={directMetaStyle}>当前账号仅可查看纸样资料。</div></div>
        </div>
      );
    }
    if (directLocked) {
      return (
        <div style={directStackStyle}>
          <div style={splitGridStyle}>
            <div style={directCardStyle}>
              <div style={editorSectionTitleStyle}>退回纸样</div>
              <div style={{ ...directMetaStyle, marginTop: 6, marginBottom: 10 }}>填写原因后可解锁并重新维护。</div>
              {directRow.patternRevReturnComment ? (
                <div style={{ ...directMetaStyle, marginBottom: 10 }}>上次退回 {directRow.patternRevReturnComment}（{directRow.patternRevReturnBy || '系统'}）</div>
              ) : null}
              <Form form={returnPatternForm} layout="vertical">
                <div style={directFieldLabelStyle}>退回原因</div>
                <Form.Item name="reason" rules={[{ required: true, message: '请填写退回原因' }]} style={{ marginBottom: 10 }}>
                  <TextArea autoSize={{ minRows: 3, maxRows: 5 }} placeholder="请说明退回原因，将记录到操作日志" />
                </Form.Item>
              </Form>
              <div style={actionBarStyle}>
                <Button danger type="default" loading={returnPatternSaving} onClick={handleReturnPatternSave} style={{ background: '#fff', color: '#ff4d4f', borderColor: '#ff4d4f' }}>确认退回</Button>
              </div>
            </div>
            <div style={directCardStyle}><PatternSummary record={directRow} readOnly {...summaryProps} /></div>
          </div>
        </div>
      );
    }
    return (
      <div style={directStackStyle}>
        {directProcessing ? (
          <div style={processingBannerStyle}>
            <div style={{ ...directTitleStyle, color: '#d46b08' }}>处理中</div>
            <div style={{ ...directMetaStyle, color: '#ad6800' }}>当前记录已解锁，保存后会结束本次处理。</div>
          </div>
        ) : null}
        <div style={directCardStyle}><PatternSummary record={directRow} {...summaryProps} /></div>
        <div style={directCardStyle}>
          <PatternEditorForm form={patternRevisionForm} />
          <div style={{ ...actionBarStyle, marginTop: 12, gap: 8 }}>
            <Button loading={cancelLocking} onClick={async () => {
              if (!directRow?.id) return;
              setCancelLocking(true);
              try {
                await api.post(`/style/info/${directRow.id}/pattern-revision/lock`);
                await fetchStyles();
              } catch (error: unknown) {
                message.error(getErrorMessage(error, '取消修改失败'));
              } finally {
                setCancelLocking(false);
              }
            }}>取消修改</Button>
            <Button type="primary" loading={patternRevisionSaving} onClick={handlePatternRevisionSave}>保存本次修改</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Card className="filter-card" style={{ marginBottom: 16 }}>
        <StandardToolbar
          left={<Space wrap>
            <Input placeholder="款号" style={{ width: 180 }} value={styleNoInput} onChange={(e) => setStyleNoInput(e.target.value)} />
            <Input placeholder="款名" style={{ width: 220 }} value={styleNameInput} onChange={(e) => setStyleNameInput(e.target.value)} />
          </Space>}
          right={<Button onClick={() => fetchStyles()} loading={loading}>刷新</Button>}
        />
      </Card>

      <ResizableTable rowKey={(r) => String((r as any).id ?? r.styleNo)} columns={columns as any} dataSource={styles} loading={loading}
        pagination={{ current: queryParams.page, pageSize: queryParams.pageSize, total, showTotal: (t) => `共 ${t} 条`, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'],
          onChange: (page, pageSize) => setQueryParams(prev => ({ ...prev, page, pageSize })) }} />

      <SmallModal open={returnPatternModalVisible} title={`退回纸样修改 - ${returnPatternRecord?.styleNo || ''}`}
        onCancel={() => { setReturnPatternModalVisible(false); returnPatternForm.resetFields(); }}
        footer={<Space><Button onClick={() => { setReturnPatternModalVisible(false); returnPatternForm.resetFields(); }}>取消</Button><Button danger loading={returnPatternSaving} onClick={handleReturnPatternSave}>确认退回</Button></Space>}>
        {returnPatternRecord?.patternRevReturnComment && (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 4, fontSize: 13 }}>
            上次退回：{returnPatternRecord.patternRevReturnComment}（{returnPatternRecord.patternRevReturnBy}）
          </div>
        )}
        <Form form={returnPatternForm} layout="vertical">
          <Form.Item name="reason" label="退回原因" rules={[{ required: true, message: '请填写退回原因' }]}>
            <TextArea rows={4} placeholder="请说明退回原因，将记录到操作日志" />
          </Form.Item>
        </Form>
      </SmallModal>

      <ResizableModal open={patternRevisionModalVisible} title={`纸样修改记录 - ${patternRevisionRecord?.styleNo || ''}`} width="40vw"
        onCancel={() => { setPatternRevisionModalVisible(false); setPatternRevisionRecord(null); patternRevisionForm.resetFields(); }}
        footer={<Space><Button onClick={() => { setPatternRevisionModalVisible(false); setPatternRevisionRecord(null); patternRevisionForm.resetFields(); }}>取消</Button><Button type="primary" loading={patternRevisionSaving} onClick={handlePatternRevisionSave}>保存</Button></Space>}>
        {patternRevisionRecord ? (
          <div style={directStackStyle}>
            <div style={directCardStyle}><PatternSummary record={patternRevisionRecord} {...summaryProps} /></div>
            <div style={directCardStyle}><PatternEditorForm form={patternRevisionForm} /></div>
          </div>
        ) : null}
      </ResizableModal>
    </>
  );
};

export default PatternPanel;
