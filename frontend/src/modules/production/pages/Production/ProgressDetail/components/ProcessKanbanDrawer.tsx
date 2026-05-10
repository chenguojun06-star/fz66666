import React, { useState, useEffect, useCallback } from 'react';
import {
  Drawer, Tabs, Spin, Tag, Progress, Switch, Button, Space, Input, Select,
  Row, Col, Card, Statistic, message, Tooltip, Empty, Modal, InputNumber, Form, Badge, Checkbox, Radio
} from 'antd';
import {
  SafetyCertificateOutlined, CheckCircleOutlined, CloseCircleOutlined,
  LockOutlined, UnlockOutlined, ReloadOutlined, ToolOutlined,
  ExclamationCircleOutlined, AppstoreOutlined, SearchOutlined, FileTextOutlined,
} from '@ant-design/icons';
import {
  getNodeStats, getProductionProcessTracking,
  qualityInspect, lockBundle, unlockBundle, repairComplete, batchQualityPass,
} from '@/utils/api/production';
import { remarkApi } from '@/services/system/remarkApi';
import type { OrderRemark } from '@/services/system/remarkApi';
import ResizableModal from '@/components/common/ResizableModal';

const RemarkTimelineContent: React.FC<{ targetType: string; targetNo: string; canAddRemark?: boolean }> = ({
  targetType, targetNo, canAddRemark = false,
}) => {
  const [remarks, setRemarks] = useState<OrderRemark[]>([]);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchRemarks = useCallback(async () => {
    if (!targetNo) return;
    setLoading(true);
    try {
      const res: any = await remarkApi.list({ targetType, targetNo });
      const list = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
      setRemarks(list);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [targetType, targetNo]);

  useEffect(() => { if (targetNo) fetchRemarks(); }, [targetNo, fetchRemarks]);

  const handleAdd = async () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await remarkApi.add({ targetType, targetNo, authorRole: '工序质检', content: trimmed });
      setContent('');
      fetchRemarks();
    } catch { /* ignore */ } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 400 }}>
      {canAddRemark && (
        <div style={{ display: 'flex', gap: 8 }}>
          <Input.TextArea value={content} onChange={(e) => setContent(e.target.value)} rows={2} placeholder="添加备注…" style={{ flex: 1 }} />
          <Button type="primary" onClick={handleAdd} loading={submitting} disabled={!content.trim()}>提交</Button>
        </div>
      )}
      <Spin spinning={loading}>
        {remarks.length === 0 && !loading ? (
          <Empty description="暂无备注" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflow: 'auto' }}>
            {remarks.map((r) => (
              <div key={r.id} style={{ padding: '8px 10px', background: '#fafafa', borderRadius: 6, border: '1px solid #f0f0f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span>
                    <strong style={{ fontSize: 13 }}>{r.authorName || '匿名'}</strong>
                    {r.authorRole && <Tag style={{ marginLeft: 6, fontSize: 11 }}>{r.authorRole}</Tag>}
                  </span>
                  <span style={{ color: '#999', fontSize: 11 }}>{r.createTime ? r.createTime.replace('T', ' ').substring(0, 16) : ''}</span>
                </div>
                <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{r.content}</div>
              </div>
            ))}
          </div>
        )}
      </Spin>
    </div>
  );
};

interface ProcessKanbanDrawerProps {
  visible: boolean;
  onClose: () => void;
  orderId?: string;
  orderNo?: string;
  styleNo?: string;
}

interface NodeStatsItem {
  stageName: string;
  totalRecords: number;
  scannedRecords: number;
  pendingRecords: number;
  completionRate: number;
  processBreakdown: Record<string, number>;
}

interface TrackingRecord {
  id: string;
  bundleNo: number;
  color?: string;
  size?: string;
  quantity: number;
  processName: string;
  processCode: string;
  processOrder?: number;
  progressStage?: string;
  scanStatus: 'pending' | 'scanned' | 'reset';
  operatorName?: string;
  scanTime?: string;
  unitPrice?: number;
  settlementAmount?: number;
  isSettled?: boolean;
  scanBlocked?: boolean;
  cuttingBundleId?: string;
  qualityStatus?: string;
  defectQuantity?: number;
  defectCategory?: string;
  defectRemark?: string;
  defectProblems?: string[];
  qualityOperatorName?: string;
  qualityTime?: string;
  repairStatus?: string;
  repairCompletedTime?: string;
}

const STAGE_COLORS: Record<string, string> = {
  '采购': '#1890ff', '裁剪': '#52c41a', '二次工艺': '#722ed1',
  '车缝': '#fa8c16', '尾部': '#eb2f96', '入库': '#13c2c2',
};

const DEFECT_CATEGORIES = [
  { value: 'appearance_integrity', label: '外观完整性问题' },
  { value: 'size_accuracy', label: '尺寸精度问题' },
  { value: 'process_compliance', label: '工艺规范性问题' },
  { value: 'functional_effectiveness', label: '功能有效性问题' },
  { value: 'other', label: '其他问题' },
];

const STAGE_DEFECT_PROBLEMS: Record<string, { value: string; label: string }[]> = {
  '裁剪': [
    { value: '裁剪偏位', label: '裁剪偏位' },
    { value: '裁边不齐', label: '裁边不齐' },
    { value: '尺寸偏差', label: '尺寸偏差' },
    { value: '面料损伤', label: '面料损伤' },
    { value: '层数不齐', label: '层数不齐' },
    { value: '标记错位', label: '标记错位' },
  ],
  '二次工艺': [
    { value: '印花偏位', label: '印花偏位' },
    { value: '绣花跳针', label: '绣花跳针' },
    { value: '颜色差异', label: '颜色差异' },
    { value: '图案脱落', label: '图案脱落' },
    { value: '浆料渗透', label: '浆料渗透' },
    { value: '烫印起泡', label: '烫印起泡' },
  ],
  '车缝': [
    { value: '断线', label: '断线' },
    { value: '跳针', label: '跳针' },
    { value: '浮线', label: '浮线' },
    { value: '缝位偏移', label: '缝位偏移' },
    { value: '起皱', label: '起皱' },
    { value: '针距不匀', label: '针距不匀' },
    { value: '漏缝', label: '漏缝' },
    { value: '对位不准', label: '对位不准' },
  ],
  '尾部': [
    { value: '线头未剪干净', label: '线头未剪干净' },
    { value: '剪破面料', label: '剪破面料' },
    { value: '漏剪', label: '漏剪' },
    { value: '整烫不平', label: '整烫不平' },
    { value: '粘合衬起泡', label: '粘合衬起泡' },
    { value: '扣子松动', label: '扣子松动' },
    { value: '拉链不顺畅', label: '拉链不顺畅' },
    { value: '包装不良', label: '包装不良' },
  ],
  '入库': [
    { value: '外观瑕疵', label: '外观瑕疵' },
    { value: '尺寸不符', label: '尺寸不符' },
    { value: '色差', label: '色差' },
    { value: '工艺不规范', label: '工艺不规范' },
    { value: '标签错误', label: '标签错误' },
    { value: '包装破损', label: '包装破损' },
  ],
  '采购': [
    { value: '面料瑕疵', label: '面料瑕疵' },
    { value: '色差超标', label: '色差超标' },
    { value: '数量短缺', label: '数量短缺' },
    { value: '规格不符', label: '规格不符' },
    { value: '辅料缺失', label: '辅料缺失' },
  ],
};

const PROCESS_DEFECT_PROBLEMS: Record<string, { value: string; label: string }[]> = {
  '剪线': [
    { value: '线头未剪干净', label: '线头未剪干净' },
    { value: '剪破面料', label: '剪破面料' },
    { value: '漏剪', label: '漏剪' },
  ],
  '整烫': [
    { value: '整烫不平', label: '整烫不平' },
    { value: '烫焦烫黄', label: '烫焦烫黄' },
    { value: '极光印', label: '极光印' },
  ],
  '包装': [
    { value: '包装不良', label: '包装不良' },
    { value: '标签错误', label: '标签错误' },
    { value: '包装破损', label: '包装破损' },
  ],
};

function getDefectProblemsForProcess(processName?: string, progressStage?: string) {
  if (processName && PROCESS_DEFECT_PROBLEMS[processName]) {
    return PROCESS_DEFECT_PROBLEMS[processName];
  }
  if (progressStage && STAGE_DEFECT_PROBLEMS[progressStage]) {
    return STAGE_DEFECT_PROBLEMS[progressStage];
  }
  return Object.values(STAGE_DEFECT_PROBLEMS).flat();
}

const ProcessKanbanDrawer: React.FC<ProcessKanbanDrawerProps> = ({
  visible, onClose, orderId, orderNo, styleNo,
}) => {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('qc');
  const [nodeStats, setNodeStats] = useState<NodeStatsItem[]>([]);
  const [trackingRecords, setTrackingRecords] = useState<TrackingRecord[]>([]);
  const [qcFilter, setQcFilter] = useState<'all' | 'pending' | 'unqualified' | 'repair_done'>('pending');
  const [searchText, setSearchText] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);

  const [qcModalVisible, setQcModalVisible] = useState(false);
  const [qcRecord, setQcRecord] = useState<TrackingRecord | null>(null);
  const [qcResult, setQcResult] = useState<'qualified' | 'unqualified'>('qualified');
  const [qcForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [remarkModalOpen, setRemarkModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const [statsRes, trackingRes] = await Promise.all([
        getNodeStats({ orderNo }),
        getProductionProcessTracking(orderId),
      ]);

      setNodeStats(((statsRes as any)?.data || []).map((item: any) => ({
        ...item,
        totalRecords: Number(item.totalRecords),
        scannedRecords: Number(item.scannedRecords),
        pendingRecords: Number(item.pendingRecords),
        completionRate: Number(item.completionRate),
      })));
      setTrackingRecords(((trackingRes as any)?.data || []).map((item: any) => {
        let defectProblems: string[] | undefined;
        if (item.defectProblems) {
          try {
            const parsed = typeof item.defectProblems === 'string' ? JSON.parse(item.defectProblems) : item.defectProblems;
            defectProblems = Array.isArray(parsed) ? parsed : undefined;
          } catch { defectProblems = undefined; }
        }
        return { ...item, defectProblems };
      }));
      setSelectedIds(new Set());
    } catch (e) {
      console.error('工序看板数据加载失败', e);
    } finally {
      setLoading(false);
    }
  }, [orderId, orderNo]);

  useEffect(() => {
    if (visible) loadData();
  }, [visible, loadData]);

  const handleQualityInspect = (record: TrackingRecord) => {
    setQcRecord(record);
    setQcResult('qualified');
    qcForm.setFieldsValue({
      defectQuantity: 0,
      defectCategory: undefined,
      defectProblems: undefined,
      qualityRemark: undefined,
      lockBundle: false,
    });
    setQcModalVisible(true);
  };

  const handleSubmitQuality = async () => {
    if (!qcRecord) return;
    try {
      const values = await qcForm.validateFields();
      const isUnqualified = qcResult === 'unqualified';
      const defectQty = isUnqualified ? (values.defectQuantity || 0) : 0;
      if (isUnqualified && defectQty <= 0) {
        message.error('不合格时次品数量必须大于0');
        return;
      }
      if (defectQty > qcRecord.quantity) {
        message.error('次品数量不能超过菲号总数量');
        return;
      }
      setSubmitting(true);
      await qualityInspect({
        trackingId: qcRecord.id,
        defectQuantity: defectQty,
        defectCategory: values.defectCategory,
        defectProblems: values.defectProblems,
        qualityRemark: values.qualityRemark,
        lockBundle: isUnqualified && values.lockBundle,
      });
      if (isUnqualified && values.qualityRemark) {
        try {
          await remarkApi.add({
            targetType: 'order',
            targetNo: qcRecord.processName ? `${orderNo}` : orderNo || '',
            authorRole: '工序质检',
            content: `[质检不合格] 菲号#${qcRecord.bundleNo} ${qcRecord.processName}: 次品${defectQty}件${values.defectProblems?.length ? '(' + values.defectProblems.join('、') + ')' : ''}${values.qualityRemark ? ' — ' + values.qualityRemark : ''}`,
          });
        } catch { /* ignore */ }
      } else if (!isUnqualified && values.qualityRemark) {
        try {
          await remarkApi.add({
            targetType: 'order',
            targetNo: orderNo || '',
            authorRole: '工序质检',
            content: `[质检合格] 菲号#${qcRecord.bundleNo} ${qcRecord.processName}: ${values.qualityRemark}`,
          });
        } catch { /* ignore */ }
      }
      message.success(isUnqualified
        ? (values.lockBundle ? '质检不合格，已录入次品并锁定菲号' : '质检不合格，已录入次品')
        : '质检合格');
      setQcModalVisible(false);
      loadData();
    } catch (e: any) {
      if (e?.message) message.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLock = async (record: TrackingRecord) => {
    try {
      await lockBundle(record.id);
      message.success('已锁定菲号，下游扫码将被阻止');
      loadData();
    } catch (e: any) {
      message.error(e?.message || '锁定失败');
    }
  };

  const handleUnlock = async (record: TrackingRecord) => {
    try {
      await unlockBundle(record.id);
      message.success('已解锁菲号，可继续扫码验收');
      loadData();
    } catch (e: any) {
      message.error(e?.message || '解锁失败');
    }
  };

  const handleRepairComplete = async (record: TrackingRecord) => {
    Modal.confirm({
      title: '确认返修完成',
      content: `菲号#${record.bundleNo} ${record.processName} 确认返修完成？`,
      onOk: async () => {
        try {
          await repairComplete(record.id);
          message.success('返修完成，菲号进入待复检状态');
          loadData();
        } catch (e: any) {
          message.error(e?.message || '操作失败');
        }
      },
    });
  };

  const handleBatchQualityPass = async () => {
    if (selectedIds.size === 0) {
      message.warning('请先勾选要质检的菲号');
      return;
    }
    Modal.confirm({
      title: `批量质检合格`,
      content: `确认将选中的 ${selectedIds.size} 条菲号全部标记为质检合格？`,
      okText: '确认全部合格',
      okButtonProps: { danger: false },
      onOk: async () => {
        setBatchLoading(true);
        try {
          const res = await batchQualityPass(Array.from(selectedIds));
          const data = (res as any)?.data;
          message.success(data?.message || '批量质检完成');
          setSelectedIds(new Set());
          loadData();
        } catch (e: any) {
          message.error(e?.message || '批量质检失败');
        } finally {
          setBatchLoading(false);
        }
      },
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (ids: string[]) => {
    setSelectedIds(prev => {
      const allSelected = ids.every(id => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        ids.forEach(id => next.delete(id));
      } else {
        ids.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const scannedRecords = trackingRecords.filter(r => r.scanStatus === 'scanned');
  const pendingQc = scannedRecords.filter(r => !r.qualityStatus);
  const unqualified = scannedRecords.filter(r => r.qualityStatus === 'unqualified');
  const repairDone = scannedRecords.filter(r => r.repairStatus === 'repair_done');

  const filteredRecords = (() => {
    let list: TrackingRecord[];
    switch (qcFilter) {
      case 'pending': list = pendingQc; break;
      case 'unqualified': list = unqualified; break;
      case 'repair_done': list = repairDone; break;
      default: list = scannedRecords;
    }
    if (!searchText) return list;
    const kw = searchText.toLowerCase();
    return list.filter(r =>
      String(r.bundleNo).includes(kw) ||
      (r.processName || '').toLowerCase().includes(kw) ||
      (r.color || '').toLowerCase().includes(kw) ||
      (r.size || '').toLowerCase().includes(kw) ||
      (r.operatorName || '').toLowerCase().includes(kw)
    );
  })();

  const selectableIds = filteredRecords
    .filter(r => !r.qualityStatus)
    .map(r => r.id);

  const renderQcTab = () => {
    if (!orderId) {
      return (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <ExclamationCircleOutlined style={{ fontSize: 48, color: '#faad14', marginBottom: 16 }} />
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>请先选择一个订单</div>
          <div style={{ color: '#999' }}>在进度详情页点击某个订单的「看板」按钮，即可对该订单的菲号进行质检</div>
        </div>
      );
    }

    return (
      <div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 12, padding: '12px 16px', background: '#f8f9fa', borderRadius: 8,
        }}>
          <Space size={12}>
            <Badge count={pendingQc.length} overflowCount={999} size="small">
              <Button type={qcFilter === 'pending' ? 'primary' : 'default'} onClick={() => { setQcFilter('pending'); setSelectedIds(new Set()); }}>
                待质检
              </Button>
            </Badge>
            <Badge count={unqualified.length} overflowCount={999} size="small">
              <Button danger={qcFilter === 'unqualified'} type={qcFilter === 'unqualified' ? 'primary' : 'default'} onClick={() => { setQcFilter('unqualified'); setSelectedIds(new Set()); }}>
                不合格
              </Button>
            </Badge>
            <Badge count={repairDone.length} overflowCount={999} size="small">
              <Button type={qcFilter === 'repair_done' ? 'primary' : 'default'} onClick={() => { setQcFilter('repair_done'); setSelectedIds(new Set()); }}>
                待复检
              </Button>
            </Badge>
            <Button type={qcFilter === 'all' ? 'primary' : 'default'} onClick={() => { setQcFilter('all'); setSelectedIds(new Set()); }}>
              全部
            </Button>
          </Space>
          <Space>
            <Input
              placeholder="搜索菲号/工序/颜色/尺码"
              prefix={<SearchOutlined />}
              size="small"
              style={{ width: 200 }}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
            <span style={{ color: '#999', fontSize: 12 }}>
              {scannedRecords.length} 已扫码 | {pendingQc.length} 待质检
            </span>
          </Space>
        </div>

        {qcFilter === 'pending' && pendingQc.length > 0 && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 12, padding: '10px 16px', background: '#e6f7ff', borderRadius: 8,
            border: '1px solid #91d5ff',
          }}>
            <Space>
              <Checkbox
                checked={selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id))}
                indeterminate={selectableIds.some(id => selectedIds.has(id)) && !selectableIds.every(id => selectedIds.has(id))}
                onChange={() => toggleSelectAll(selectableIds)}
              >
                全选
              </Checkbox>
              {selectedIds.size > 0 && <span style={{ color: '#1890ff', fontWeight: 500 }}>已选 {selectedIds.size} 条</span>}
            </Space>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={handleBatchQualityPass}
              loading={batchLoading}
              disabled={selectedIds.size === 0}
            >
              批量合格 ({selectedIds.size})
            </Button>
          </div>
        )}

        {filteredRecords.length === 0 ? (
          <Empty
            description={
              qcFilter === 'pending' ? '没有待质检的菲号' :
              qcFilter === 'unqualified' ? '没有不合格的菲号' :
              qcFilter === 'repair_done' ? '没有待复检的菲号' :
              '没有已扫码的菲号'
            }
          />
        ) : (() => {
          const sorted = [...filteredRecords].sort((a, b) => {
            const ao = a.processOrder ?? 999;
            const bo = b.processOrder ?? 999;
            if (ao !== bo) return ao - bo;
            return (a.bundleNo ?? 0) - (b.bundleNo ?? 0);
          });
          const groups: { key: string; name: string; stage: string; order: number; records: TrackingRecord[] }[] = [];
          const groupMap = new Map<string, typeof groups[0]>();
          for (const r of sorted) {
            const gk = r.processName || '未知';
            let g = groupMap.get(gk);
            if (!g) {
              g = { key: gk, name: gk, stage: r.progressStage || '其他', order: r.processOrder ?? 999, records: [] };
              groupMap.set(gk, g);
              groups.push(g);
            }
            g.records.push(r);
          }
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {groups.map((g) => {
                const selectableInGroup = g.records.filter(r => !r.qualityStatus).map(r => r.id);
                return (
                  <div key={g.key} style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 14px', background: '#fafafa', borderBottom: '1px solid #f0f0f0',
                    }}>
                      <Space>
                        <Tag color={STAGE_COLORS[g.stage] || undefined}>{g.stage}</Tag>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{g.name}</span>
                        <span style={{ color: '#999', fontSize: 12 }}>{g.records.length} 条菲号</span>
                      </Space>
                      {qcFilter === 'pending' && selectableInGroup.length > 0 && (
                        <Checkbox
                          checked={selectableInGroup.every(id => selectedIds.has(id))}
                          indeterminate={selectableInGroup.some(id => selectedIds.has(id)) && !selectableInGroup.every(id => selectedIds.has(id))}
                          onChange={() => toggleSelectAll(selectableInGroup)}
                        >
                          全选此工序
                        </Checkbox>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {g.records.map((r) => {
                        const isPendingQc = !r.qualityStatus;
                        const isUnqualified = r.qualityStatus === 'unqualified';
                        const isRepairDone = r.repairStatus === 'repair_done';
                        const isLocked = !!r.scanBlocked;
                        const isSelected = selectedIds.has(r.id);

                        return (
                          <div
                            key={r.id}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 12,
                              padding: '10px 14px',
                              borderBottom: '1px solid #f5f5f5',
                              background: isSelected ? '#e6f7ff' : isUnqualified ? '#fff2f0' : isLocked ? '#fafafa' : '#fff',
                            }}
                          >
                            {isPendingQc && qcFilter === 'pending' && (
                              <Checkbox checked={isSelected} onChange={() => toggleSelect(r.id)} />
                            )}

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 700, fontSize: 14 }}>#{r.bundleNo}</span>
                                {r.color && <Tag>{r.color}</Tag>}
                                {r.size && <Tag>{r.size}</Tag>}
                              </div>
                              <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                                {r.quantity}件{r.unitPrice ? ` × ¥${r.unitPrice}` : ''}{r.operatorName ? ` | ${r.operatorName}` : ''}
                              </div>
                              {isUnqualified && (
                                <div style={{ marginTop: 3, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  <Tag color="error">次品{r.defectQuantity || 0}件</Tag>
                                  {r.defectCategory && <Tag>{DEFECT_CATEGORIES.find(d => d.value === r.defectCategory)?.label || r.defectCategory}</Tag>}
                                  {r.defectProblems && r.defectProblems.length > 0 && r.defectProblems.map((p, i) => (
                                    <Tag key={i} color="orange">{p}</Tag>
                                  ))}
                                  {r.defectRemark && <Tag color="default">{r.defectRemark}</Tag>}
                                  {r.repairStatus === 'pending' && <Tag color="warning">待返修</Tag>}
                                  {r.repairStatus === 'repairing' && <Tag color="processing">返修中</Tag>}
                                  {r.repairStatus === 'repair_done' && <Tag color="cyan">待复检</Tag>}
                                  {r.qualityOperatorName && <span style={{ fontSize: 11, color: '#999' }}>质检: {r.qualityOperatorName}</span>}
                                </div>
                              )}
                            </div>

                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              {isPendingQc && (
                                <Button type="primary" icon={<SafetyCertificateOutlined />} onClick={() => handleQualityInspect(r)}>
                                  质检
                                </Button>
                              )}
                              {isUnqualified && !isLocked && (
                                <Tooltip title="锁定后下游扫码被阻止">
                                  <Button danger icon={<LockOutlined />} onClick={() => handleLock(r)}>锁定</Button>
                                </Tooltip>
                              )}
                              {isUnqualified && (r.repairStatus === 'pending' || !r.repairStatus) && (
                                <Button icon={<ToolOutlined />} onClick={() => handleRepairComplete(r)}>返修完成</Button>
                              )}
                              {isRepairDone && isLocked && (
                                <Button type="primary" icon={<UnlockOutlined />} onClick={() => handleUnlock(r)}>
                                  解锁验收
                                </Button>
                              )}
                              {isLocked && !isRepairDone && (
                                <Tag icon={<LockOutlined />} color="error">已锁定</Tag>
                              )}
                              {r.qualityStatus === 'qualified' && (
                                <Tag icon={<CheckCircleOutlined />} color="success">合格</Tag>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    );
  };

  const renderKanban = () => {
    if (nodeStats.length === 0) return <Empty description="暂无工序数据" />;
    return (
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12 }}>
        {nodeStats.map((stage) => (
          <Card
            key={stage.stageName}
            title={
              <Space>
                <span style={{ color: STAGE_COLORS[stage.stageName] || '#666', fontWeight: 600 }}>{stage.stageName}</span>
                <Tag color={stage.completionRate >= 100 ? 'success' : stage.completionRate >= 50 ? 'warning' : 'error'}>
                  {stage.completionRate}%
                </Tag>
              </Space>
            }
            style={{ minWidth: 220, flex: '0 0 auto' }} size="small"
          >
            <Progress percent={stage.completionRate} strokeColor={STAGE_COLORS[stage.stageName] || '#1890ff'} size="small" style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 12, color: '#666' }}>
              <div>总记录: {stage.totalRecords}</div>
              <div style={{ color: '#52c41a' }}>已完成: {stage.scannedRecords}</div>
              <div style={{ color: '#ff4d4f' }}>待完成: {stage.pendingRecords}</div>
            </div>
            {stage.processBreakdown && Object.keys(stage.processBreakdown).length > 0 && (
              <div style={{ marginTop: 8, borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
                {Object.entries(stage.processBreakdown).map(([name, count]) => (
                  <Tag key={name} style={{ marginBottom: 4, fontSize: 11 }}>{name}: {count}</Tag>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    );
  };

  return (
    <Drawer
      title={
        <Space>
          <SafetyCertificateOutlined />
          <span>工序质检看板</span>
          {orderNo && <Tag color="blue" style={{ fontSize: 13 }}>{orderNo}</Tag>}
        </Space>
      }
      placement="right" width={960} open={visible} onClose={onClose}
      styles={{ body: { padding: '16px 20px' } }}
      extra={
        <Button size="small" icon={<ReloadOutlined />} onClick={loadData} loading={loading}>刷新</Button>
      }
    >
      <Spin spinning={loading}>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
          {
            key: 'qc',
            label: <Space><SafetyCertificateOutlined />菲号质检{pendingQc.length > 0 && <Badge count={pendingQc.length} size="small" />}</Space>,
            children: renderQcTab(),
          },
          {
            key: 'kanban',
            label: <Space><AppstoreOutlined />工序看板</Space>,
            children: renderKanban(),
          },
        ]} />
      </Spin>

      <ResizableModal
        title={<Space><SafetyCertificateOutlined />工序质检 — 菲号#{qcRecord?.bundleNo} {qcRecord?.processName}</Space>}
        open={qcModalVisible}
        onCancel={() => setQcModalVisible(false)}
        width="40vw"
        initialHeight={Math.round(window.innerHeight * 0.72)}
        footer={[
          <Button key="cancel" onClick={() => setQcModalVisible(false)}>取消</Button>,
          <Button key="submit" type="primary" onClick={handleSubmitQuality} loading={submitting}>提交质检结果</Button>,
        ]}
      >
        {qcRecord && (
          <div style={{ marginBottom: 12, padding: '10px 14px', background: '#f8f9fa', borderRadius: 8 }}>
            <Row gutter={16}>
              <Col span={8}><Statistic title="菲号" value={qcRecord.bundleNo} valueStyle={{ fontSize: 18 }} /></Col>
              <Col span={8}><Statistic title="总数量" value={qcRecord.quantity} valueStyle={{ fontSize: 18 }} /></Col>
              <Col span={8}><Statistic title="工序" value={qcRecord.processName} valueStyle={{ fontSize: 15 }} /></Col>
            </Row>
            <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                {qcRecord.color && <Tag>{qcRecord.color}</Tag>}
                {qcRecord.size && <Tag>{qcRecord.size}</Tag>}
                {qcRecord.progressStage && <Tag color={STAGE_COLORS[qcRecord.progressStage]}>{qcRecord.progressStage}</Tag>}
              </div>
              {orderNo && (
                <Button size="small" type="link" icon={<FileTextOutlined />} onClick={() => setRemarkModalOpen(true)}>
                  查看订单备注
                </Button>
              )}
            </div>
          </div>
        )}
        <Form form={qcForm} layout="vertical">
          <Row gutter={12}>
            <Col span={10}>
              <Form.Item label="质检结果" required>
                <Radio.Group
                  value={qcResult}
                  onChange={(e) => {
                    setQcResult(e.target.value);
                    if (e.target.value === 'qualified') {
                      qcForm.setFieldsValue({ defectQuantity: 0, defectCategory: undefined, defectProblems: undefined, lockBundle: false });
                    } else {
                      qcForm.setFieldsValue({ defectQuantity: undefined });
                    }
                  }}
                >
                  <Radio.Button value="qualified">
                    <CheckCircleOutlined style={{ color: '#52c41a' }} /> 合格
                  </Radio.Button>
                  <Radio.Button value="unqualified" style={qcResult === 'unqualified' ? { color: '#ff4d4f', borderColor: '#ff4d4f' } : { color: '#ff4d4f' }}>
                    <CloseCircleOutlined /> 不合格
                  </Radio.Button>
                </Radio.Group>
              </Form.Item>
            </Col>
            {qcResult === 'unqualified' && (
              <Col span={14}>
                <Form.Item name="defectQuantity" label="次品数量" rules={[{ required: true, message: '请输入' }]}>
                  <InputNumber min={1} max={qcRecord?.quantity || 999} style={{ width: '100%' }} placeholder="次品数量" />
                </Form.Item>
              </Col>
            )}
          </Row>

          {qcResult === 'unqualified' && (
            <>
              <Row gutter={12}>
                <Col span={10}>
                  <Form.Item name="defectCategory" label="缺陷分类" rules={[{ required: true, message: '请选择' }]}>
                    <Select placeholder="选择分类" options={DEFECT_CATEGORIES} />
                  </Form.Item>
                </Col>
                <Col span={14}>
                  <Form.Item name="defectProblems" label="具体次品问题" rules={[{ required: true, message: '请选择' }]}>
                    <Select
                      mode="multiple"
                      placeholder="选择次品问题"
                      options={getDefectProblemsForProcess(qcRecord?.processName, qcRecord?.progressStage)}
                      maxTagCount={3}
                      allowClear
                      showSearch
                      optionFilterProp="label"
                    />
                  </Form.Item>
                </Col>
              </Row>
              <div style={{ padding: '8px 12px', border: '1px solid #ffccc7', borderRadius: 6, marginBottom: 12 }}>
                <Form.Item name="lockBundle" valuePropName="checked" style={{ marginBottom: 0 }}>
                  <Space>
                    <Switch size="small" checkedChildren={<LockOutlined />} unCheckedChildren={<UnlockOutlined />} />
                    <span style={{ color: '#cf1322', fontWeight: 500 }}>锁定菲号，阻止下游扫码</span>
                  </Space>
                </Form.Item>
              </div>
            </>
          )}

          <Form.Item name="qualityRemark" label="备注" extra="备注将同步到订单备注">
            <Input.TextArea rows={2} placeholder="可选，记录质检情况" />
          </Form.Item>
        </Form>
      </ResizableModal>
      {orderNo && (
        <ResizableModal
          title={<Space><FileTextOutlined />订单备注 — {orderNo}</Space>}
          open={remarkModalOpen}
          onCancel={() => setRemarkModalOpen(false)}
          width="40vw"
          footer={null}
          destroyOnHidden
        >
          <RemarkTimelineContent targetType="order" targetNo={orderNo} canAddRemark={false} />
        </ResizableModal>
      )}
    </Drawer>
  );
};

export default ProcessKanbanDrawer;
