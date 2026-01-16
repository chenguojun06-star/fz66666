import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, Input, Row, Space, Statistic, message } from 'antd';
import Layout from '../../components/Layout';
import ResizableTable from '../../components/ResizableTable';
import api from '../../utils/api';
import { StyleInfo, StyleQueryParams } from '../../types/style';
import { StyleAttachmentsButton } from '../../components/StyleAssets';

interface DataCenterStats {
  styleCount: number;
  materialCount: number;
  productionCount: number;
}

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
        const res = await api.get<any>(`/style/attachment/list?styleId=${styleId}`);
        const result = res as any;
        if (result.code === 200) {
          const images = (result.data || []).filter((f: any) => String(f.fileType || '').includes('image'));
          const first = images[0]?.fileUrl || null;
          if (mounted) setUrl(first || cover || null);
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
    <div style={{ width: 56, height: 56, borderRadius: 6, overflow: 'hidden', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {loading ? (
        <span style={{ color: '#999', fontSize: 12 }}>...</span>
      ) : url ? (
        <img src={url} alt="cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{ color: '#ccc', fontSize: 12 }}>无图</span>
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
      const response = await api.get<any>('/data-center/stats');
      const result = response as any;
      if (result.code === 200) {
        const d = result.data || {};
        setStats({
          styleCount: d.styleCount ?? 0,
          materialCount: d.materialCount ?? 0,
          productionCount: d.productionCount ?? 0
        });
      } else {
        message.error(result.message || '获取资料中心统计失败');
      }
    } catch (error: any) {
      message.error(error?.message || '获取资料中心统计失败');
    }
  };

  const fetchStyles = async () => {
    setLoading(true);
    try {
      const response = await api.get<any>('/style/info/list', { params: queryParams });
      const result = response as any;
      if (result.code === 200) {
        setStyles(result.data.records || []);
        setTotal(result.data.total || 0);
      } else {
        message.error(result.message || '获取款号列表失败');
      }
    } catch (error: any) {
      message.error(error?.message || '获取款号列表失败');
    } finally {
      setLoading(false);
    }
  };

  const buildProductionSheetHtml = (payload: any) => {
    const style = payload?.style || {};
    const bomList = Array.isArray(payload?.bomList) ? payload.bomList : [];
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

    const esc = (v: any) => String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const formatMaterialType = (v: any) => {
      const type = String(v || '').trim();
      if (type === 'fabricA') return '面料A';
      if (type === 'fabricB') return '面料B';
      if (type === 'fabricC') return '面料C';
      if (type === 'fabricD') return '面料D';
      if (type === 'fabricE') return '面料E';
      if (type === 'liningA') return '里料A';
      if (type === 'liningB') return '里料B';
      if (type === 'liningC') return '里料C';
      if (type === 'liningD') return '里料D';
      if (type === 'liningE') return '里料E';
      if (type === 'accessoryA') return '辅料A';
      if (type === 'accessoryB') return '辅料B';
      if (type === 'accessoryC') return '辅料C';
      if (type === 'accessoryD') return '辅料D';
      if (type === 'accessoryE') return '辅料E';
      if (type === 'lining') return '里料';
      if (type === 'accessory') return '辅料';
      if (type === 'fabric') return '面料';
      return type;
    };

    const sizeNames = Array.from(new Set(sizeList.map((s: any) => String(s.sizeName || '').trim()).filter(Boolean)));
    const partNames = Array.from(new Set(sizeList.map((s: any) => String(s.partName || '').trim()).filter(Boolean)));
    const sizeCellMap: Record<string, any> = {};
    const partMethodMap: Record<string, string> = {};
    for (const row of sizeList) {
      const key = `${String(row.partName || '').trim()}__${String(row.sizeName || '').trim()}`;
      sizeCellMap[key] = row;
      const part = String(row.partName || '').trim();
      if (part && partMethodMap[part] == null) {
        partMethodMap[part] = String(row.measureMethod || '').trim();
      }
    }

    const bomRows = bomList.map((b: any) => {
      const cells = [
        esc(formatMaterialType(b.materialType || '')),
        esc(b.materialCode || ''),
        esc(b.materialName || ''),
        esc(b.color || ''),
        esc(b.size || ''),
        esc(b.specification || ''),
        esc(b.unit || ''),
        esc(b.usageAmount || ''),
        esc(b.lossRate || ''),
        esc(b.supplier || ''),
        esc(b.remark || ''),
      ];
      return `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
    }).join('');

    const sizeHeader = `<tr><th>部位(cm)</th><th>度量方式</th>${sizeNames.map((s) => `<th>${esc(s)}</th>`).join('')}</tr>`;
    const sizeRows = (partNames as string[]).map((part) => {
      const partKey = String(part);
      const tds = sizeNames.map((sn) => {
        const key = `${partKey}__${sn}`;
        const cell = sizeCellMap[key];
        const v = cell?.standardValue != null ? `${cell.standardValue}${cell?.tolerance != null ? ` ±${cell.tolerance}` : ''}` : '';
        return `<td>${esc(v)}</td>`;
      }).join('');
      return `<tr><td>${esc(partKey)}</td><td>${esc(partMethodMap[partKey] || '')}</td>${tds}</tr>`;
    }).join('');

    const coverFromAttachments = attachments.find((a: any) => String(a?.fileType || '').includes('image'))?.fileUrl;
    const coverUrl = resolveUrl(style.cover || coverFromAttachments || '');

    const attachmentRows = attachments.map((a: any) => {
      const url = esc(resolveUrl(a.fileUrl || ''));
      const name = esc(a.fileName || '');
      const type = esc(a.fileType || '');
      return `<li><a href="${url}" target="_blank" rel="noreferrer">${name}</a>${type ? ` <span class="muted">(${type})</span>` : ''}</li>`;
    }).join('');

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>生产制单-${esc(style.styleNo || '')}</title>
  <style>
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
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid rgba(0,0,0,0.10); padding: 6px 8px; vertical-align: top; }
    th { background: rgba(0,0,0,0.03); text-align: left; }
    .k { width: 240px; background: rgba(0,0,0,0.02); }
    @media print {
      .no-print { display: none; }
      .page { padding: 0; }
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
          <div>品类：${esc(style.category || '')}</div>
          <div>季节：${esc(style.season || '')}</div>
          <div>颜色：${esc(style.color || '')}</div>
          <div>码数：${esc(style.size || '')}</div>
          <div class="muted" style="grid-column: 1 / -1;">生产要求：${esc(style.description || '')}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">BOM（面辅料）</div>
      <table>
        <thead>
          <tr>
            <th>面料辅料类型</th><th>物料编码</th><th>物料名称</th><th>颜色</th><th>尺码</th><th>规格</th><th>单位</th><th>用量</th><th>损耗%</th><th>供应商</th><th>备注</th>
          </tr>
        </thead>
        <tbody>
          ${bomRows || ''}
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

    <div class="section">
      <div class="section-title">附件</div>
      <ul>
        ${attachmentRows || ''}
      </ul>
    </div>
  </div>
</body>
</html>`;
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
      const res = await api.get<any>('/data-center/production-sheet', { params: { styleNo: style.styleNo } });
      const result = res as any;
      if (result.code !== 200) {
        message.error(result.message || '获取生产制单失败');
        return;
      }
      const html = buildProductionSheetHtml(result.data);
      downloadFile(`生产制单-${style.styleNo}.html`, html, 'text/html;charset=utf-8');
      message.success('已下载生产制单');
    } catch (e: any) {
      message.error(e?.message || '下载失败');
    }
  };

  const printProductionSheet = async (style: StyleInfo) => {
    try {
      const res = await api.get<any>('/data-center/production-sheet', { params: { styleNo: style.styleNo } });
      const result = res as any;
      if (result.code !== 200) {
        message.error(result.message || '获取生产制单失败');
        return;
      }
      const html = buildProductionSheetHtml(result.data);
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
    } catch (e: any) {
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
        render: (_: any, record: StyleInfo) => <AttachmentThumb styleId={(record as any).id} cover={(record as any).cover || null} />
      },
      { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 140 },
      { title: '款名', dataIndex: 'styleName', key: 'styleName', ellipsis: true },
      { title: '品类', dataIndex: 'category', key: 'category', width: 140 },
      {
        title: '附件',
        key: 'attachments',
        width: 100,
        render: (_: any, record: StyleInfo) => (
          <StyleAttachmentsButton styleId={(record as any).id} styleNo={(record as any).styleNo} modalTitle={`附件（${(record as any).styleNo}）`} />
        )
      },
      {
        title: '操作',
        key: 'action',
        width: 260,
        render: (_: any, record: StyleInfo) => (
          <Space>
            <Button size="small" onClick={() => downloadProductionSheet(record)}>下载生产制单</Button>
            <Button size="small" onClick={() => printProductionSheet(record)}>打印制单</Button>
          </Space>
        )
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
          rowKey={(r) => String((r as any).id ?? r.styleNo)}
          columns={columns as any}
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
