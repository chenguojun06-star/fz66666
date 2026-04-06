import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Card, Col, Input, Row, Space, Form, Select, DatePicker, Upload } from 'antd';

import PageStatCards from '@/components/common/PageStatCards';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import SmallModal from '@/components/common/SmallModal';
import RowActions from '@/components/common/RowActions';
import StandardToolbar from '@/components/common/StandardToolbar';
import StickyFilterBar from '@/components/common/StickyFilterBar';
import api from '@/utils/api';
import { StyleInfo, StyleQueryParams } from '@/types/style';
import { StyleAttachmentsButton } from '@/components/StyleAssets';
import { toCategoryCn } from '@/utils/styleCategory';
import { formatDateTime } from '@/utils/datetime';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { useViewport } from '@/utils/useViewport';
import dayjs from 'dayjs';
import { readPageSize } from '@/utils/pageSizeStore';
import { buildProductionSheetHtml } from './buildProductionSheetHtml';

const { TextArea } = Input;

interface DataCenterStats {
  styleCount: number;
  materialCount: number;
  productionCount: number;
}

interface ProductionRequirementsSaveResult {
  id: number;
  styleNo?: string;
  description?: string;
  descriptionLocked?: number;
  descriptionReturnComment?: string | null;
  updateBy?: string;
  updateTime?: string;
}

const normalizeUploadFileList = (event: any) => {
  if (Array.isArray(event)) {
    return event;
  }
  return event?.fileList || [];
};

const AttachmentThumb: React.FC<{ styleId?: string | number; cover?: string | null }> = ({ styleId, cover }) => {
  const [url, setUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState<boolean>(false);

  React.useEffect(() => {
    let mounted = true;
    if (!styleId) {
      setUrl(cover || null);
      return () => { mounted = false; };
    }
    (async () => {
      setLoading(true);
      try {
        const res = await api.get<{ code: number; data: unknown[] }>(`/style/attachment/list?styleId=${styleId}`);
        if (res.code === 200) {
          const images = (res.data || []).filter((f: any) => String(f.fileType || '').includes('image'));
          const first = (images[0] as any)?.fileUrl || null;
          if (mounted) setUrl(first || cover || null);
          return;
        }
        if (mounted) setUrl(cover || null);
      } catch {
    // Intentionally empty
      // 忽略错误
        if (mounted) setUrl(cover || null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [styleId, cover]);

  return (
    <div style={{ width: 56, height: 56, overflow: 'hidden', background: 'var(--color-bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {loading ? (
        <span style={{ color: 'var(--neutral-text-secondary)', fontSize: 'var(--font-size-sm)' }}>...</span>
      ) : url ? (
        <img src={getFullAuthedFileUrl(url)} alt="cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{ color: 'var(--neutral-text-disabled)', fontSize: 'var(--font-size-sm)' }}>无图</span>
      )}
    </div>
  );
};

const DataCenter: React.FC = () => {
  const { message } = App.useApp();
  const { isMobile: _isMobile, modalWidth: _modalWidth } = useViewport();
  const _navigate = useNavigate();
  const _modalInitialHeight = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800;

  const [stats, setStats] = useState<DataCenterStats>({
    styleCount: 0,
    materialCount: 0,
    productionCount: 0
  });

  const [queryParams, setQueryParams] = useState<StyleQueryParams>({
    page: 1,
    pageSize: readPageSize(10),
    onlyCompleted: true,
  });
  const [styles, setStyles] = useState<StyleInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [_viewMode, _setViewMode] = useState<'list' | 'card'>('list');

  // 编辑弹窗状态
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<StyleInfo | null>(null);
  const [editForm] = Form.useForm();
  const [editSaving, setEditSaving] = useState(false);

  // 详情弹窗状态
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [detailRecord, setDetailRecord] = useState<StyleInfo | null>(null);

  // 纸样修改弹窗状态
  const [patternRevisionModalVisible, setPatternRevisionModalVisible] = useState(false);
  const [patternRevisionRecord, setPatternRevisionRecord] = useState<StyleInfo | null>(null);
  const [patternRevisionForm] = Form.useForm();
  const [patternRevisionSaving, setPatternRevisionSaving] = useState(false);

  // 退回生产制单状态
  const [returnDescModalVisible, setReturnDescModalVisible] = useState(false);
  const [returnDescRecord, setReturnDescRecord] = useState<StyleInfo | null>(null);
  const [returnDescSaving, setReturnDescSaving] = useState(false);
  const [returnDescForm] = Form.useForm();

  // 退回纸样修改状态
  const [returnPatternModalVisible, setReturnPatternModalVisible] = useState(false);
  const [returnPatternRecord, setReturnPatternRecord] = useState<StyleInfo | null>(null);
  const [returnPatternSaving, setReturnPatternSaving] = useState(false);
  const [returnPatternForm] = Form.useForm();

  const fetchStats = async () => {
    try {
      const response = await api.get<{ code: number; message: string; data: unknown }>('/data-center/stats');
      if (response.code === 200) {
        const d = response.data || {};
        setStats({
          styleCount: (d as any).styleCount ?? 0,
          materialCount: (d as any).materialCount ?? 0,
          productionCount: (d as any).productionCount ?? 0
        });
      }
      // 静默失败，可能后端API尚未实现，不输出任何错误信息
    } catch (error: unknown) {
      // 静默失败，可能后端API尚未实现（500错误），不输出任何错误信息
    }
  };

  const fetchStyles = async () => {
    setLoading(true);
    try {
      const response = await api.get<{ code: number; message: string; data: { records: any[]; total: number } }>('/style/info/list', { params: queryParams });
      if (response.code === 200) {
        setStyles(response.data.records || []);
        setTotal(response.data.total || 0);
      } else {
        message.error(response.message || '获取款号列表失败');
      }
    } catch (error: any) {
      message.error(error?.message || '获取款号列表失败');
    } finally {
      setLoading(false);
    }
  };

  const downloadFile = (fileName: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadProductionSheet = async (style: StyleInfo) => {
    try {
      const res = await api.get<{ code: number; message: string; data: unknown }>('/data-center/production-sheet', { params: { styleNo: style.styleNo } });
      if (res.code !== 200) {
        message.error(res.message || '获取生产制单失败');
        return;
      }
      const html = buildProductionSheetHtml(res.data);
      downloadFile(`生产制单-${style.styleNo}.html`, html, 'text/html;charset=utf-8');
      message.success('已下载生产制单');
    } catch (e: unknown) {
      message.error((e as any)?.message || '下载失败');
    }
  };

  // 打开编辑弹窗
  const openEditModal = (record: StyleInfo) => {
    setEditingRecord(record);
    editForm.setFieldsValue({
      description: record.description || '',
    });
    setEditModalVisible(true);
  };

  // 保存编辑
  const handleEditSave = async () => {
    if (!editingRecord) return;
    try {
      setEditSaving(true);
      const values = await editForm.validateFields();
      const res = await api.put<{ code: number; message: string; data?: ProductionRequirementsSaveResult }>(`/style/info/${editingRecord.id}/production-requirements`, {
        description: values.description,
      });
      if (res.code === 200 && Number(res.data?.descriptionLocked) === 1) {
        setEditModalVisible(false);
        await fetchStyles();
        message.success('保存成功');
      } else {
        message.error(res.message || '保存后状态未锁定，请刷新后重试');
      }
    } catch (e: unknown) {
      message.error((e as any)?.message || '保存失败');
    } finally {
      setEditSaving(false);
    }
  };

  // 退回生产制单（管理员解锁）
  const handleReturnDescSave = async () => {
    if (!returnDescRecord) return;
    try {
      setReturnDescSaving(true);
      const values = await returnDescForm.validateFields();
      const res = await api.post<{ code: number; message: string }>(
        `/style/info/${returnDescRecord.id}/production-requirements/rollback`,
        { reason: values.reason }
      );
      if (res.code === 200) {
        message.success('已退回，用户可重新编辑生产制单');
        setReturnDescModalVisible(false);
        returnDescForm.resetFields();
        fetchStyles();
      } else {
        message.error(res.message || '退回失败');
      }
    } catch (e: unknown) {
      message.error((e as any)?.message || '退回失败');
    } finally {
      setReturnDescSaving(false);
    }
  };

  // 退回纸样修改（管理员解锁）
  const handleReturnPatternSave = async () => {
    if (!returnPatternRecord) return;
    try {
      setReturnPatternSaving(true);
      const values = await returnPatternForm.validateFields();
      const res = await api.post<{ code: number; message: string }>(
        `/style/info/${returnPatternRecord.id}/pattern-revision/rollback`,
        { reason: values.reason }
      );
      if (res.code === 200) {
        message.success('已退回，用户可重新提交纸样修改');
        setReturnPatternModalVisible(false);
        returnPatternForm.resetFields();
        fetchStyles();
      } else {
        message.error(res.message || '退回失败');
      }
    } catch (e: unknown) {
      message.error((e as any)?.message || '退回失败');
    } finally {
      setReturnPatternSaving(false);
    }
  };

  // 打开详情弹窗
  const openDetailModal = (record: StyleInfo) => {
    setDetailRecord(record);
    setDetailModalVisible(true);
  };

  // 打开纸样修改弹窗
  const openPatternRevisionModal = (record: StyleInfo) => {
    setPatternRevisionRecord(record);
    patternRevisionForm.setFieldsValue({
      styleNo: record.styleNo,
      revisionType: 'MINOR',
      revisionReason: '',
      revisionDate: dayjs(),
    });
    setPatternRevisionModalVisible(true);
  };

  // 保存纸样修改记录
  const handlePatternRevisionSave = async () => {
    if (!patternRevisionRecord) return;
    try {
      setPatternRevisionSaving(true);
      const values = await patternRevisionForm.validateFields();
      const patternFileList = Array.isArray(values.patternFile) ? values.patternFile : [];

      // 1. 如果有上传文件，先上传文件
      if (patternFileList.length > 0) {
        const file = patternFileList[0]?.originFileObj;
        if (file) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('styleId', String(patternRevisionRecord.id));
          formData.append('styleNo', patternRevisionRecord.styleNo);
          formData.append('type', 'pattern');

          const uploadRes = await api.post<{ code: number; message: string }>(
            '/style/attachment/upload-pattern',
            formData,
            {
              headers: { 'Content-Type': 'multipart/form-data' }
            }
          );

          if (uploadRes.code !== 200) {
            message.error(uploadRes.message || '文件上传失败');
            setPatternRevisionSaving(false);
            return;
          }
        }
      }

      // 2. 保存修改记录
      const data = {
        styleId: patternRevisionRecord.id,
        styleNo: values.styleNo,
        revisionType: values.revisionType,
        revisionReason: values.revisionReason,
        revisionContent: values.revisionReason,
        revisionDate: values.revisionDate?.format('YYYY-MM-DD'),
        patternMakerName: values.patternMakerName,
        expectedCompleteDate: values.expectedCompleteDate?.format('YYYY-MM-DD'),
        remark: values.remark,
      };

      const res = await api.post<{ code: number; message: string }>('/pattern-revision', data);
      if (res.code === 200) {
        message.success('纸样修改记录已保存');
        setPatternRevisionModalVisible(false);
        patternRevisionForm.resetFields();
        // 刷新列表以同步数据
        fetchStyles();
      } else {
        message.error(res.message || '保存失败');
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      message.error(err?.message || '保存失败');
    } finally {
      setPatternRevisionSaving(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    fetchStyles();
  }, [queryParams]);

  const columns = useMemo(() => {
    return [
      {
        title: '图片',
        dataIndex: 'cover',
        key: 'cover',
        width: 72,
        render: (_: any, record: StyleInfo) => <AttachmentThumb styleId={(record as any).id} cover={(record as any).cover || null} />
      },
      { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 140 },
      { title: '款名', dataIndex: 'styleName', key: 'styleName', ellipsis: true },
      { title: '品类', dataIndex: 'category', key: 'category', width: 100, render: (v: any) => toCategoryCn(v) },
      {
        title: '推送时间',
        dataIndex: 'productionCompletedTime',
        key: 'productionCompletedTime',
        width: 150,
        render: (v: any) => v ? formatDateTime(v) : '-'
      },
      {
        title: '推送人',
        dataIndex: 'productionAssignee',
        key: 'productionAssignee',
        width: 100,
        render: (v: any) => v || '-'
      },
      {
        title: '纸样',
        key: 'attachments',
        width: 100,
        render: (_: any, record: StyleInfo) => (
          <StyleAttachmentsButton
            styleId={(record as any).id}
            styleNo={(record as any).styleNo}
          />
        )
      },
      {
        title: '维护人',
        dataIndex: 'updateBy',
        key: 'updateBy',
        width: 100,
        render: (v: any) => v || '-'
      },
      {
        title: '维护时间',
        dataIndex: 'updateTime',
        key: 'updateTime',
        width: 150,
        render: (v: any) => v ? formatDateTime(v) : '-'
      },
      {
        title: '操作',
        key: 'action',
        width: 160,
        render: (_: any, record: StyleInfo) => (
          <RowActions
            maxInline={1}
            actions={[
              {
                key: 'view',
                label: '查看',
                title: '查看详情',
                onClick: () => openDetailModal(record),
              },
              record.descriptionLocked === 0
                ? {
                    key: 'edit',
                    label: '编辑',
                    title: '编辑生产制单内容',
                    onClick: () => openEditModal(record),
                  }
                : {
                    key: 'returnDesc',
                    label: '制单更新',
                    title: '退回后可重新编辑生产制单',
                    onClick: () => { setReturnDescRecord(record); setReturnDescModalVisible(true); },
                  },
              record.patternRevLocked === 0
                ? {
                    key: 'patternRevision',
                    label: String(record.patternRevReturnComment || '').trim() ? '继续处理' : '纸样修改',
                    title: String(record.patternRevReturnComment || '').trim() ? '继续处理纸样修改' : '记录纸样修改',
                    onClick: () => openPatternRevisionModal(record),
                  }
                : {
                    key: 'returnPattern',
                    label: '退回纸样',
                    title: '退回后可重新提交纸样修改',
                    onClick: () => { setReturnPatternRecord(record); setReturnPatternModalVisible(true); },
                  },
              {
                key: 'download',
                label: '下载',
                title: '下载生产制单',
                onClick: () => downloadProductionSheet(record),
              },
            ]}
          />
        ),
      }
    ];
  }, [styles]);

  return (
    <Layout>
        <div className="page-header" style={{ marginBottom: 16 }}>
          <h2 className="page-title">资料中心</h2>
        </div>

        <PageStatCards
          cards={[
            {
              key: 'style',
              items: { label: '款号总数', value: stats.styleCount, color: 'var(--color-primary)' },
            },
            {
              key: 'material',
              items: { label: '物料总数', value: stats.materialCount, color: 'var(--color-success)' },
            },
            {
              key: 'production',
              items: { label: '生产订单', value: stats.productionCount, color: 'var(--color-danger)' },
            },
          ]}
        />

        <StickyFilterBar>
        <Card size="small" className="filter-card" style={{ marginBottom: 16 }}>
          <StandardToolbar
            left={(
              <Space wrap>
                <Input
                  placeholder="款号"
                  style={{ width: 180 }}
                  onChange={(e) => setQueryParams(prev => ({ ...prev, styleNo: e.target.value, page: 1 }))}
                />
                <Input
                  placeholder="款名"
                  style={{ width: 220 }}
                  onChange={(e) => setQueryParams(prev => ({ ...prev, styleName: e.target.value, page: 1 }))}
                />
              </Space>
            )}
            right={(
              <Button onClick={() => fetchStyles()} loading={loading}>刷新</Button>
            )}
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

      {/* 通用打印弹窗 */}
      {/* 编辑生产制单弹窗 */}
      <ResizableModal
        open={editModalVisible}
        title={`编辑生产制单 - ${editingRecord?.styleNo || ''}`}
        onCancel={() => {
          setEditModalVisible(false);
          setEditingRecord(null);
          editForm.resetFields();
        }}
        footer={
          <Space>
            <Button onClick={() => {
              setEditModalVisible(false);
              setEditingRecord(null);
              editForm.resetFields();
            }}>取消</Button>
            <Button type="primary" loading={editSaving} onClick={handleEditSave}>保存</Button>
          </Space>
        }
        width="40vw"
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            name="description"
            label="生产要求"
            rules={[{ required: false }]}
          >
            <Input.TextArea
              autoSize={{ minRows: 3 }}
              placeholder="请输入生产要求，每行填写一条内容"
            />
          </Form.Item>
        </Form>
      </ResizableModal>

      {/* 退回生产制单弹窗 */}
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
          <Form.Item
            name="reason"
            label="退回原因"
            rules={[{ required: true, message: '请填写退回原因' }]}
          >
            <Input.TextArea rows={4} placeholder="请说明退回原因，将记录到操作日志" />
          </Form.Item>
        </Form>
      </SmallModal>

      {/* 退回纸样修改弹窗 */}
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
          <Form.Item
            name="reason"
            label="退回原因"
            rules={[{ required: true, message: '请填写退回原因' }]}
          >
            <Input.TextArea rows={4} placeholder="请说明退回原因，将记录到操作日志" />
          </Form.Item>
        </Form>
      </SmallModal>

      {/* 纸样修改弹窗 */}
      <ResizableModal
        open={patternRevisionModalVisible}
        title={`纸样修改记录 - ${patternRevisionRecord?.styleNo || ''}`}
        width="40vw"
        onCancel={() => {
          setPatternRevisionModalVisible(false);
          setPatternRevisionRecord(null);
          patternRevisionForm.resetFields();
        }}
        footer={
          <Space>
            <Button onClick={() => {
              setPatternRevisionModalVisible(false);
              setPatternRevisionRecord(null);
              patternRevisionForm.resetFields();
            }}>取消</Button>
            <Button type="primary" loading={patternRevisionSaving} onClick={handlePatternRevisionSave}>保存</Button>
          </Space>
        }
      >
        <Form form={patternRevisionForm} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <Form.Item name="styleNo" label="款号">
              <Input disabled />
            </Form.Item>

            <Form.Item
              name="revisionType"
              label="修改类型"
              rules={[{ required: true, message: '请选择修改类型' }]}
            >
              <Select>
                <Select.Option value="MINOR">小改</Select.Option>
                <Select.Option value="MAJOR">大改</Select.Option>
                <Select.Option value="URGENT">紧急修改</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item name="revisionDate" label="修改日期">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item name="patternMakerName" label="纸样师傅">
              <Input placeholder="请输入" />
            </Form.Item>
          </div>

          <Form.Item
            name="revisionReason"
            label="修改原因"
            rules={[{ required: true, message: '请填写修改原因' }]}
          >
            <TextArea rows={3} placeholder="请说明需要修改的原因" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <Form.Item name="expectedCompleteDate" label="预计完成日期">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item name="remark" label="备注" style={{ gridColumn: 'span 3' }}>
              <Input placeholder="其他说明" />
            </Form.Item>
          </div>

          <Form.Item name="patternFile" label="纸样文件" valuePropName="fileList" getValueFromEvent={normalizeUploadFileList}>
            <Upload
              beforeUpload={() => false}
              maxCount={1}
              accept=".pdf,.dwg,.dxf,.ai,.cdr,.zip,.rar,.plt,.pat,.ets,.hpg,.prj,.jpg,.jpeg,.png,.bmp,.gif,.svg"
            >
              <Button>选择文件上传</Button>
            </Upload>
          </Form.Item>
        </Form>
      </ResizableModal>

      {/* 详情弹窗 */}
      <ResizableModal
        open={detailModalVisible}
        title={`款式详情 - ${detailRecord?.styleNo || ''}`}
        onCancel={() => {
          setDetailModalVisible(false);
          setDetailRecord(null);
        }}
        footer={
          <Space>
            <Button onClick={() => {
              setDetailModalVisible(false);
              setDetailRecord(null);
            }}>关闭</Button>
          </Space>
        }
        width="60vw"
        initialHeight={Math.round(window.innerHeight * 0.82)}
      >
        {detailRecord && (
          <div style={{ padding: '16px' }}>
            <Row gutter={[16, 16]}>
              <Col span={8}>
                <div style={{
                  width: '100%',
                  aspectRatio: '1',
                  overflow: 'hidden',
                  background: 'var(--color-bg-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
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
                  <div style={{
                    background: 'var(--color-bg-container)',
                    padding: 12,
                    maxHeight: 200,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    fontSize: 13
                  }}>
                    {detailRecord.description || '暂无生产要求'}
                  </div>
                </div>
              </Col>
            </Row>
          </div>
        )}
      </ResizableModal>
    </Layout>
  );
};

export default DataCenter;
