import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, Input, Row, Space, Statistic, message } from 'antd';
import { DownloadOutlined, PrinterOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import api from '@/utils/api';
import { StyleInfo, StyleQueryParams } from '@/types/style';
import { StyleAttachmentsButton } from '@/components/StyleAssets';
import { toCategoryCn } from '@/utils/styleCategory';

interface DataCenterStats {
  styleCount: number;
  materialCount: number;
  productionCount: number;
}

export const buildProductionSheetHtml = (payload: any) => {
  const style = payload?.style || {};
  const sizeList = Array.isArray(payload?.sizeList) ? payload.sizeList : [];
  const attachments = Array.isArray(payload?.attachments) ? payload.attachments : [];

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const resolveUrl = (u: any) => {
    const s = String(u ?? '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (!origin) return s;
    if (s.startsWith('/')) return `${origin}${s}`;
    return `${origin}/${s}`;
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
      const cell = sizeCellMap[key];
      const v = cell?.standardValue != null ? `${cell.standardValue}${cell?.tolerance != null ? ` ±${cell.tolerance}` : ''}` : '';
      return `<td>${esc(v)}</td>`;
    }).join('');
    return `<tr><td>${esc(partKey)}</td><td>${esc(partMethodMap[partKey] || '')}</td>${tds}</tr>`;
  }).join('');

  const coverFromAttachments = attachments.find((a: unknown) => String(a?.fileType || '').includes('image'))?.fileUrl;
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
          const first = images[0]?.fileUrl || null;
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
    <div style={{ width: 56, height: 56, borderRadius: 6, overflow: 'hidden', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {loading ? (
        <span style={{ color: '#999', fontSize: 'var(--font-size-sm)' }}>...</span>
      ) : url ? (
        <img src={url} alt="cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{ color: '#ccc', fontSize: 'var(--font-size-sm)' }}>无图</span>
      )}
    </div>
  );
};

const DataCenter: React.FC = () => {
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

  const fetchStats = async () => {
    try {
      const response = await api.get<{ code: number; message: string; data: unknown }>('/data-center/stats');
      if (response.code === 200) {
        const d = response.data || {};
        setStats({
          styleCount: d.styleCount ?? 0,
          materialCount: d.materialCount ?? 0,
          productionCount: d.productionCount ?? 0
        });
      } else {
        message.error(response.message || '获取资料中心统计失败');
      }
    } catch (error: unknown) {
      message.error(error?.message || '获取资料中心统计失败');
    }
  };

  const fetchStyles = async () => {
    setLoading(true);
    try {
      const response = await api.get<{ code: number; message: string; data: { records: unknown[]; total: number } }>('/style/info/list', { params: queryParams });
      if (response.code === 200) {
        setStyles(response.data.records || []);
        setTotal(response.data.total || 0);
      } else {
        message.error(response.message || '获取款号列表失败');
      }
    } catch (error: unknown) {
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
      message.error(e?.message || '下载失败');
    }
  };

  const printProductionSheet = async (style: StyleInfo) => {
    try {
      const res = await api.get<{ code: number; message: string; data: unknown }>('/data-center/production-sheet', { params: { styleNo: style.styleNo } });
      if (res.code !== 200) {
        message.error(res.message || '获取生产制单失败');
        return;
      }
      const html = buildProductionSheetHtml(res.data);
      const w = window.open('', '_blank');
      if (!w) {
        message.error('浏览器拦截了新窗口');
        return;
      }
      w.document.open();
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(() => {
        w.print();
      }, 200);
    } catch (e: unknown) {
      message.error(e?.message || '打印失败');
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
        render: (_: any, record: StyleInfo) => <AttachmentThumb styleId={(record as Record<string, unknown>).id} cover={(record as Record<string, unknown>).cover || null} />
      },
      { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 140 },
      { title: '款名', dataIndex: 'styleName', key: 'styleName', ellipsis: true },
      { title: '品类', dataIndex: 'category', key: 'category', width: 140, render: (v: unknown) => toCategoryCn(v) },
      {
        title: '附件',
        key: 'attachments',
        width: 100,
        render: (_: any, record: StyleInfo) => (
          <StyleAttachmentsButton
            styleId={(record as Record<string, unknown>).id}
            styleNo={(record as Record<string, unknown>).styleNo}
            modalTitle={`放码纸样（${(record as Record<string, unknown>).styleNo}）`}
            onlyGradingPattern={true}
          />
        )
      },
      {
        title: '操作',
        key: 'action',
        width: 260,
        render: (_: any, record: StyleInfo) => (
          <RowActions
            maxInline={3}
            actions={[
              {
                key: 'download',
                label: '下载生产制单',
                title: '下载生产制单',
                icon: <DownloadOutlined />,
                onClick: () => downloadProductionSheet(record),
                primary: true,
              },
              {
                key: 'print',
                label: '打印制单',
                title: '打印制单',
                icon: <PrinterOutlined />,
                onClick: () => printProductionSheet(record),
                primary: true,
              },
            ]}
          />
        ),
      }
    ];
  }, [styles]);

  return (
    <Layout>
      <Card className="page-card">
        <div className="page-header">
          <h2 className="page-title">资料中心</h2>
        </div>

        <Row gutter={16}>
          <Col span={8}>
            <Card>
              <Statistic title="款号总数" value={stats.styleCount} />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic title="物料总数" value={stats.materialCount} />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic title="生产订单" value={stats.productionCount} />
            </Card>
          </Col>
        </Row>

        <Card size="small" className="filter-card mt-sm mb-sm">
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
            <Button onClick={() => fetchStyles()} loading={loading}>刷新</Button>
          </Space>
        </Card>

        <ResizableTable
          rowKey={(r) => String((r as Record<string, unknown>).id ?? r.styleNo)}
          columns={columns as Record<string, unknown>}
          dataSource={styles}
          loading={loading}
          pagination={{
            current: queryParams.page,
            pageSize: queryParams.pageSize,
            total,
            showSizeChanger: true,
            onChange: (page, pageSize) => setQueryParams(prev => ({ ...prev, page, pageSize })),
          }}
        />
      </Card>
    </Layout>
  );
};

export default DataCenter;
