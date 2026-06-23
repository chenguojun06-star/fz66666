import React, { useState, useEffect, useCallback } from 'react';
import {
  Drawer, Tabs, Spin, Tag, Progress, Switch, Button, Space, Input, Select,
  Row, Col, Card, Statistic, message, Tooltip, Empty, InputNumber, Form, Badge, Checkbox, Radio, Divider,
} from 'antd';
import {
  SafetyCertificateOutlined, CheckCircleOutlined, CloseCircleOutlined,
  LockOutlined, UnlockOutlined, ReloadOutlined, ToolOutlined,
  ExclamationCircleOutlined, AppstoreOutlined, SearchOutlined, FileTextOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import {
  getNodeStats, getProductionProcessTracking,
  qualityInspect, lockBundle, unlockBundle, repairComplete, batchQualityPass,
} from '@/utils/api/production';
import { remarkApi } from '@/services/system/remarkApi';
import type { OrderRemark } from '@/services/system/remarkApi';
import { formatDateTime } from '@/utils/datetime';

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
              <div key={r.id} style={{ padding: '8px 10px', background: 'var(--color-bg-container)', borderRadius: 6, border: '1px solid var(--color-border-light)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span>
                    <strong style={{ fontSize: 14 }}>{r.authorName || '匿名'}</strong>
                    {r.authorRole && <Tag style={{ marginLeft: 6, fontSize: 14 }}>{r.authorRole}</Tag>}
                  </span>
                  <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>{formatDateTime(r.createTime)}</span>
                </div>
                <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{r.content}</div>
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
  processBreakdown: Record<string, { total: number; completed: number; pending: number }>;
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
  '采购': 'var(--color-info)', '裁剪': 'var(--color-success)', '二次工艺': 'var(--color-accent-purple)',
  '车缝': 'var(--color-warning)', '尾部': '#eb2f96', '入库': 'var(--color-accent-cyan)',
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
  visible, onClose, orderId, orderNo, styleNo: _styleNo,
}) => {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('qc');
  const [nodeStats, setNodeStats] = useState<NodeStatsItem[]>([]);
  const [trackingRecords, setTrackingRecords] = useState<TrackingRecord[]>([]);
  const [qcFilter, setQcFilter] = useState<'all' | 'pending' | 'unqualified' | 'repair_done'>('pending');
  const [searchText, setSearchText] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);

  const [qcRecord, setQcRecord] = useState<TrackingRecord | null>(null);
  const [qcResult, setQcResult] = useState<'qualified' | 'unqualified'>('qualified');
  const [qcForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [remarkPanelOpen, setRemarkPanelOpen] = useState(false);
  const [batchQcMode, setBatchQcMode] = useState<false | 'qualified' | 'unqualified'>(false);
  const [batchQcForm] = Form.useForm();

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
      setQcRecord(null);
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
    try {
      await repairComplete(record.id);
      message.success('返修完成，菲号进入待复检状态');
      loadData();
    } catch (e: any) {
      message.error(e?.message || '操作失败');
    }
  };

  const handleBatchQualityPass = async () => {
    if (selectedIds.size === 0) {
      message.warning('请先勾选要质检的菲号');
      return;
    }
    setBatchLoading(true);
    try {
      const res = await batchQualityPass(Array.from(selectedIds));
      const data = (res as any)?.data;
      message.success(data?.message || '批量质检完成');
      setSelectedIds(new Set());
      setBatchQcMode(false);
      loadData();
    } catch (e: any) {
      message.error(e?.message || '批量质检失败');
    } finally {
      setBatchLoading(false);
    }
  };

  const handleBatchQualityUnqualified = async () => {
    if (selectedIds.size === 0) {
      message.warning('请先勾选要质检的菲号');
      return;
    }
    try {
      const values = await batchQcForm.validateFields();
      const defectQty = values.defectQuantity || 0;
      if (defectQty <= 0) {
        message.error('次品数量必须大于0');
        return;
      }
      setBatchLoading(true);
      const ids = Array.from(selectedIds);
      const results = await Promise.allSettled(
        ids.map(id => qualityInspect({
          trackingId: id,
          defectQuantity: defectQty,
          defectCategory: values.defectCategory,
          defectProblems: values.defectProblems,
          qualityRemark: values.qualityRemark,
          lockBundle: values.lockBundle,
        }))
      );
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed === 0) {
        message.success(`${succeeded} 条菲号全部标记为不合格`);
      } else {
        message.warning(`${succeeded} 条成功，${failed} 条失败`);
      }
      if (values.qualityRemark) {
        try {
          await remarkApi.add({
            targetType: 'order',
            targetNo: orderNo || '',
            authorRole: '工序质检',
            content: `[批量质检不合格] ${ids.length}条菲号: 次品${defectQty}件/条${values.defectProblems?.length ? '(' + values.defectProblems.join('、') + ')' : ''}${values.qualityRemark ? ' — ' + values.qualityRemark : ''}`,
          });
        } catch { /* ignore */ }
      }
      setSelectedIds(new Set());
      setBatchQcMode(false);
      batchQcForm.resetFields();
      loadData();
    } catch (e: any) {
      if (e?.message) message.error(e.message);
    } finally {
      setBatchLoading(false);
    }
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
          <ExclamationCircleOutlined style={{ fontSize: 48, color: 'var(--color-warning)', marginBottom: 16 }} />
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>请先选择一个订单</div>
          <div style={{ color: 'var(--color-text-tertiary)' }}>在进度详情页点击某个订单的「看板」按钮，即可对该订单的菲号进行质检</div>
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
            <Badge count={pendingQc.length} overflowCount={999}>
              <Button type={qcFilter === 'pending' ? 'primary' : 'default'} onClick={() => { setQcFilter('pending'); setSelectedIds(new Set()); }}>
                待质检
              </Button>
            </Badge>
            <Badge count={unqualified.length} overflowCount={999}>
              <Button danger={qcFilter === 'unqualified'} type={qcFilter === 'unqualified' ? 'primary' : 'default'} onClick={() => { setQcFilter('unqualified'); setSelectedIds(new Set()); }}>
                不合格
              </Button>
            </Badge>
            <Badge count={repairDone.length} overflowCount={999}>
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
             
              style={{ width: 200 }}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>
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
              {selectedIds.size > 0 && <span style={{ color: 'var(--color-info)', fontWeight: 500 }}>已选 {selectedIds.size} 条</span>}
            </Space>
            <Space>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={handleBatchQualityPass}
                loading={batchLoading && batchQcMode === false}
                disabled={selectedIds.size === 0}
              >
                批量合格 ({selectedIds.size})
              </Button>
              <Button
                danger
                icon={<CloseCircleOutlined />}
                onClick={() => {
                  setBatchQcMode('unqualified');
                  batchQcForm.setFieldsValue({
                    defectQuantity: undefined,
                    defectCategory: undefined,
                    defectProblems: undefined,
                    qualityRemark: undefined,
                    lockBundle: false,
                  });
                }}
                disabled={selectedIds.size === 0}
              >
                批量不合格 ({selectedIds.size})
              </Button>
            </Space>
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
                  <div key={g.key} style={{ border: '1px solid var(--color-border-light)', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 14px', background: 'var(--color-bg-container)', borderBottom: '1px solid var(--color-border-light)',
                    }}>
                      <Space>
                        <Tag color={STAGE_COLORS[g.stage] || undefined}>{g.stage}</Tag>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{g.name}</span>
                        <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>{g.records.length} 条菲号</span>
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
                              borderBottom: '1px solid var(--color-bg-subtle)',
                              background: isSelected ? '#e6f7ff' : isUnqualified ? '#F6FFED' : isLocked ? 'var(--color-bg-container)' : 'var(--color-bg-base)',
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
                              <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
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
                                  {r.qualityOperatorName && <span style={{ fontSize: 14, color: 'var(--color-text-tertiary)' }}>质检: {r.qualityOperatorName}</span>}
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
                              {isRepairDone && (
                                <Button type="primary" icon={<SafetyCertificateOutlined />} onClick={() => handleQualityInspect(r)}>
                                  复检
                                </Button>
                              )}
                              {isRepairDone && isLocked && (
                                <Tooltip title="复检合格后自动解锁，也可手动解锁验收">
                                  <Button icon={<UnlockOutlined />} onClick={() => handleUnlock(r)}>
                                    手动解锁
                                  </Button>
                                </Tooltip>
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
            style={{ minWidth: 220, flex: '0 0 auto' }}
          >
            <Progress percent={stage.completionRate} strokeColor={STAGE_COLORS[stage.stageName] || 'var(--color-info)'} style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
              <div>总记录: {stage.totalRecords}</div>
              <div style={{ color: 'var(--color-success)' }}>已完成: {stage.scannedRecords}</div>
              <div style={{ color: 'var(--color-danger)' }}>待完成: {stage.pendingRecords}</div>
            </div>
            {stage.processBreakdown && Object.keys(stage.processBreakdown).length > 0 && (
              <div style={{ marginTop: 8, borderTop: '1px solid var(--color-border-light)', paddingTop: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>工序明细</div>
                {Object.entries(stage.processBreakdown).map(([name, detail]) => {
                  const { total, completed, pending } = detail;
                  const isAllDone = completed === total;
                  const hasPending = pending > 0;
                  const tagColor = isAllDone ? 'var(--color-success)' : hasPending ? 'var(--color-danger)' : 'var(--color-warning)';
                  const tagBg = isAllDone ? 'rgba(82, 196, 26, 0.1)' : hasPending ? 'rgba(255, 77, 79, 0.1)' : 'rgba(250, 173, 20, 0.1)';
                  return (
                    <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Tag style={{ backgroundColor: tagBg, borderColor: tagColor, color: tagColor, marginBottom: 0 }}>
                        {name}
                      </Tag>
                      <Space size={4}>
                        {pending > 0 && (
                          <span style={{ color: 'var(--color-danger)', fontSize: 12 }}>
                            <CheckCircleOutlined /> {pending}
                          </span>
                        )}
                        {completed > 0 && (
                          <span style={{ color: 'var(--color-success)', fontSize: 12 }}>
                            {completed}
                          </span>
                        )}
                        <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>/{total}</span>
                      </Space>
                    </div>
                  );
                })}
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
          {orderNo && <Tag color="blue" style={{ fontSize: 14 }}>{orderNo}</Tag>}
        </Space>
      }
      placement="right" size={Math.round(window.innerWidth * 0.8)} open={visible} onClose={onClose}
      styles={{ body: { padding: '16px 20px' } }}
      extra={
        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>刷新</Button>
      }
    >
      <Spin spinning={loading}>
        {qcRecord ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => setQcRecord(null)} style={{ padding: 0 }}>
                返回菲号列表
              </Button>
              <Divider orientation="vertical" />
              <span style={{ fontWeight: 600, fontSize: 15 }}>
                {qcRecord.repairStatus === 'repair_done' ? '复检' : '工序质检'} — 菲号#{qcRecord.bundleNo} {qcRecord.processName}
              </span>
            </div>
            <div style={{ marginBottom: 12, padding: '10px 14px', background: '#f8f9fa', borderRadius: 8 }}>
              <Row gutter={16}>
                <Col span={8}><Statistic title="菲号" value={qcRecord.bundleNo} styles={{ content: { fontSize: 18 } }} /></Col>
                <Col span={8}><Statistic title="总数量" value={qcRecord.quantity} styles={{ content: { fontSize: 18 } }} /></Col>
                <Col span={8}><Statistic title="工序" value={qcRecord.processName} styles={{ content: { fontSize: 15 } }} /></Col>
              </Row>
              <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  {qcRecord.color && <Tag>{qcRecord.color}</Tag>}
                  {qcRecord.size && <Tag>{qcRecord.size}</Tag>}
                  {qcRecord.progressStage && <Tag color={STAGE_COLORS[qcRecord.progressStage]}>{qcRecord.progressStage}</Tag>}
                </div>
                {orderNo && (
                  <Button type="link" icon={<FileTextOutlined />} onClick={() => setRemarkPanelOpen(true)}>
                    查看订单备注
                  </Button>
                )}
              </div>
            </div>
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
                        <CheckCircleOutlined style={{ color: 'var(--color-success)' }} /> 合格
                      </Radio.Button>
                      <Radio.Button value="unqualified" style={qcResult === 'unqualified' ? { color: 'var(--color-danger)', borderColor: 'var(--color-danger)' } : { color: 'var(--color-danger)' }}>
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
                        <Switch checkedChildren={<LockOutlined />} unCheckedChildren={<UnlockOutlined />} />
                        <span style={{ color: 'var(--color-error)', fontWeight: 500 }}>锁定菲号，阻止下游扫码</span>
                      </Space>
                    </Form.Item>
                  </div>
                </>
              )}

              <Form.Item name="qualityRemark" label="备注" extra="备注将同步到订单备注">
                <Input.TextArea rows={2} placeholder="可选，记录质检情况" />
              </Form.Item>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <Button onClick={() => setQcRecord(null)}>取消</Button>
                <Button type="primary" onClick={handleSubmitQuality} loading={submitting}>提交质检结果</Button>
              </div>
            </Form>

            {remarkPanelOpen && orderNo && (
              <div style={{ marginTop: 16, borderTop: '1px solid var(--color-border-light)', paddingTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600 }}><FileTextOutlined style={{ marginRight: 6 }} />订单备注 — {orderNo}</span>
                  <Button type="link" size="small" onClick={() => setRemarkPanelOpen(false)}>收起</Button>
                </div>
                <RemarkTimelineContent targetType="order" targetNo={orderNo} canAddRemark />
              </div>
            )}
          </div>
        ) : batchQcMode === 'unqualified' ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => setBatchQcMode(false)} style={{ padding: 0 }}>
                返回菲号列表
              </Button>
              <Divider orientation="vertical" />
              <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-error)' }}>
                <CloseCircleOutlined style={{ marginRight: 4 }} />批量不合格 — 已选 {selectedIds.size} 条菲号
              </span>
            </div>
            <div style={{ marginBottom: 12, padding: '10px 14px', background: '#F6FFED', borderRadius: 8, border: '1px solid #ffccc7' }}>
              <span style={{ color: 'var(--color-error)', fontWeight: 500 }}>
                将对选中的 {selectedIds.size} 条菲号统一标记为不合格，请填写次品信息：
              </span>
            </div>
            <Form form={batchQcForm} layout="vertical">
              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item name="defectQuantity" label="每条次品数量" rules={[{ required: true, message: '请输入' }]}>
                    <InputNumber min={1} style={{ width: '100%' }} placeholder="每条菲号的次品数" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="defectCategory" label="缺陷分类" rules={[{ required: true, message: '请选择' }]}>
                    <Select placeholder="选择分类" options={DEFECT_CATEGORIES} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="defectProblems" label="具体次品问题" rules={[{ required: true, message: '请选择' }]}>
                    <Select
                      mode="multiple"
                      placeholder="选择次品问题"
                      options={Object.values(STAGE_DEFECT_PROBLEMS).flat()}
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
                    <Switch checkedChildren={<LockOutlined />} unCheckedChildren={<UnlockOutlined />} />
                    <span style={{ color: 'var(--color-error)', fontWeight: 500 }}>锁定菲号，阻止下游扫码</span>
                  </Space>
                </Form.Item>
              </div>
              <Form.Item name="qualityRemark" label="备注" extra="备注将同步到订单备注">
                <Input.TextArea rows={2} placeholder="可选，记录质检情况" />
              </Form.Item>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <Button onClick={() => setBatchQcMode(false)}>取消</Button>
                <Button danger type="primary" onClick={handleBatchQualityUnqualified} loading={batchLoading}>
                  确认批量不合格 ({selectedIds.size})
                </Button>
              </div>
            </Form>
          </div>
        ) : remarkPanelOpen && orderNo ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => setRemarkPanelOpen(false)} style={{ padding: 0 }}>
                返回菲号列表
              </Button>
              <Divider orientation="vertical" />
              <span style={{ fontWeight: 600, fontSize: 15 }}><FileTextOutlined style={{ marginRight: 6 }} />订单备注 — {orderNo}</span>
            </div>
            <RemarkTimelineContent targetType="order" targetNo={orderNo} canAddRemark />
          </div>
        ) : (
          <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
            {
              key: 'qc',
              label: <Space><SafetyCertificateOutlined />菲号质检{pendingQc.length > 0 && <Badge count={pendingQc.length} />}</Space>,
              children: renderQcTab(),
            },
            {
              key: 'kanban',
              label: <Space><AppstoreOutlined />工序看板</Space>,
              children: renderKanban(),
            },
          ]} />
        )}
      </Spin>
    </Drawer>
  );
};

export default ProcessKanbanDrawer;
