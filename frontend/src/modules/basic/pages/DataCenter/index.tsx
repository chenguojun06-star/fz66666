import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Card, Col, Input, Row, Space, Form, Select, DatePicker, Upload } from 'antd';

import PageStatCards from '@/components/common/PageStatCards';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions from '@/components/common/RowActions';
import StylePrintModal from '@/components/common/StylePrintModal';
import StandardToolbar from '@/components/common/StandardToolbar';
import api from '@/utils/api';
import { StyleInfo, StyleQueryParams } from '@/types/style';
import { StyleAttachmentsButton } from '@/components/StyleAssets';
import { toCategoryCn } from '@/utils/styleCategory';
import { formatDateTime } from '@/utils/datetime';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { useViewport } from '@/utils/useViewport';
import dayjs from 'dayjs';

const { TextArea } = Input;

interface DataCenterStats {
  styleCount: number;
  materialCount: number;
  productionCount: number;
}

export const buildProductionSheetHtml = (payload: any) => {
  const style = payload?.style || {};
  const sizeList = Array.isArray(payload?.sizeList) ? payload.sizeList : [];
  const attachments = Array.isArray(payload?.attachments) ? payload.attachments : [];

  const _origin = typeof window !== 'undefined' ? window.location.origin : '';
  const resolveUrl = (u: any) => {
    const s = String(u ?? '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    return getFullAuthedFileUrl(s);
  };

  const esc = (v: unknown) => String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const toSeasonCn = (value: unknown): string => {
    const raw = String(value ?? '').trim();
    if (!raw) return '-';
    const upper = raw.toUpperCase();

    if (upper === 'SPRING' || raw === '春' || raw === '春季') return '春季';
    if (upper === 'SUMMER' || raw === '夏' || raw === '夏季') return '夏季';
    if (upper === 'AUTUMN' || upper === 'FALL' || raw === '秋' || raw === '秋季') return '秋季';
    if (upper === 'WINTER' || raw === '冬' || raw === '冬季') return '冬季';
    if (upper === 'SS' || upper === 'SPRING/SUMMER' || upper === 'SPRING_SUMMER') return '春夏';
    if (upper === 'FW' || upper === 'AW' || upper === 'FALL/WINTER' || upper === 'AUTUMN/WINTER' || upper === 'FALL_WINTER' || upper === 'AUTUMN_WINTER') return '秋冬';
    if (raw === '春夏' || raw === '秋冬') return raw;
    return raw;
  };

  const collator = new Intl.Collator('zh-Hans-CN');
  const parseSizeKey = (input: any) => {
    const raw = String(input ?? '').trim();
    const upper = raw.toUpperCase();
    if (!upper || upper === '-') return { rank: 9999, num: 0, raw: upper };
    if (upper === '均码' || upper === 'ONE SIZE' || upper === 'ONESIZE') return { rank: 55, num: 0, raw: upper };

    if (/^\d+(\.\d+)?$/.test(upper)) {
      const n = Number.parseFloat(upper);
      return { rank: 0, num: Number.isFinite(n) ? n : 0, raw: upper };
    }

    const mNumXL = upper.match(/^(\d+)XL$/);
    if (mNumXL) {
      const n = Number.parseInt(mNumXL[1], 10);
      const rank = 70 + Math.max(0, (Number.isFinite(n) ? n : 1) - 1) * 10;
      return { rank, num: 0, raw: upper };
    }

    const mXS = upper.match(/^(X{0,4})S$/);
    if (mXS) {
      const len = (mXS[1] || '').length;
      return { rank: 40 - len * 10, num: 0, raw: upper };
    }

    if (upper === 'M') return { rank: 50, num: 0, raw: upper };

    const mXL = upper.match(/^(X{1,4})L$/);
    if (mXL) {
      const len = (mXL[1] || '').length;
      return { rank: 60 + len * 10, num: 0, raw: upper };
    }

    if (upper === 'L') return { rank: 60, num: 0, raw: upper };
    return { rank: 5000, num: 0, raw: upper };
  };

  const compareSizeAsc = (a: any, b: any) => {
    const ka = parseSizeKey(a);
    const kb = parseSizeKey(b);
    if (ka.rank !== kb.rank) return ka.rank - kb.rank;
    if (ka.num !== kb.num) return ka.num - kb.num;
    return collator.compare(ka.raw, kb.raw);
  };

  const sizeNames = Array.from(new Set(sizeList.map((s: any) => String(s.sizeName || '').trim()).filter(Boolean)));
  const sortedSizeNames = [...sizeNames].sort(compareSizeAsc);
  const partNames = Array.from(new Set(sizeList.map((s: any) => String(s.partName || '').trim()).filter(Boolean)));
  const sizeCellMap: Record<string, unknown> = {};
  const partMethodMap: Record<string, string> = {};
  for (const row of sizeList) {
    const key = `${String(row.partName || '').trim()}__${String(row.sizeName || '').trim()}`;
    sizeCellMap[key] = row;
    const part = String(row.partName || '').trim();
    if (part && partMethodMap[part] == null) {
      partMethodMap[part] = String(row.measureMethod || '').trim();
    }
  }

  const sizeHeader = `<tr><th>部位(cm)</th><th>度量方式</th>${sortedSizeNames.map((s) => `<th>${esc(s)}</th>`).join('')}</tr>`;
  const sizeRows = (partNames as string[]).map((part) => {
    const partKey = String(part);
    const tds = sortedSizeNames.map((sn) => {
      const key = `${partKey}__${sn}`;
      const cell = sizeCellMap[key] as any;
      const v = cell?.standardValue != null ? `${cell.standardValue}${cell?.tolerance != null ? ` ±${cell.tolerance}` : ''}` : '';
      return `<td>${esc(v)}</td>`;
    }).join('');
    return `<tr><td>${esc(partKey)}</td><td>${esc(partMethodMap[partKey] || '')}</td>${tds}</tr>`;
  }).join('');

  const coverFromAttachments = (attachments.find((a: any) => String(a?.fileType || '').includes('image')) as any)?.fileUrl;
  const coverUrl = resolveUrl(style.cover || coverFromAttachments || '');

  const productionReqLines = (() => {
    const raw = String(style.description ?? '');
    const lines = raw
      .split(/\r?\n/)
      .map((l) => String(l || '').replace(/^\s*\d+\s*[.、)）-]?\s*/, '').trim())
      .filter((l) => Boolean(l));
    const fixed = Array.from({ length: 15 }).map((_, i) => lines[i] || '');
    return fixed;
  })();

  const productionReqRows = productionReqLines
    .map((txt: string, idx: number) => `<tr><td class="no">${idx + 1}</td><td class="req">${esc(txt || '')}</td></tr>`)
    .join('');

  const categoryText = toCategoryCn(style.category);
  const seasonText = toSeasonCn(style.season);

  // 样衣审核
  const reviewStatusLabel = (s: unknown) => {
    if (s === 'PASS')   return '<span style="color:#52c41a;font-weight:600">✅ 通过</span>';
    if (s === 'REWORK') return '<span style="color:#faad14;font-weight:600">⚠️ 需修改</span>';
    if (s === 'REJECT') return '<span style="color:#ff4d4f;font-weight:600">❌ 不通过</span>';
    return '<span style="color:#aaa">未审核</span>';
  };
  const sampleReviewHtml = style.sampleReviewStatus ? `
    <div class="section">
      <div class="section-title">样衣审核</div>
      <table>
        <tbody>
          <tr><td style="width:100px">审核结论</td><td>${reviewStatusLabel(style.sampleReviewStatus)}</td></tr>
          <tr><td>审核人</td><td>${esc(style.sampleReviewer || '-')}</td></tr>
          <tr><td>审核时间</td><td>${esc(String(style.sampleReviewTime || '-').replace('T', ' ').slice(0, 16))}</td></tr>
          ${style.sampleReviewComment ? `<tr><td style="vertical-align:top">审核评语</td><td style="white-space:pre-wrap">${esc(style.sampleReviewComment)}</td></tr>` : ''}
        </tbody>
      </table>
    </div>` : '';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>生产制单-${esc(style.styleNo || '')}</title>
  <style>
    @page { margin: 10mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', Arial, sans-serif; color: #111; }
    .page { max-width: 980px; margin: 0 auto; padding: 0; }
    .header { display: grid; grid-template-columns: 220px 1fr; gap: 16px; align-items: start; }
    .cover { width: 220px; height: 220px; object-fit: cover; border-radius: 10px; border: 1px solid rgba(0,0,0,0.08); }
    .h1 { font-size: 22px; font-weight: 700; margin: 0 0 8px; }
    .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 16px; }
    .meta div { font-size: 13px; color: rgba(0,0,0,0.85); }
    .muted { color: rgba(0,0,0,0.55); }
    .btn { height: 32px; padding: 4px 14px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.15); background: #fff; font-size: 14px; font-weight: 600; cursor: pointer; }
    .btn:hover { border-color: #2D7FF9; color: #2D7FF9; }
    .btn:active { transform: translateY(0.5px); }
    .section { margin-top: 18px; }
    .section-title { font-weight: 700; font-size: 14px; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed; }
    th, td { border: 1px solid #d1d5db; padding: 6px 8px; vertical-align: middle; text-align: center; overflow-wrap: anywhere; word-break: break-word; }
    th { background: rgba(0,0,0,0.03); text-align: center; }
    .no { width: 56px; text-align: center; }
    .req { white-space: pre-wrap; }
    @media print {
      .no-print { display: none; }
      .page { padding: 0; max-width: none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="no-print" style="display:flex; gap:8px; justify-content:flex-end; margin-bottom:10px;">
      <button class="btn" onclick="window.print()">打印</button>
    </div>
    <div class="header">
      <img class="cover" src="${esc(coverUrl)}" onerror="this.style.display='none'" />
      <div>
        <div class="h1">生产制单</div>
        <div class="meta">
          <div>款号：${esc(style.styleNo || '')}</div>
          <div>款名：${esc(style.styleName || '')}</div>
          <div>品类：${esc(categoryText)}</div>
          <div>季节：${esc(seasonText)}</div>
          <div>颜色：${esc(style.color || '')}</div>
          <div>码数：${esc(style.size || '')}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">生产要求</div>
      <table>
        <thead><tr><th class="no">序号</th><th>内容</th></tr></thead>
        <tbody>
          ${productionReqRows}
        </tbody>
      </table>
    </div>

    ${sampleReviewHtml}

    <div class="section">
      <div class="section-title">尺寸表</div>
      <table>
        <thead>${sizeHeader}</thead>
        <tbody>${sizeRows}</tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
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
    pageSize: 10,
    onlyCompleted: true,
  });
  const [styles, setStyles] = useState<StyleInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [_viewMode, _setViewMode] = useState<'list' | 'card'>('list');

  // 打印弹窗状态
  const [printModalVisible, setPrintModalVisible] = useState(false);
  const [printingRecord, setPrintingRecord] = useState<StyleInfo | null>(null);

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

  const printProductionSheet = async (style: StyleInfo) => {
    // 使用通用打印组件
    setPrintingRecord(style);
    setPrintModalVisible(true);
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
      const res = await api.put<{ code: number; message: string }>(`/style/info/${editingRecord.id}`, {
        description: values.description,
      });
      if (res.code === 200) {
        message.success('保存成功');
        setEditModalVisible(false);
        fetchStyles();
      } else {
        message.error(res.message || '保存失败');
      }
    } catch (e: unknown) {
      message.error((e as any)?.message || '保存失败');
    } finally {
      setEditSaving(false);
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
      revisionContent: '',
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

      // 1. 如果有上传文件，先上传文件
      if (values.patternFile && values.patternFile.fileList && values.patternFile.fileList.length > 0) {
        const file = values.patternFile.fileList[0].originFileObj;
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
        revisionContent: values.revisionContent,
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
        width: 280,
        render: (_: any, record: StyleInfo) => (
          <RowActions
            maxInline={4}
            actions={[
              {
                key: 'view',
                label: '查看',
                title: '查看详情',
                onClick: () => openDetailModal(record),
              },
              {
                key: 'edit',
                label: '编辑',
                title: '编辑生产制单内容',
                onClick: () => openEditModal(record),
              },
              {
                key: 'patternRevision',
                label: '纸样修改',
                title: '记录纸样修改',
                onClick: () => openPatternRevisionModal(record),
              },
              {
                key: 'print',
                label: '打印',
                title: '打印制单',
                onClick: () => printProductionSheet(record),
                primary: true,
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
      <StylePrintModal
        visible={printModalVisible}
        onClose={() => {
          setPrintModalVisible(false);
          setPrintingRecord(null);
        }}
        styleId={printingRecord?.id}
        styleNo={printingRecord?.styleNo}
        styleName={printingRecord?.styleName}
        cover={printingRecord?.cover}
        category={printingRecord?.category}
        season={printingRecord?.season}
        mode="sample"
      />

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
        initialHeight={500}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            name="description"
            label="生产要求（每行一条，最多15条）"
            rules={[{ required: false }]}
          >
            <Input.TextArea
              rows={15}
              placeholder="请输入生产要求，每行一条&#10;例如：&#10;1. 裁剪前需松布和缩水，确认布号、正反面及染布，裁剪按照合同订单数量明细裁剪；&#10;2. 针织面料需松布24小时可裁剪，拉布经纬纱向要求经直纬平，注意避开布匹瑕疵和色差；"
            />
          </Form.Item>
        </Form>
      </ResizableModal>

      {/* 纸样修改弹窗 */}
      <ResizableModal
        open={patternRevisionModalVisible}
        title={`纸样修改记录 - ${patternRevisionRecord?.styleNo || ''}`}
        width="40vw"
        initialHeight={520}
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

          <Form.Item
            name="revisionContent"
            label="修改内容"
            rules={[{ required: true, message: '请填写修改内容' }]}
          >
            <TextArea rows={3} placeholder="请详细描述需要修改的内容" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <Form.Item name="expectedCompleteDate" label="预计完成日期">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item name="remark" label="备注" style={{ gridColumn: 'span 3' }}>
              <Input placeholder="其他说明" />
            </Form.Item>
          </div>

          <Form.Item name="patternFile" label="纸样文件">
            <Upload
              beforeUpload={() => false}
              maxCount={1}
              accept=".pdf,.dwg,.dxf,.ai,.cdr,.zip,.rar,.plt,.pat,.ets,.hpg,.jpg,.jpeg,.png,.bmp,.gif,.svg"
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
            <Button type="primary" onClick={() => {
              if (detailRecord) {
                printProductionSheet(detailRecord);
              }
            }}>打印制单</Button>
          </Space>
        }
        width="60vw"
        initialHeight={620}
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
