import React from 'react';
import { Button, Card, Col, Form, Input, Row, Space, Select, DatePicker, Upload } from 'antd';
import PageStatCards from '@/components/common/PageStatCards';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import SmallModal from '@/components/common/SmallModal';
import StandardToolbar from '@/components/common/StandardToolbar';
import StickyFilterBar from '@/components/common/StickyFilterBar';
import { formatDateTime } from '@/utils/datetime';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { toCategoryCn } from '@/utils/styleCategory';
import { useDataCenterActions } from './useDataCenterActions';
import { useDataCenterColumns } from './useDataCenterColumns';
import { normalizeUploadFileList } from './useDataCenterActions';

const { TextArea } = Input;

const DataCenter: React.FC = () => {
  const {
    stats, queryParams, setQueryParams, styleNoInput, setStyleNoInput,
    styles, total, loading, fetchStyles,
    editModalVisible, setEditModalVisible, editingRecord, editForm, editSaving, openEditModal, handleEditSave,
    detailModalVisible, setDetailModalVisible, detailRecord, openDetailModal,
    patternRevisionModalVisible, setPatternRevisionModalVisible, patternRevisionRecord, patternRevisionForm, patternRevisionSaving, openPatternRevisionModal, handlePatternRevisionSave,
    returnDescModalVisible, setReturnDescModalVisible, returnDescRecord, setReturnDescRecord, returnDescForm, returnDescSaving, handleReturnDescSave,
    returnPatternModalVisible, setReturnPatternModalVisible, returnPatternRecord, setReturnPatternRecord, returnPatternForm, returnPatternSaving, handleReturnPatternSave,
    downloadProductionSheet,
  } = useDataCenterActions();

  const columns = useDataCenterColumns({
    openDetailModal,
    openEditModal,
    openPatternRevisionModal,
    downloadProductionSheet,
    setReturnDescRecord,
    setReturnDescModalVisible,
    setReturnPatternRecord,
    setReturnPatternModalVisible,
  });

  return (
    <>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h2 className="page-title">资料中心</h2>
      </div>

      <PageStatCards
        cards={[
          { key: 'style', items: { label: '款号总数', value: stats.styleCount, color: 'var(--color-primary)' } },
          { key: 'material', items: { label: '物料总数', value: stats.materialCount, color: 'var(--color-success)' } },
          { key: 'production', items: { label: '生产订单', value: stats.productionCount, color: 'var(--color-danger)' } },
        ]}
      />

      <StickyFilterBar>
        <Card size="small" className="filter-card" style={{ marginBottom: 16 }}>
          <StandardToolbar
            left={(
              <Space wrap>
                <Input placeholder="款号" style={{ width: 180 }} value={styleNoInput} onChange={(e) => setStyleNoInput(e.target.value)} />
                <Input placeholder="款名" style={{ width: 220 }} onChange={(e) => setQueryParams(prev => ({ ...prev, styleName: e.target.value, page: 1 }))} />
              </Space>
            )}
            right={<Button onClick={() => fetchStyles()} loading={loading}>刷新</Button>}
          />
        </Card>
      </StickyFilterBar>

      <ResizableTable
        rowKey={(r) => String((r as any).id ?? r.styleNo)}
        columns={columns as any}
        dataSource={styles}
        loading={loading}
        pagination={{
          current: queryParams.page,
          pageSize: queryParams.pageSize,
          total,
          showTotal: (total) => `共 ${total} 条`,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          onChange: (page, pageSize) => setQueryParams(prev => ({ ...prev, page, pageSize })),
        }}
      />

      <ResizableModal
        open={editModalVisible}
        title={`编辑生产制单 - ${editingRecord?.styleNo || ''}`}
        onCancel={() => { setEditModalVisible(false); editForm.resetFields(); }}
        footer={
          <Space>
            <Button onClick={() => { setEditModalVisible(false); editForm.resetFields(); }}>取消</Button>
            <Button type="primary" loading={editSaving} onClick={handleEditSave}>保存</Button>
          </Space>
        }
        width="40vw"
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="description" label="生产要求" rules={[{ required: false }]}>
            <Input.TextArea autoSize={{ minRows: 3 }} placeholder="请输入生产要求，每行填写一条内容" />
          </Form.Item>
        </Form>
      </ResizableModal>

      <SmallModal
        open={returnDescModalVisible}
        title={`退回生产制单 - ${returnDescRecord?.styleNo || ''}`}
        onCancel={() => { setReturnDescModalVisible(false); returnDescForm.resetFields(); }}
        footer={
          <Space>
            <Button onClick={() => { setReturnDescModalVisible(false); returnDescForm.resetFields(); }}>取消</Button>
            <Button danger loading={returnDescSaving} onClick={handleReturnDescSave}>确认退回</Button>
          </Space>
        }
      >
        {returnDescRecord?.descriptionReturnComment && (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 4, fontSize: 13 }}>
            上次退回：{returnDescRecord.descriptionReturnComment}（{returnDescRecord.descriptionReturnBy}）
          </div>
        )}
        <Form form={returnDescForm} layout="vertical">
          <Form.Item name="reason" label="退回原因" rules={[{ required: true, message: '请填写退回原因' }]}>
            <Input.TextArea rows={4} placeholder="请说明退回原因，将记录到操作日志" />
          </Form.Item>
        </Form>
      </SmallModal>

      <SmallModal
        open={returnPatternModalVisible}
        title={`退回纸样修改 - ${returnPatternRecord?.styleNo || ''}`}
        onCancel={() => { setReturnPatternModalVisible(false); returnPatternForm.resetFields(); }}
        footer={
          <Space>
            <Button onClick={() => { setReturnPatternModalVisible(false); returnPatternForm.resetFields(); }}>取消</Button>
            <Button danger loading={returnPatternSaving} onClick={handleReturnPatternSave}>确认退回</Button>
          </Space>
        }
      >
        {returnPatternRecord?.patternRevReturnComment && (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 4, fontSize: 13 }}>
            上次退回：{returnPatternRecord.patternRevReturnComment}（{returnPatternRecord.patternRevReturnBy}）
          </div>
        )}
        <Form form={returnPatternForm} layout="vertical">
          <Form.Item name="reason" label="退回原因" rules={[{ required: true, message: '请填写退回原因' }]}>
            <Input.TextArea rows={4} placeholder="请说明退回原因，将记录到操作日志" />
          </Form.Item>
        </Form>
      </SmallModal>

      <ResizableModal
        open={patternRevisionModalVisible}
        title={`纸样修改记录 - ${patternRevisionRecord?.styleNo || ''}`}
        width="40vw"
        onCancel={() => { setPatternRevisionModalVisible(false); patternRevisionForm.resetFields(); }}
        footer={
          <Space>
            <Button onClick={() => { setPatternRevisionModalVisible(false); patternRevisionForm.resetFields(); }}>取消</Button>
            <Button type="primary" loading={patternRevisionSaving} onClick={handlePatternRevisionSave}>保存</Button>
          </Space>
        }
      >
        <Form form={patternRevisionForm} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <Form.Item name="styleNo" label="款号"><Input disabled /></Form.Item>
            <Form.Item name="revisionType" label="修改类型" rules={[{ required: true, message: '请选择修改类型' }]}>
              <Select>
                <Select.Option value="MINOR">小改</Select.Option>
                <Select.Option value="MAJOR">大改</Select.Option>
                <Select.Option value="URGENT">紧急修改</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item name="revisionDate" label="修改日期"><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="patternMakerName" label="纸样师傅"><Input placeholder="请输入" /></Form.Item>
          </div>
          <Form.Item name="revisionReason" label="修改原因" rules={[{ required: true, message: '请填写修改原因' }]}>
            <TextArea rows={3} placeholder="请说明需要修改的原因" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <Form.Item name="expectedCompleteDate" label="预计完成日期"><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="remark" label="备注" style={{ gridColumn: 'span 3' }}><Input placeholder="其他说明" /></Form.Item>
          </div>
          <Form.Item name="patternFile" label="纸样文件" valuePropName="fileList" getValueFromEvent={normalizeUploadFileList}>
            <Upload beforeUpload={() => false} maxCount={1} accept=".pdf,.dwg,.dxf,.ai,.cdr,.zip,.rar,.plt,.pat,.ets,.hpg,.prj,.jpg,.jpeg,.png,.bmp,.gif,.svg">
              <Button>选择文件上传</Button>
            </Upload>
          </Form.Item>
        </Form>
      </ResizableModal>

      <ResizableModal
        open={detailModalVisible}
        title={`款式详情 - ${detailRecord?.styleNo || ''}`}
        onCancel={() => { setDetailModalVisible(false); }}
        footer={<Space><Button onClick={() => { setDetailModalVisible(false); }}>关闭</Button></Space>}
        width="60vw"
        initialHeight={Math.round(window.innerHeight * 0.82)}
      >
        {detailRecord && (
          <div style={{ padding: '16px' }}>
            <Row gutter={[16, 16]}>
              <Col span={8}>
                <div style={{ width: '100%', aspectRatio: '1', overflow: 'hidden', background: 'var(--color-bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {detailRecord.cover ? (
                    <img src={getFullAuthedFileUrl(detailRecord.cover)} alt="封面" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ color: 'var(--neutral-text-secondary)' }}>暂无封面</span>
                  )}
                </div>
              </Col>
              <Col span={16}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div><span style={{ color: 'var(--neutral-text-secondary)' }}>款号：</span>{detailRecord.styleNo}</div>
                  <div><span style={{ color: 'var(--neutral-text-secondary)' }}>款名：</span>{detailRecord.styleName}</div>
                  <div><span style={{ color: 'var(--neutral-text-secondary)' }}>品类：</span>{toCategoryCn(detailRecord.category)}</div>
                  <div><span style={{ color: 'var(--neutral-text-secondary)' }}>颜色：</span>{detailRecord.color || '-'}</div>
                  <div><span style={{ color: 'var(--neutral-text-secondary)' }}>推送人：</span>{(detailRecord as any).productionAssignee || '-'}</div>
                  <div><span style={{ color: 'var(--neutral-text-secondary)' }}>推送时间：</span>{(detailRecord as any).productionCompletedTime ? formatDateTime((detailRecord as any).productionCompletedTime) : '-'}</div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>生产要求：</div>
                  <div style={{ background: 'var(--color-bg-container)', padding: 12, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: 13 }}>
                    {detailRecord.description || '暂无生产要求'}
                  </div>
                </div>
              </Col>
            </Row>
          </div>
        )}
      </ResizableModal>
    </>
  );
};

export default DataCenter;
