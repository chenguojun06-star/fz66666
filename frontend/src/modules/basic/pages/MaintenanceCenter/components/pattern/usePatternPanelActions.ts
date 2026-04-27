import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Form } from 'antd';
import api from '@/utils/api';
import { StyleInfo, StyleQueryParams } from '@/types/style';
import type { PatternRevision } from '@/types/patternRevision';
import { getErrorMessage } from '../../../TemplateCenter/utils/templateUtils';
import { isAdminUser as isAdminUserFn, useAuth } from '@/utils/AuthContext';
import { readPageSize } from '@/utils/pageSizeStore';
import dayjs from 'dayjs';

type PatternAttachment = import('@/types/style').StyleAttachment & { versionRemark?: string | null };

type PatternCheckResult = {
  complete?: boolean;
  missingItems?: string[];
  patternFile?: PatternAttachment | null;
  gradingFile?: PatternAttachment | null;
};

export default function usePatternPanelActions(styleNo?: string) {
  const { message } = App.useApp();
  const { user } = useAuth();

  const [queryParams, setQueryParams] = useState<StyleQueryParams>({
    page: 1, pageSize: readPageSize(10), onlyCompleted: true,
    ...(styleNo ? { styleNoExact: styleNo } : {}),
  });
  const [styleNoInput, setStyleNoInput] = useState('');
  const [styleNameInput, setStyleNameInput] = useState('');
  const debouncedStyleNo = styleNoInput;
  const debouncedStyleName = styleNameInput;

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
  const currentOperatorName = useMemo(() => {
    const displayName = String((user as any)?.name || (user as any)?.username || '').trim();
    return displayName || '当前操作人';
  }, [user]);

  const directRow = styleNo ? (styles.find(s => s.styleNo === styleNo) ?? null) : null;
  const directLocked = Number(directRow?.patternRevLocked) === 1;
  const directHasUnlockRemark = !!String(directRow?.patternRevReturnComment || '').trim();
  const directProcessing = !directLocked && directHasUnlockRemark;
  const activePatternRecord = styleNo ? directRow : patternRevisionRecord;

  const [latestPatternRevision, setLatestPatternRevision] = useState<PatternRevision | null>(null);
  const [currentPatternFile, setCurrentPatternFile] = useState<PatternAttachment | null>(null);
  const [patternVersionCount, setPatternVersionCount] = useState(0);
  const [patternVersionList, setPatternVersionList] = useState<PatternAttachment[]>([]);
  const [nextRevisionNo, setNextRevisionNo] = useState('');
  const [patternMetaLoading, setPatternMetaLoading] = useState(false);

  const resetPatternMeta = useCallback(() => {
    setLatestPatternRevision(null);
    setCurrentPatternFile(null);
    setPatternVersionCount(0);
    setPatternVersionList([]);
    setNextRevisionNo('');
    setPatternMetaLoading(false);
  }, []);

  const buildUnlockTime = useCallback((record?: StyleInfo | null) => {
    if (record?.patternRevReturnTime) return dayjs(record.patternRevReturnTime);
    return null;
  }, []);

  const buildPatternInitialValues = useCallback((record: StyleInfo) => ({
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
  }), [nextRevisionNo, buildUnlockTime, currentOperatorName]);

  const syncPatternContextFields = useCallback((record: StyleInfo | null) => {
    if (!record) return;
    patternRevisionForm.setFieldsValue({
      styleNo: record.styleNo,
      revisionNo: nextRevisionNo || patternRevisionForm.getFieldValue('revisionNo'),
      unlockRemark: record.patternRevReturnComment || '',
      unlockTime: buildUnlockTime(record),
      patternMakerName: currentOperatorName,
    });
  }, [nextRevisionNo, buildUnlockTime, currentOperatorName, patternRevisionForm]);

  const loadPatternMeta = useCallback(async (record: StyleInfo | null) => {
    if (!record?.id) { resetPatternMeta(); return; }
    setPatternMetaLoading(true);
    try {
      const [revisionResult, versionsResult, checkResult, nextResult] = await Promise.allSettled([
        api.get<{ code: number; message: string; data: { records: PatternRevision[]; total: number } }>('/pattern-revision/list', { params: { styleNo: record.styleNo, page: 1, pageSize: 1 } }),
        api.get<{ code: number; message: string; data: PatternAttachment[] }>('/style/attachment/pattern/versions', { params: { styleId: String(record.id), bizType: 'pattern' } }),
        api.get<{ code: number; message: string; data: PatternCheckResult }>('/style/attachment/pattern/check', { params: { styleId: String(record.id) } }),
        api.get<{ code: number; message: string; data: string }>('/pattern-revision/next-version', { params: { styleNo: record.styleNo } }),
      ]);

      let nextRevision = '';
      let latestRevision: PatternRevision | null = null;
      let patternFile: PatternAttachment | null = null;
      let versionCount = 0;

      if (nextResult.status === 'fulfilled' && nextResult.value.code === 200) nextRevision = nextResult.value.data || '';
      if (revisionResult.status === 'fulfilled' && revisionResult.value.code === 200) latestRevision = revisionResult.value.data?.records?.[0] || null;

      let versionList: PatternAttachment[] = [];
      if (versionsResult.status === 'fulfilled' && versionsResult.value.code === 200) versionList = versionsResult.value.data || [];

      let checkData: PatternCheckResult | null = null;
      if (checkResult.status === 'fulfilled' && checkResult.value.code === 200) checkData = checkResult.value.data || null;

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
  }, [resetPatternMeta]);

  const fetchStyles = useCallback(async () => {
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
  }, [queryParams, message]);

  const openPatternRevisionModal = useCallback(async (record: StyleInfo) => {
    setPatternRevisionRecord(record);
    patternRevisionForm.resetFields();
    patternRevisionForm.setFieldsValue(buildPatternInitialValues(record));
    setPatternRevisionModalVisible(true);
    await loadPatternMeta(record);
  }, [patternRevisionForm, buildPatternInitialValues, loadPatternMeta]);

  const handlePatternRevisionSave = useCallback(async () => {
    const targetRecord = styleNo ? directRow : patternRevisionRecord;
    if (!targetRecord) return;
    try {
      setPatternRevisionSaving(true);
      const values = await patternRevisionForm.validateFields();
      const maintainTime = dayjs.isDayjs(values.unlockTime) ? values.unlockTime : (buildUnlockTime(targetRecord) || dayjs());
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
          if (uploadRes.code !== 200) { message.error(uploadRes.message || '文件上传失败'); return; }
          uploadedAttachment = uploadRes.data || null;
        }
      }

      const data = {
        styleId: String(targetRecord.id), styleNo: targetRecord.styleNo,
        revisionNo: values.revisionNo || nextRevisionNo || undefined,
        revisionType: values.revisionType,
        revisionReason: values.revisionReason, revisionContent: values.revisionReason,
        revisionDate: maintainTime.format('YYYY-MM-DD'),
        patternMakerName: currentOperatorName, maintainerName: currentOperatorName,
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
      } else { message.error(res.message || '保存失败'); }
    } catch (e: unknown) { message.error((e as any)?.message || '保存失败'); }
    finally { setPatternRevisionSaving(false); }
  }, [styleNo, directRow, patternRevisionRecord, patternRevisionForm, buildUnlockTime, nextRevisionNo, currentOperatorName, fetchStyles, loadPatternMeta, message]);

  const handleReturnPatternSave = useCallback(async () => {
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
      } else { message.error(res.message || '退回失败'); }
    } catch (e: unknown) { message.error((e as any)?.message || '退回失败'); }
    finally { setReturnPatternSaving(false); }
  }, [styleNo, directRow, returnPatternRecord, returnPatternForm, fetchStyles, loadPatternMeta, message]);

  useEffect(() => { fetchStyles(); }, [queryParams]);

  useEffect(() => {
    if (!activePatternRecord?.id) { resetPatternMeta(); return; }
    void loadPatternMeta(activePatternRecord);
  }, [activePatternRecord?.id, activePatternRecord?.styleNo]);

  useEffect(() => {
    const editableRecord = styleNo
      ? (directRow && !directLocked ? directRow : null)
      : (patternRevisionModalVisible ? patternRevisionRecord : null);
    if (!editableRecord) return;
    if (patternRevisionForm.getFieldValue('styleNo')) { syncPatternContextFields(editableRecord); return; }
    patternRevisionForm.setFieldsValue(buildPatternInitialValues(editableRecord));
  }, [styleNo, directRow?.id, directLocked, directHasUnlockRemark, patternRevisionModalVisible, patternRevisionRecord?.id, nextRevisionNo, currentOperatorName]);

  return {
    queryParams, setQueryParams, styleNoInput, setStyleNoInput, styleNameInput, setStyleNameInput,
    styles, total, loading, canManage, currentOperatorName,
    patternRevisionModalVisible, setPatternRevisionModalVisible, patternRevisionRecord, setPatternRevisionRecord,
    patternRevisionForm, patternRevisionSaving, cancelLocking, setCancelLocking,
    returnPatternModalVisible, setReturnPatternModalVisible, returnPatternRecord, setReturnPatternRecord,
    returnPatternSaving, returnPatternForm,
    directRow, directLocked, directProcessing, activePatternRecord,
    latestPatternRevision, currentPatternFile, patternVersionCount, patternVersionList,
    nextRevisionNo, patternMetaLoading,
    fetchStyles, openPatternRevisionModal, handlePatternRevisionSave,
    handleReturnPatternSave, buildPatternInitialValues,
  };
}
