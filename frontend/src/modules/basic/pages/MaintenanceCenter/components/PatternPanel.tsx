import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Card, DatePicker, Form, Input, Select, Space, Upload } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import SmallModal from '@/components/common/SmallModal';
import RowActions from '@/components/common/RowActions';
import StandardToolbar from '@/components/common/StandardToolbar';
import { StyleAttachmentsButton } from '@/components/StyleAssets';
import api from '@/utils/api';
import { StyleAttachment, StyleInfo, StyleQueryParams } from '@/types/style';
import { getErrorMessage } from '../../TemplateCenter/utils/templateUtils';
import type { PatternRevision } from '@/types/patternRevision';
import { toCategoryCn } from '@/utils/styleCategory';
import { formatDateTime } from '@/utils/datetime';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { useDebouncedValue } from '@/hooks/usePerformance';
import { isAdminUser as isAdminUserFn, useAuth } from '@/utils/AuthContext';
import dayjs from 'dayjs';
import { readPageSize } from '@/utils/pageSizeStore';

const { TextArea } = Input;

const directCardStyle = {
  border: '1px solid #ececec',
  borderRadius: 12,
  padding: 16,
  background: '#fff',
} as const;

const directStackStyle = { display: 'grid', gap: 12 } as const;

const directTitleStyle = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--color-text-primary)',
  lineHeight: 1.2,
} as const;

const directMetaStyle = {
  fontSize: 12,
  color: 'var(--neutral-text-secondary)',
  lineHeight: 1.4,
} as const;

const directValueStyle = {
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--color-text-primary)',
  lineHeight: 1.35,
} as const;

const directFieldLabelStyle = {
  marginBottom: 4,
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--neutral-text-secondary)',
} as const;

const summaryGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: 10,
  marginTop: 10,
} as const;

const summaryCardStyle = {
  border: '1px solid #f0f0f0',
  borderRadius: 10,
  padding: '10px 12px',
  background: '#fafafa',
  display: 'grid',
  gap: 4,
} as const;

const metaCardStyle = {
  marginTop: 10,
  padding: '12px 14px',
  border: '1px solid #e8edf4',
  borderRadius: 10,
  background: 'linear-gradient(180deg, #fbfcfe 0%, #f6f8fb 100%)',
  display: 'grid',
  gap: 8,
} as const;

const heroStyle = {
  display: 'grid',
  gridTemplateColumns: '84px minmax(0, 1fr) auto',
  gap: 14,
  alignItems: 'start',
} as const;

const heroThumbStyle = {
  width: 84,
  height: 84,
  overflow: 'hidden',
  borderRadius: 12,
  border: '1px solid #f0f0f0',
  background: '#fafafa',
} as const;

const heroHeadlineStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
} as const;

const statusPillBaseStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 68,
  padding: '2px 10px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.5,
} as const;

const editorSectionTitleStyle = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--color-text-primary)',
  lineHeight: 1.3,
} as const;

const editorGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 10,
} as const;

const unlockNoteStyle = {
  padding: '8px 12px',
  borderRadius: 10,
  border: '1px dashed #d7dde7',
  background: '#fff',
  display: 'grid',
  gap: 2,
} as const;

const uploadAreaStyle = {
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px dashed #cfd8e3',
  background: '#fff',
  display: 'grid',
  gap: 10,
} as const;

const splitGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: 12,
} as const;

const actionBarStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  marginTop: 4,
} as const;

const processingBannerStyle = {
  marginBottom: 0,
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #ffd591',
  background: '#fff7e6',
  display: 'grid',
  gap: 4,
} as const;

const toPatternStatusLabel = (value?: string | null) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) {
    return '未记录';
  }
  if (normalized === 'COMPLETED') {
    return '已完成';
  }
  if (normalized === 'IN_PROGRESS') {
    return '进行中';
  }
  if (normalized === 'PENDING') {
    return '未开始';
  }
  if (normalized === 'NOT_STARTED') {
    return '未开始';
  }
  if (normalized === 'RETURNED') {
    return '已退回';
  }
  if (normalized === 'LOCKED') {
    return '已锁定';
  }
  if (normalized === 'UNLOCKED') {
    return '未锁定';
  }
  return String(value);
};

type PatternAttachment = StyleAttachment & {
  versionRemark?: string | null;
};

type PatternCheckResult = {
  complete?: boolean;
  missingItems?: string[];
  patternFile?: PatternAttachment | null;
  gradingFile?: PatternAttachment | null;
};

const normalizeUploadFileList = (event: any) => {
  if (Array.isArray(event)) {
    return event;
  }
  return event?.fileList || [];
};

const AttachmentThumb: React.FC<{ styleId?: string | number; cover?: string | null }> = ({ styleId, cover }) => {
  const [url, setUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    if (!styleId) { setUrl(cover || null); return () => { mounted = false; }; }
    (async () => {
      setLoading(true);
      try {
        const res = await api.get<{ code: number; data: unknown[] }>(`/style/attachment/list?styleId=${styleId}`);
        if (res.code === 200) {
          const images = (res.data || []).filter((f: any) => String(f.fileType || '').includes('image'));
          if (mounted) setUrl((images[0] as any)?.fileUrl || cover || null);
          return;
        }
        if (mounted) setUrl(cover || null);
      } catch {
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

interface PatternPanelProps { styleNo?: string; }

const PatternPanel: React.FC<PatternPanelProps> = ({ styleNo }) => {
  const { message } = App.useApp();
  const { user } = useAuth();

  const [queryParams, setQueryParams] = useState<StyleQueryParams>({ page: 1, pageSize: readPageSize(10), onlyCompleted: true, ...(styleNo ? { styleNoExact: styleNo } : {}) });
  const [styleNoInput, setStyleNoInput] = useState('');
  const [styleNameInput, setStyleNameInput] = useState('');
  const debouncedStyleNo = useDebouncedValue(styleNoInput, 300);
  const debouncedStyleName = useDebouncedValue(styleNameInput, 300);
  useEffect(() => {
    const noChanged = debouncedStyleNo !== (queryParams.styleNo || '');
    const nameChanged = debouncedStyleName !== (queryParams.styleName || '');
    if (noChanged || nameChanged) {
      setQueryParams(prev => ({ ...prev, styleNo: debouncedStyleNo, styleName: debouncedStyleName, page: 1 }));
    }
  }, [debouncedStyleNo, debouncedStyleName]);
  const [styles, setStyles] = useState<StyleInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [patternRevisionModalVisible, setPatternRevisionModalVisible] = useState(false);
  const [patternRevisionRecord, setPatternRevisionRecord] = useState<StyleInfo | null>(null);
  const [patternRevisionForm] = Form.useForm();
  const [patternRevisionSaving, setPatternRevisionSaving] = useState(false);
  const [cancelLocking, setCancelLocking] = useState(false);

  const [returnPatternModalVisible, setReturnPatternModalVisible] = useState(false);
  const [returnPatternRecord, setReturnPatternRecord] = useState<StyleInfo | null>(null);
  const [returnPatternSaving, setReturnPatternSaving] = useState(false);
  const [returnPatternForm] = Form.useForm();

  const isAdminUser = useMemo(() => isAdminUserFn(user), [user]);
  const isFactoryUser = useMemo(() => !!user?.factoryId, [user]);
  const canManage = isAdminUser || isFactoryUser;
  const directRow = styleNo ? (styles.find(s => s.styleNo === styleNo) ?? null) : null;
  const directLocked = Number(directRow?.patternRevLocked) === 1;
  const directHasUnlockRemark = !!String(directRow?.patternRevReturnComment || '').trim();
  const directProcessing = !directLocked && directHasUnlockRemark;
  const activePatternRecord = styleNo ? directRow : patternRevisionRecord;
  const currentOperatorName = useMemo(() => {
    const displayName = String((user as any)?.name || (user as any)?.username || '').trim();
    return displayName || '当前操作人';
  }, [user]);

  const [latestPatternRevision, setLatestPatternRevision] = useState<PatternRevision | null>(null);
  const [currentPatternFile, setCurrentPatternFile] = useState<PatternAttachment | null>(null);
  const [patternVersionCount, setPatternVersionCount] = useState(0);
  const [patternVersionList, setPatternVersionList] = useState<PatternAttachment[]>([]);
  const [nextRevisionNo, setNextRevisionNo] = useState('');
  const [patternMetaLoading, setPatternMetaLoading] = useState(false);

  const resetPatternMeta = () => {
    setLatestPatternRevision(null);
    setCurrentPatternFile(null);
    setPatternVersionCount(0);
    setPatternVersionList([]);
    setNextRevisionNo('');
    setPatternMetaLoading(false);
  };

  const buildUnlockTime = (record?: StyleInfo | null) => {
    if (record?.patternRevReturnTime) {
      return dayjs(record.patternRevReturnTime);
    }
    return null;
  };

  const buildPatternInitialValues = (record: StyleInfo) => ({
    styleNo: record.styleNo,
    revisionNo: nextRevisionNo || undefined,
    revisionType: 'MINOR',
    revisionReason: '',
    unlockRemark: record.patternRevReturnComment || '',
    unlockTime: buildUnlockTime(record),
    patternMakerName: currentOperatorName,
    actualCompleteDate: undefined,
    remark: '',
    patternFile: undefined,
  });

  const syncPatternContextFields = (record: StyleInfo | null) => {
    if (!record) {
      return;
    }
    patternRevisionForm.setFieldsValue({
      styleNo: record.styleNo,
      revisionNo: nextRevisionNo || patternRevisionForm.getFieldValue('revisionNo'),
      unlockRemark: record.patternRevReturnComment || '',
      unlockTime: buildUnlockTime(record),
      patternMakerName: currentOperatorName,
    });
  };

  const loadPatternMeta = async (record: StyleInfo | null) => {
    if (!record?.id) {
      resetPatternMeta();
      return;
    }

    setPatternMetaLoading(true);
    try {
      const [revisionResult, versionsResult, checkResult, nextResult] = await Promise.allSettled([
        api.get<{ code: number; message: string; data: { records: PatternRevision[]; total: number } }>('/pattern-revision/list', {
          params: { styleNo: record.styleNo, page: 1, pageSize: 1 },
        }),
        api.get<{ code: number; message: string; data: PatternAttachment[] }>('/style/attachment/pattern/versions', {
          params: { styleId: String(record.id), bizType: 'pattern' },
        }),
        api.get<{ code: number; message: string; data: PatternCheckResult }>('/style/attachment/pattern/check', {
          params: { styleId: String(record.id) },
        }),
        api.get<{ code: number; message: string; data: string }>('/pattern-revision/next-version', {
          params: { styleNo: record.styleNo },
        }),
      ]);

      let nextRevision = '';
      let latestRevision: PatternRevision | null = null;
      let patternFile: PatternAttachment | null = null;
      let versionCount = 0;

      if (nextResult.status === 'fulfilled' && nextResult.value.code === 200) {
        nextRevision = nextResult.value.data || '';
      }

      if (revisionResult.status === 'fulfilled' && revisionResult.value.code === 200) {
        latestRevision = revisionResult.value.data?.records?.[0] || null;
      }

      let versionList: PatternAttachment[] = [];
      if (versionsResult.status === 'fulfilled' && versionsResult.value.code === 200) {
        versionList = versionsResult.value.data || [];
      }

      let checkData: PatternCheckResult | null = null;
      if (checkResult.status === 'fulfilled' && checkResult.value.code === 200) {
        checkData = checkResult.value.data || null;
      }

      const activeFile = versionList.find(item => item.status === 'active');
      const newestFile = [...versionList].sort((left, right) => (right.version || 0) - (left.version || 0))[0];
      patternFile = activeFile || newestFile || checkData?.patternFile || null;
      versionCount = versionList.length > 0 ? versionList.length : (patternFile ? 1 : 0);

      setNextRevisionNo(nextRevision);
      setLatestPatternRevision(latestRevision);
      setCurrentPatternFile(patternFile);
      setPatternVersionCount(versionCount);
      setPatternVersionList(versionList);
    } finally {
      setPatternMetaLoading(false);
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
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '获取款号列表失败');
    } finally {
      setLoading(false);
    }
  };

  const openPatternRevisionModal = async (record: StyleInfo) => {
    setPatternRevisionRecord(record);
    patternRevisionForm.resetFields();
    patternRevisionForm.setFieldsValue(buildPatternInitialValues(record));
    setPatternRevisionModalVisible(true);
    await loadPatternMeta(record);
  };

  const handlePatternRevisionSave = async () => {
    const targetRecord = styleNo ? directRow : patternRevisionRecord;
    if (!targetRecord) return;
    try {
      setPatternRevisionSaving(true);
      const values = await patternRevisionForm.validateFields();
      const maintainTime = dayjs.isDayjs(values.unlockTime)
        ? values.unlockTime
        : (buildUnlockTime(targetRecord) || dayjs());
      let uploadedAttachment: PatternAttachment | null = null;
      const patternFileList = Array.isArray(values.patternFile) ? values.patternFile : [];

      if (patternFileList.length > 0) {
        const file = patternFileList[0]?.originFileObj;
        if (file) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('styleId', String(targetRecord.id));
          formData.append('styleNo', targetRecord.styleNo);
          formData.append('type', 'pattern');
          const uploadRes = await api.post<{ code: number; message: string; data: PatternAttachment }>('/style/attachment/upload-pattern', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
          if (uploadRes.code !== 200) {
            message.error(uploadRes.message || '文件上传失败');
            return;
          }
          uploadedAttachment = uploadRes.data || null;
        }
      }

      const data = {
        styleId: String(targetRecord.id),
        styleNo: targetRecord.styleNo,
        revisionNo: values.revisionNo || nextRevisionNo || undefined,
        revisionType: values.revisionType,
        revisionReason: values.revisionReason, revisionContent: values.revisionReason,
        revisionDate: maintainTime.format('YYYY-MM-DD'),
        patternMakerName: currentOperatorName,
        maintainerName: currentOperatorName,
        maintainTime: maintainTime.format('YYYY-MM-DDTHH:mm:ss'),
        actualCompleteDate: values.actualCompleteDate?.format('YYYY-MM-DD'),
        attachmentUrls: uploadedAttachment?.fileUrl ? JSON.stringify([uploadedAttachment.fileUrl]) : undefined,
        remark: values.remark,
      };
      const res = await api.post<{ code: number; message: string }>('/pattern-revision', data);
      if (res.code === 200) {
        message.success(uploadedAttachment ? '纸样修改记录已保存，最新纸样文件已同步为大货读取版本' : '纸样修改记录已保存');
        setPatternRevisionModalVisible(false);
        setPatternRevisionRecord(null);
        patternRevisionForm.resetFields();
        await fetchStyles();
        await loadPatternMeta(targetRecord);
      }
      else { message.error(res.message || '保存失败'); }
    } catch (e: unknown) { message.error((e as any)?.message || '保存失败'); }
    finally { setPatternRevisionSaving(false); }
  };

  const handleReturnPatternSave = async () => {
    const targetRecord = styleNo ? directRow : returnPatternRecord;
    if (!targetRecord) return;
    try {
      setReturnPatternSaving(true);
      const values = await returnPatternForm.validateFields();
      const res = await api.post<{ code: number; message: string }>(`/style/info/${targetRecord.id}/pattern-revision/rollback`, { reason: values.reason });
      if (res.code === 200) {
        message.success('已退回，用户可重新提交纸样修改');
        setReturnPatternModalVisible(false);
        setReturnPatternRecord(null);
        returnPatternForm.resetFields();
        await fetchStyles();
        await loadPatternMeta(targetRecord);
      }
      else { message.error(res.message || '退回失败'); }
    } catch (e: unknown) { message.error((e as any)?.message || '退回失败'); }
    finally { setReturnPatternSaving(false); }
  };

  useEffect(() => { fetchStyles(); }, [queryParams]);

  useEffect(() => {
    if (!activePatternRecord?.id) {
      resetPatternMeta();
      return;
    }
    void loadPatternMeta(activePatternRecord);
  }, [activePatternRecord?.id, activePatternRecord?.styleNo]);

  useEffect(() => {
    const editableRecord = styleNo
      ? (directRow && !directLocked ? directRow : null)
      : (patternRevisionModalVisible ? patternRevisionRecord : null);
    if (!editableRecord) {
      return;
    }
    if (patternRevisionForm.getFieldValue('styleNo')) {
      syncPatternContextFields(editableRecord);
      return;
    }
    patternRevisionForm.setFieldsValue(buildPatternInitialValues(editableRecord));
  }, [styleNo, directRow?.id, directLocked, directHasUnlockRemark, patternRevisionModalVisible, patternRevisionRecord?.id, nextRevisionNo, currentOperatorName]);

  const renderPatternSummary = (record: StyleInfo, options?: { readOnly?: boolean }) => {
    const readOnly = options?.readOnly === true;
    const locked = Number(record.patternRevLocked) === 1;
    const unlockRemark = String(record.patternRevReturnComment || '').trim();
    const currentVersion = latestPatternRevision?.revisionNo || (currentPatternFile?.version ? `附件 V${currentPatternFile.version}` : '未生成');
    const latestOperator = latestPatternRevision?.patternMakerName || latestPatternRevision?.maintainerName || currentPatternFile?.uploader || record.patternRevReturnBy || '-';
    const latestTime = latestPatternRevision?.maintainTime || currentPatternFile?.createTime || record.patternCompletedTime || '';
    const patternStatusLabel = toPatternStatusLabel(record.patternStatus);
    const statusLabel = locked ? '已锁定' : (unlockRemark ? '已退回' : '已就绪');
    const statusPillStyle = locked
      ? { ...statusPillBaseStyle, color: '#0958d9', background: '#e6f4ff', border: '1px solid #91caff' }
      : unlockRemark
        ? { ...statusPillBaseStyle, color: '#ad6800', background: '#fff7e6', border: '1px solid #ffd591' }
        : { ...statusPillBaseStyle, color: '#135200', background: '#f6ffed', border: '1px solid #b7eb8f' };
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={heroStyle}>
          <div style={heroThumbStyle}>
            <AttachmentThumb styleId={(record as any).id} cover={(record as any).cover || null} />
          </div>
          <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
            <div style={heroHeadlineStyle}>
              <div style={{ ...directTitleStyle, fontSize: 15 }}>纸样维护</div>
              <span style={statusPillStyle}>{statusLabel}</span>
            </div>
            <div style={directMetaStyle}>状态 {patternStatusLabel}</div>
            {record.patternCompletedTime ? <div style={directMetaStyle}>完成时间 {formatDateTime(record.patternCompletedTime)}</div> : null}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <StyleAttachmentsButton styleId={(record as any).id} styleNo={(record as any).styleNo} />
          </div>
        </div>

        <div style={summaryGridStyle}>
          <div style={summaryCardStyle}>
            <div style={directFieldLabelStyle}>当前纸样版本</div>
            <div style={directValueStyle}>{patternMetaLoading ? '读取中...' : currentVersion}</div>
          </div>
          <div style={summaryCardStyle}>
            <div style={directFieldLabelStyle}>历史版次</div>
            <div style={directValueStyle}>{patternMetaLoading ? '读取中...' : (patternVersionCount > 0 ? `${patternVersionCount} 版` : '暂无')}</div>
          </div>
          <div style={summaryCardStyle}>
            <div style={directFieldLabelStyle}>最近维护</div>
            <div style={directValueStyle}>{patternMetaLoading ? '读取中...' : latestOperator}</div>
            <div style={directMetaStyle}>{patternMetaLoading ? '读取中...' : (latestTime ? formatDateTime(latestTime) : '-')}</div>
          </div>
          {!readOnly ? (
            <div style={summaryCardStyle}>
              <div style={directFieldLabelStyle}>本次新版本</div>
              <div style={directValueStyle}>{nextRevisionNo || '生成中...'}</div>
            </div>
          ) : null}
        </div>

        <div style={metaCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={directFieldLabelStyle}>当前读取文件</div>
              <div style={{ ...directMetaStyle, wordBreak: 'break-all' }}>
                {patternMetaLoading ? '读取中...' : (currentPatternFile?.fileName || '未上传当前纸样文件')}
              </div>
            </div>
            {currentPatternFile?.fileUrl ? (
              <a href={getFullAuthedFileUrl(currentPatternFile.fileUrl)} target="_blank" rel="noreferrer" title="下载当前纸样文件（大货读取版本）" style={{ fontSize: 12, color: '#1677ff', whiteSpace: 'nowrap' }}>↓ 下载</a>
            ) : null}
          </div>
          <div style={{ ...directMetaStyle, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span>文件版次 {currentPatternFile?.version ? `V${currentPatternFile.version}` : '-'}</span>
            <span>上传人 {currentPatternFile?.uploader || '-'}</span>
            <span>上传时间 {currentPatternFile?.createTime ? formatDateTime(currentPatternFile.createTime) : '-'}</span>
          </div>
        </div>

        {!patternMetaLoading && patternVersionList.filter(v => v.status === 'archived').length > 0 ? (
          <div style={{ border: '1px solid #f0f0f0', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', background: '#fafafa', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>历史封存版本</span>
              <span style={{ fontSize: 11, color: '#8c8c8c', background: '#fff7e6', padding: '1px 8px', borderRadius: 4, border: '1px solid #ffd591' }}>已封存 · 仅供参考 · 不参与大货生产</span>
            </div>
            <div>
              {patternVersionList
                .filter(v => v.status === 'archived')
                .sort((a, b) => (b.version || 0) - (a.version || 0))
                .map((ver, idx) => (
                  <div key={(ver as any).id || idx} style={{ padding: '8px 12px', borderBottom: '1px solid #f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', flexShrink: 0 }}>V{ver.version || '-'}</span>
                        <span style={{ fontSize: 11, color: '#8c8c8c', background: '#f5f5f5', padding: '0 6px', borderRadius: 3, border: '1px solid #e8e8e8', flexShrink: 0 }}>封存</span>
                        <span style={{ fontSize: 12, color: 'var(--neutral-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{ver.fileName || '-'}</span>
                      </div>
                      <div style={{ marginTop: 2, fontSize: 11, color: 'var(--neutral-text-disabled)' }}>
                        上传人 {ver.uploader || '-'} · {ver.createTime ? formatDateTime(ver.createTime) : '-'}
                      </div>
                    </div>
                    {ver.fileUrl ? (
                      <a href={getFullAuthedFileUrl(ver.fileUrl)} target="_blank" rel="noreferrer" title="下载此封存版本" style={{ fontSize: 12, color: '#1677ff', flexShrink: 0, whiteSpace: 'nowrap' }}>↓ 下载</a>
                    ) : <span style={{ fontSize: 12, color: '#d9d9d9', flexShrink: 0 }}>无文件</span>}
                  </div>
                ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const renderPatternEditorForm = () => {
    const unlockRemark = String(patternRevisionForm.getFieldValue('unlockRemark') || '').trim();
    return (
      <Form form={patternRevisionForm} layout="vertical">
        {unlockRemark ? (
          <div style={unlockNoteStyle}>
            <div style={directFieldLabelStyle}>退回原因</div>
            <div style={directMetaStyle}>{unlockRemark}</div>
          </div>
        ) : null}

        {unlockRemark ? <div style={{ height: 12 }} /> : null}

        <div style={editorGridStyle}>
          <Form.Item name="revisionType" label="修改类型" rules={[{ required: true, message: '请选择修改类型' }]} style={{ marginBottom: 0 }}>
            <Select size="small"><Select.Option value="MINOR">小改</Select.Option><Select.Option value="MAJOR">大改</Select.Option><Select.Option value="URGENT">紧急修改</Select.Option></Select>
          </Form.Item>
          <Form.Item name="actualCompleteDate" label="完成时间" style={{ marginBottom: 0 }}>
            <DatePicker size="small" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="remark" label="本次备注" style={{ marginBottom: 0 }}>
            <Input size="small" placeholder="其他说明" />
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
              <Button size="small">选择纸样文件</Button>
            </Upload>
          </Form.Item>
        </div>
      </Form>
    );
  };

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
  ], [canManage]);

  /* ── direct mode render: skip table, show form inline ── */
  if (styleNo) {
    if (loading && !directRow) return <div style={{ textAlign: 'center', padding: 24, color: 'rgba(0,0,0,0.45)' }}>加载中...</div>;
    if (!directRow && !loading) return <div style={{ textAlign: 'center', padding: 24, color: 'rgba(0,0,0,0.45)' }}>未找到该款号的数据</div>;
    if (!directRow) return <div style={{ textAlign: 'center', padding: 24, color: 'rgba(0,0,0,0.45)' }}>加载中...</div>;
    if (!canManage) {
      return (
        <div style={directStackStyle}>
          <div style={directCardStyle}>{renderPatternSummary(directRow, { readOnly: true })}</div>
          <div style={directCardStyle}>
            <div style={directMetaStyle}>当前账号仅可查看纸样资料。</div>
          </div>
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
                <Button danger type="default" size="small" loading={returnPatternSaving} onClick={handleReturnPatternSave} style={{ background: '#fff', color: '#ff4d4f', borderColor: '#ff4d4f' }}>确认退回</Button>
              </div>
            </div>

            <div style={directCardStyle}>
              {renderPatternSummary(directRow, { readOnly: true })}
            </div>
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
        <div style={directCardStyle}>{renderPatternSummary(directRow)}</div>
        <div style={directCardStyle}>
          {renderPatternEditorForm()}
          <div style={{ ...actionBarStyle, marginTop: 12, gap: 8 }}>
            <Button size="small" loading={cancelLocking} onClick={async () => {
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
            <Button type="primary" size="small" loading={patternRevisionSaving} onClick={handlePatternRevisionSave}>保存本次修改</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Card size="small" className="filter-card" style={{ marginBottom: 16 }}>
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

      {/* 退回纸样修改弹窗 */}
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

      {/* 纸样修改弹窗 */}
      <ResizableModal open={patternRevisionModalVisible} title={`纸样修改记录 - ${patternRevisionRecord?.styleNo || ''}`} width="40vw"
        onCancel={() => { setPatternRevisionModalVisible(false); setPatternRevisionRecord(null); patternRevisionForm.resetFields(); }}
        footer={<Space><Button onClick={() => { setPatternRevisionModalVisible(false); setPatternRevisionRecord(null); patternRevisionForm.resetFields(); }}>取消</Button><Button type="primary" loading={patternRevisionSaving} onClick={handlePatternRevisionSave}>保存</Button></Space>}>
        {patternRevisionRecord ? (
          <div style={directStackStyle}>
            <div style={directCardStyle}>{renderPatternSummary(patternRevisionRecord)}</div>
            <div style={directCardStyle}>{renderPatternEditorForm()}</div>
          </div>
        ) : null}
      </ResizableModal>
    </>
  );
};

export default PatternPanel;
