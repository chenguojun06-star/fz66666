import React from 'react';
import { Button, Card, Form, Input, Row, Col, Image, Space } from 'antd';
import { StyleInfo, StyleQueryParams } from '@/types/style';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import SmallModal from '@/components/common/SmallModal';
import StandardToolbar from '@/components/common/StandardToolbar';
import PageStatCards from '@/components/common/PageStatCards';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { toCategoryCn } from '@/utils/styleCategory';
import { formatDateTime } from '@/utils/datetime';

const { TextArea } = Input;

interface DataCenterStats {
  styleCount: number;
  materialCount: number;
  productionCount: number;
}

interface TableModeViewProps {
  stats: DataCenterStats;
  queryParams: StyleQueryParams;
  setQueryParams: (updater: (prev: StyleQueryParams) => StyleQueryParams) => void;
  styles: StyleInfo[];
  total: number;
  loading: boolean;
  columns: any[];
  fetchStyles: () => void;
  editModalVisible: boolean;
  setEditModalVisible: (visible: boolean) => void;
  editingRecord: StyleInfo | null;
  editForm: any;
  editSaving: boolean;
  handleEditSave: () => void;
  returnDescVisible: boolean;
  setReturnDescVisible: (visible: boolean) => void;
  returnDescRecord: StyleInfo | null;
  returnDescSaving: boolean;
  returnDescForm: any;
  handleReturnDescSave: () => void;
  detailModalVisible: boolean;
  setDetailModalVisible: (visible: boolean) => void;
  detailRecord: StyleInfo | null;
}

const TableModeView: React.FC<TableModeViewProps> = ({
  stats,
  queryParams,
  setQueryParams,
  styles,
  total,
  loading,
  columns,
  fetchStyles,
  editModalVisible,
  setEditModalVisible,
  editingRecord,
  editForm,
  editSaving,
  handleEditSave,
  returnDescVisible,
  setReturnDescVisible,
  returnDescRecord,
  returnDescSaving,
  returnDescForm,
  handleReturnDescSave,
  detailModalVisible,
  setDetailModalVisible,
  detailRecord,
}) => {
  return (
    <>
      <PageStatCards cards={[
        { key: 'style', items: { label: '款式数量', value: stats.styleCount } },
        { key: 'material', items: { label: '面料数量', value: stats.materialCount } },
        { key: 'production', items: { label: '生产单量', value: stats.productionCount } },
      ]} />

      <Card className="filter-card" style={{ marginBottom: 16 }}>
        <StandardToolbar
          left={<Space wrap>
            <Input placeholder="款号" style={{ width: 180 }} onChange={(e) => setQueryParams(prev => ({ ...prev, styleNo: e.target.value, page: 1 }))} />
            <Input placeholder="款名" style={{ width: 220 }} onChange={(e) => setQueryParams(prev => ({ ...prev, styleName: e.target.value, page: 1 }))} />
          </Space>}
          right={<Button onClick={() => fetchStyles()} loading={loading}>刷新</Button>}
        />
      </Card>

      <ResizableTable rowKey={(r) => String((r as any).id ?? r.styleNo)} columns={columns as any} dataSource={styles} loading={loading} emptyDescription="暂无生产订单"
        pagination={{ current: queryParams.page, pageSize: queryParams.pageSize, total, showTotal: (t) => `共 ${t} 条`, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'],
          onChange: (page, pageSize) => setQueryParams(prev => ({ ...prev, page, pageSize })) }} />

      <ResizableModal open={editModalVisible} title={`编辑制单 - ${editingRecord?.styleNo || ''}`} width="40vw"
        onCancel={() => { setEditModalVisible(false); editForm.resetFields(); }}
        footer={<Space><Button onClick={() => { setEditModalVisible(false); editForm.resetFields(); }}>取消</Button><Button type="primary" loading={editSaving} onClick={handleEditSave}>保存</Button></Space>}>
        <Form form={editForm} layout="vertical">
          <Form.Item name="description" label="生产要求/制单描述">
            <TextArea rows={15} placeholder="请输入生产要求和制单描述信息&#10;示例：&#10;1. 面料：主面料用32支全棉平纹&#10;2. 颜色：藏蓝色（潘通色号19-4024）&#10;3. 缝制要求：1/4″四线包缝" />
          </Form.Item>
        </Form>
      </ResizableModal>

      <SmallModal open={returnDescVisible} title={`退回制单 - ${returnDescRecord?.styleNo || ''}`}
        onCancel={() => { setReturnDescVisible(false); returnDescForm.resetFields(); }}
        footer={<Space><Button onClick={() => { setReturnDescVisible(false); returnDescForm.resetFields(); }}>取消</Button><Button danger loading={returnDescSaving} onClick={handleReturnDescSave}>确认退回</Button></Space>}>
        {returnDescRecord?.descriptionReturnComment && (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: '#FFF7E6', border: '1px solid #ffd591', borderRadius: 4, fontSize: 14 }}>
            上次退回：{returnDescRecord.descriptionReturnComment}（{(returnDescRecord as any).descriptionReturnBy}）
          </div>
        )}
        <Form form={returnDescForm} layout="vertical">
          <Form.Item name="reason" label="退回原因" rules={[{ required: true, message: '请填写退回原因' }]}>
            <TextArea rows={4} placeholder="请说明制单退回原因" />
          </Form.Item>
        </Form>
      </SmallModal>

      <ResizableModal open={detailModalVisible} title={`款式详情 - ${detailRecord?.styleNo || ''}`} width="85vw" initialHeight={Math.round(window.innerHeight * 0.82)}
        onCancel={() => setDetailModalVisible(false)} footer={<Button onClick={() => setDetailModalVisible(false)}>关闭</Button>}>
        {detailRecord && (
          <div>
            <Row gutter={24}>
              <Col span={8}>
                {(detailRecord as any).cover ? (
                  <Image src={getFullAuthedFileUrl((detailRecord as any).cover)} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8 }} />
                ) : (
                  <div style={{ width: '100%', aspectRatio: '1', background: 'var(--color-bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}>暂无封面</div>
                )}
              </Col>
              <Col span={16}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 14 }}>
                  <div><strong>款号：</strong>{detailRecord.styleNo}</div>
                  <div><strong>款名：</strong>{detailRecord.styleName}</div>
                  <div><strong>品类：</strong>{toCategoryCn((detailRecord as any).category)}</div>
                  <div><strong>推送人：</strong>{(detailRecord as any).productionAssignee || '-'}</div>
                  <div><strong>推送时间：</strong>{(detailRecord as any).productionCompletedTime ? formatDateTime((detailRecord as any).productionCompletedTime) : '-'}</div>
                  <div><strong>维护人：</strong>{(detailRecord as any).updateBy || '-'}</div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <strong>生产要求：</strong>
                  <div style={{ whiteSpace: 'pre-wrap', marginTop: 8, padding: '8px 12px', background: 'var(--color-bg-container)', borderRadius: 4, maxHeight: 200, overflowY: 'auto' }}>
                    {(detailRecord as any).description || '暂无'}
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

export default TableModeView;
