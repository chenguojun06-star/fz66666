/**
 * 通用样衣/订单打印预览组件
 * 支持选择性打印：基本信息、尺寸表、生产制单、BOM表、工序表、纸样附件等
 * 可在样衣开发、下单管理、大货生产等页面复用
 */
import React, { useEffect, useState } from 'react';
import { Checkbox, Button, Space, Spin, Tag, QRCode } from 'antd';

import api from '@/utils/api';
import { sortSizeNames } from '@/utils/api/size';
import ResizableTable from '@/components/common/ResizableTable';
import { formatDateTime } from '@/utils/datetime';
import { getMaterialTypeLabel } from '@/utils/materialType';
import { toCategoryCn } from '@/utils/styleCategory';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import StandardModal from '@/components/common/StandardModal';
import { getStyleInfoByRef } from '@/services/style/styleApi';
import { message } from '@/utils/antdStatic';

/** 季节英文→中文映射 */
const toSeasonCn = (v: unknown): string => {
  const raw = String(v ?? '').trim();
  if (!raw) return '-';
  const upper = raw.toUpperCase();
  const map: Record<string, string> = {
    SPRING: '春季', SUMMER: '夏季', AUTUMN: '秋季', FALL: '秋季', WINTER: '冬季',
    SPRING_SUMMER: '春夏', AUTUMN_WINTER: '秋冬',
  };
  return map[upper] || raw;
};

// 打印选项类型
export interface PrintOptions {
  basicInfo: boolean;    // 基本信息
  sizeTable: boolean;    // 尺寸表
  bomTable: boolean;     // BOM表
  processTable: boolean; // 工序表
  productionSheet: boolean; // 生产制单
  attachments: boolean;  // 纸样附件
}

// 默认打印选项
export const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  basicInfo: true,
  sizeTable: true,
  bomTable: true,
  processTable: true,
  productionSheet: true,
  attachments: false,
};

// 组件属性
export interface StylePrintModalProps {
  visible: boolean;
  onClose: () => void;
  /** 样衣ID */
  styleId?: string | number;
  /** 订单ID（大货生产使用） */
  orderId?: string;
  /** 订单号（大货生产使用，如 PO20260211001） */
  orderNo?: string;
  /** 款号 */
  styleNo?: string;
  /** 款名 */
  styleName?: string;
  /** 封面图 */
  cover?: string;
  /** 颜色 */
  color?: string;
  /** 数量（样衣数量或订单数量） */
  quantity?: number;
  /** 分类 */
  category?: string;
  /** 季节 */
  season?: string;
  /** 打印模式：sample(样衣)、order(下单)、production(大货生产) */
  mode?: 'sample' | 'order' | 'production';
  /** 额外的基本信息 */
  extraInfo?: Record<string, any>;
  /** 码数明细（大货生产使用） */
  sizeDetails?: Array<{ color: string; size: string; quantity: number }>;
}

// 打印数据类型
interface PrintData {
  sizes: any[];
  bom: any[];
  process: any[];
  attachments: any[];
  productionSheet: any;
}

const StylePrintModal: React.FC<StylePrintModalProps> = ({
  visible,
  onClose,
  styleId,
  orderId,
  orderNo,
  styleNo = '',
  styleName = '',
  cover,
  color,
  quantity,
  category,
  season,
  mode = 'sample',
  extraInfo = {},
  sizeDetails = [],
}) => {
  const [options, setOptions] = useState<PrintOptions>(DEFAULT_PRINT_OPTIONS);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false); // 展开/收起状态
  const [resolvedCover, setResolvedCover] = useState<string | null>(cover || null);
  const [data, setData] = useState<PrintData>({
    sizes: [],
    bom: [],
    process: [],
    attachments: [],
    productionSheet: null,
  });

  // 当外部 cover 变化时同步
  useEffect(() => {
    setResolvedCover(cover || null);
  }, [cover]);

  useEffect(() => {
    if (!visible || !styleId) return;
    const loadData = async () => {
      setLoading(true);
      try {
        const newData: PrintData = {
          sizes: [],
          bom: [],
          process: [],
          attachments: [],
          productionSheet: null,
        };

        // 并行加载数据
        const promises: Promise<any>[] = [];

        // 款式详情（获取生产要求 description）
        promises.push(
          getStyleInfoByRef(styleId, styleNo)
            .then((styleInfo) => {
              if (styleInfo) newData.productionSheet = styleInfo;
            })
            .catch(() => {})
        );

        // 尺寸表
        promises.push(
          api.get('/style/size/list', { params: { styleId } })
            .then(res => { if (res.code === 200) newData.sizes = res.data || []; })
            .catch(() => {})
        );

        // BOM表
        promises.push(
          api.get('/style/bom/list', { params: { styleId } })
            .then(res => { if (res.code === 200) newData.bom = res.data || []; })
            .catch(() => {})
        );

        // 工序表
        promises.push(
          api.get('/style/process/list', { params: { styleId } })
            .then(res => { if (res.code === 200) newData.process = res.data || []; })
            .catch(() => {})
        );

        // 纸样附件
        promises.push(
          api.get('/style/attachment/list', { params: { styleId } })
            .then(res => {
              if (res.code === 200) {
                // 筛选纸样类型
                newData.attachments = (res.data || []).filter((item: any) => {
                  const bizType = String(item.bizType || '');
                  return bizType.startsWith('pattern') || bizType === 'size_table' || bizType === 'production_sheet';
                });
              }
            })
            .catch(() => {})
        );

        await Promise.all(promises);
        setData(newData);

        // 如果没有外部传入的封面，从款式详情或附件中获取
        if (!cover) {
          const styleData = newData.productionSheet as any;
          if (styleData?.cover) {
            setResolvedCover(styleData.cover);
          } else {
            // 从附件中找图片类型作为封面
            try {
              const attachRes = await api.get<{ code: number; data: any[] }>('/style/attachment/list', { params: { styleId } });
              if (attachRes.code === 200) {
                const images = (attachRes.data || []).filter((f: any) => String(f.fileType || '').includes('image'));
                if (images.length > 0) {
                  setResolvedCover((images[0] as any)?.fileUrl || null);
                }
              }
            } catch {
              // ignore
            }
          }
        }
      } catch (error) {
        console.error('加载打印数据失败:', error);
        message.error('加载打印数据失败');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [visible, styleId]);

  // 执行打印 - 使用新窗口方式确保内容正确显示
  const handlePrint = () => {
    // 检查是否至少选择了一项
    const hasSelection = Object.values(options).some(v => v);
    if (!hasSelection) {
      message.warning('请至少选择一项打印内容');
      return;
    }

    // 获取打印内容
    const printContent = document.getElementById('style-print-content');
    if (!printContent) {
      message.error('无法获取打印内容');
      return;
    }

    // 获取当前用户信息
    const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
    const printerName = userInfo.name || userInfo.username || '未知用户';
    const printerAccount = userInfo.username || '';

    // 构建页眉信息
    const headerInfo = [
      styleNo ? `款号: ${styleNo}` : '',
      styleName ? `款名: ${styleName}` : '',
      color ? `颜色: ${color}` : '',
      (orderNo || orderId) ? `订单号: ${orderNo || orderId}` : '',
    ].filter(Boolean).join('  |  ');

    const printDate = new Date().toLocaleString('zh-CN');
    const printerInfo = printerAccount ? `打印人: ${printerName} (${printerAccount})` : `打印人: ${printerName}`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>打印预览 - ${styleNo}</title>
        <style>
          @page {
            margin: 15mm 10mm 12mm 10mm;
            size: A4;
          }

          /* 页眉 - 每页顶部显示 */
          @media print {
            .print-header {
              position: fixed;
              top: 0;
              left: 0;
              right: 0;
              height: 25px;
              background: #fff;
              border-bottom: 1px solid #e8e8e8;
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 10px;
              color: #666;
              padding: 0 5mm;
              z-index: 1000;
            }
            .print-header-left { font-weight: 500; }
            .print-header-right { color: #999; }

            /* 页脚 - 每页底部显示 */
            .print-footer {
              position: fixed;
              bottom: 0;
              left: 0;
              right: 0;
              height: 20px;
              background: #fff;
              border-top: 1px solid #e8e8e8;
              display: flex;
              justify-content: center;
              align-items: center;
              font-size: 9px;
              color: #999;
              z-index: 1000;
            }

            /* 内容区域 */
            .print-body {
              margin-top: 30px;
              margin-bottom: 25px;
            }
          }

          /* 基础样式 */
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
            font-size: 12px;
            line-height: 1.6;
            color: #333;
            padding: 20px;
            background: #fff;
          }

          /* 打印内容样式 */
          .print-section {
            margin-bottom: 20px;
            page-break-inside: avoid;
          }
          .print-section-title {
            font-size: 14px;
            font-weight: 600;
            color: #1a1a1a;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 2px solid #1890ff;
          }

          /* 表格样式 */
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
            margin-bottom: 16px;
          }
          th, td {
            border: 1px solid #d9d9d9;
            padding: 8px 10px;
            text-align: left;
            vertical-align: top;
          }
          th {
            background: #fafafa;
            font-weight: 600;
            color: #262626;
          }
          tr:nth-child(even) {
            background: #fafafa;
          }

          /* 信息网格 */
          .info-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px 24px;
            margin-bottom: 16px;
          }
          .info-item {
            display: flex;
            gap: 8px;
          }
          .info-label {
            color: #666;
            min-width: 80px;
          }
          .info-value {
            color: #333;
            font-weight: 500;
          }

          /* 图片样式 */
          .attachment-image {
            max-width: 200px;
            max-height: 200px;
            border: 1px solid #e8e8e8;
            border-radius: 4px;
            margin: 4px;
          }

          /* 二维码样式 */
          .qr-code {
            text-align: center;
            margin: 20px 0;
          }
          .qr-code img {
            width: 120px;
            height: 120px;
          }

          /* 隐藏打印按钮 */
          @media print {
            .no-print {
              display: none !important;
            }
          }
        </style>
      </head>
      <body>
        <!-- 固定页眉 -->
        <div class="print-header">
          <span class="print-header-left">${headerInfo}</span>
          <span class="print-header-right">${printerInfo}  |  打印时间: ${printDate}</span>
        </div>
        <!-- 内容区域 -->
        <div class="print-body">
          ${printContent.innerHTML}
        </div>
        <!-- 固定页脚 -->
        <div class="print-footer">
          打印预览 - ${styleNo}
        </div>
      </body>
      </html>
    `;

    // 使用隐藏 iframe 打印，避免打开新窗口
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    const printDoc = iframe.contentWindow?.document;
    if (!printDoc) {
      iframe.remove();
      message.error('打印失败，请检查浏览器设置');
      return;
    }

    printDoc.open();
    printDoc.write(htmlContent);
    printDoc.close();

    const triggerPrint = () => {
      const win = iframe.contentWindow;
      if (!win) return;
      win.focus();
      win.print();
      setTimeout(() => iframe.remove(), 1000);
    };

    if (iframe.contentWindow?.document?.readyState === 'complete') {
      triggerPrint();
    } else {
      iframe.onload = triggerPrint;
    }
  };

  // 获取模式标题
  const getModeTitle = () => {
    switch (mode) {
      case 'sample': return '样衣';
      case 'order': return '下单';
      case 'production': return '生产';
      default: return '';
    }
  };

  // 二维码内容
  const isPatternPrint = extraInfo?.isPattern === true;
  const qrValue = JSON.stringify(
    isPatternPrint
      ? {
          type: 'pattern',
          id: String(orderId || styleId || '').trim(),
          styleNo,
          styleName,
          color,
        }
      : {
          type: mode === 'production' ? 'order' : 'style',
          styleNo,
          styleName,
          orderId,
          orderNo: orderNo || '',
        }
  );

  return (
    <StandardModal
      title={`打印预览 - ${styleNo}`}
      open={visible}
      onCancel={onClose}
      size="lg"
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" onClick={handlePrint}>
            打印
          </Button>
        </Space>
      }
    >
      <Spin spinning={loading}>
        {/* 打印选项 - 置顶 */}
        <div style={{
          marginBottom: 16,
          padding: '12px 16px',
          background: '#f0f2f5',
          borderRadius: 12,
          border: '1px solid var(--color-border)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 600, color: '#1f2937', whiteSpace: 'nowrap' }}>📋 选择打印内容：</div>
              <Checkbox.Group
                value={Object.keys(options).filter(k => options[k as keyof PrintOptions])}
                onChange={(values) => {
                  setOptions({
                    basicInfo: values.includes('basicInfo'),
                    sizeTable: values.includes('sizeTable'),
                    bomTable: values.includes('bomTable'),
                    processTable: values.includes('processTable'),
                    productionSheet: values.includes('productionSheet'),
                    attachments: values.includes('attachments'),
                  });
                }}
                style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px' }}
              >
                <Checkbox value="basicInfo">基本信息</Checkbox>
                <Checkbox value="sizeTable">尺寸表</Checkbox>
                <Checkbox value="bomTable">BOM表</Checkbox>
                <Checkbox value="processTable">工序表</Checkbox>
                <Checkbox value="productionSheet">生产制单</Checkbox>
                <Checkbox value="attachments">纸样附件</Checkbox>
              </Checkbox.Group>
            </div>
            <Button
              size="small"
              type={expanded ? 'default' : 'primary'}
              onClick={() => setExpanded(!expanded)}
              style={{ fontSize: "var(--font-size-xs)", flexShrink: 0 }}
            >
              {expanded ? '▲ 收起预览' : '▼ 展开预览'}
            </Button>
          </div>
        </div>

        {/* 内容预览区域 - 可展开/收起 */}
        {expanded && (
          <div className="style-print-content" id="style-print-content" style={{ background: 'var(--color-bg-base)', padding: 20, border: '1px solid var(--color-border)', borderRadius: 12 }}>
            {/* 预览样式 */}
            <style>{`
              .print-section { margin-bottom: 24px; }
              .print-section-title {
                font-size: 16px;
                font-weight: 600;
                margin-bottom: 12px;
                padding-bottom: 8px;
                border-bottom: 2px solid #1890ff;
              }
            `}</style>

          {/* 基本信息 */}
          {options.basicInfo && (
            <div className="print-section">
              <div style={{
                display: 'flex',
                gap: 24,
                padding: 16,
                borderBottom: '2px solid #d9d9d9',
                background: 'var(--color-bg-container)',
                borderRadius: 8,
              }}>
                {/* 封面图 */}
                {resolvedCover && (
                  <div style={{ flexShrink: 0, width: 120, height: 120 }}>
                    <img
                      src={getFullAuthedFileUrl(resolvedCover)}
                      alt={styleNo}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: 8,
                        border: '1px solid #e8e8e8'
                      }}
                    />
                  </div>
                )}

                {/* 基本信息 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "var(--font-size-xxl)", fontWeight: 600, marginBottom: 8 }}>
                    {styleNo} - {styleName}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px', fontSize: "var(--font-size-base)" }}>
                    {color && <div><span style={{ color: 'var(--color-text-secondary)' }}>颜色：</span><strong>{color}</strong></div>}
                    {quantity !== undefined && (
                      <div>
                        <span style={{ color: 'var(--color-text-secondary)' }}>{getModeTitle()}数量：</span>
                        <strong>{quantity}</strong>
                      </div>
                    )}
                    {category && <div><span style={{ color: 'var(--color-text-secondary)' }}>分类：</span><strong>{toCategoryCn(category)}</strong></div>}
                    {season && <div><span style={{ color: 'var(--color-text-secondary)' }}>季节：</span><strong>{toSeasonCn(season)}</strong></div>}
                    {/* 额外信息 */}
                    {Object.entries(extraInfo).map(([key, value]) => {
                      if (!value) return null;
                      // 自动格式化 ISO 日期字符串（如 2026-02-21T10:02:36 → 2026-02-21 10:02）
                      const display = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)
                        ? formatDateTime(value)
                        : String(value);
                      return <div key={key}><span style={{ color: 'var(--color-text-secondary)' }}>{key}：</span><strong>{display}</strong></div>;
                    })}
                  </div>
                </div>

                {/* 二维码 */}
                <div style={{ flexShrink: 0, textAlign: 'center' }}>
                  <QRCode value={qrValue} size={160} type="svg" />
                </div>
              </div>

              {/* 打印时间 */}
              <div style={{ textAlign: 'right', marginTop: 8, color: 'var(--color-text-tertiary)', fontSize: "var(--font-size-xs)" }}>
                打印时间：{formatDateTime(new Date())}
              </div>
            </div>
          )}

          {/* 码数明细（横向布局：颜色为列头） */}
          {options.basicInfo && sizeDetails && sizeDetails.length > 0 && (() => {
            // 提取所有颜色和尺码
            const colors = [...new Set(sizeDetails.map(d => d.color))];
            const sizes = [...new Set(sizeDetails.map(d => d.size))];

            // 构建数据映射
            const dataMap: Record<string, Record<string, number>> = {};
            sizeDetails.forEach(d => {
              if (!dataMap[d.size]) dataMap[d.size] = {};
              dataMap[d.size][d.color] = (dataMap[d.size][d.color] || 0) + d.quantity;
            });

            // 计算每个颜色的合计
            const colorTotals: Record<string, number> = {};
            colors.forEach(c => {
              colorTotals[c] = sizeDetails.filter(d => d.color === c).reduce((sum, d) => sum + d.quantity, 0);
            });
            const grandTotal = sizeDetails.reduce((sum, d) => sum + d.quantity, 0);

            return (
              <div className="print-section">
                <div className="print-section-title">📊 码数明细</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: "var(--font-size-sm)" }}>
                  <thead>
                    <tr style={{ background: 'var(--color-bg-container)' }}>
                      <th style={{ border: '1px solid var(--color-border)', padding: '6px 8px', textAlign: 'left', width: 60 }}>颜色</th>
                      {colors.map(color => (
                        <th key={color} style={{ border: '1px solid var(--color-border)', padding: '6px 8px', textAlign: 'center' }}>{color}</th>
                      ))}
                      <th style={{ border: '1px solid var(--color-border)', padding: '6px 8px', textAlign: 'center', width: 80, background: '#e6f7ff' }}>合计</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* 尺码行 */}
                    <tr>
                      <td style={{ border: '1px solid var(--color-border)', padding: '6px 8px', fontWeight: 600 }}>尺码</td>
                      {colors.map(color => (
                        <td key={color} style={{ border: '1px solid var(--color-border)', padding: '6px 8px', textAlign: 'center' }}>
                          {sizes.join(' / ')}
                        </td>
                      ))}
                      <td style={{ border: '1px solid var(--color-border)', padding: '6px 8px', textAlign: 'center', background: '#e6f7ff' }}>-</td>
                    </tr>
                    {/* 数量行 */}
                    <tr>
                      <td style={{ border: '1px solid var(--color-border)', padding: '6px 8px', fontWeight: 600 }}>数量</td>
                      {colors.map(color => (
                        <td key={color} style={{ border: '1px solid var(--color-border)', padding: '6px 8px', textAlign: 'center' }}>
                          {sizes.map(size => dataMap[size]?.[color] || 0).join(' / ')}
                        </td>
                      ))}
                      <td style={{ border: '1px solid var(--color-border)', padding: '6px 8px', textAlign: 'center', fontWeight: 600, background: '#e6f7ff' }}>{grandTotal}</td>
                    </tr>
                    {/* 小计行 */}
                    <tr style={{ background: 'var(--color-bg-container)' }}>
                      <td style={{ border: '1px solid var(--color-border)', padding: '6px 8px', fontWeight: 600 }}>小计</td>
                      {colors.map(color => (
                        <td key={color} style={{ border: '1px solid var(--color-border)', padding: '6px 8px', textAlign: 'center', fontWeight: 600 }}>{colorTotals[color]}</td>
                      ))}
                      <td style={{ border: '1px solid var(--color-border)', padding: '6px 8px', textAlign: 'center', fontWeight: 700, background: '#e6f7ff', color: 'var(--color-primary)' }}>{grandTotal}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* 尺寸表 — 分组+参考图布局（与纸样开发Tab保持一致） */}
          {options.sizeTable && data.sizes.length > 0 && (() => {
            // ─── 分组辅助（与 StyleSizeTab 同逻辑）───
            const _inferGroup = (pn: string): string => {
              const n = String(pn || '').replace(/\s+/g, '').toLowerCase();
              if (!n) return '其他区';
              const upper = ['衣长','胸围','肩宽','袖长','袖口','袖肥','领围','领宽','领深','门襟','胸宽','摆围','下摆','前长','后长','前胸','后背','袖窿'];
              const lower = ['裤长','腰围','臀围','前浪','后浪','脚口','裤口','腿围','小腿围','大腿围','膝围','坐围','裆','裙长','裙摆'];
              if (upper.some(k => n.includes(k))) return '上装区';
              if (lower.some(k => n.includes(k))) return '下装区';
              return '其他区';
            };
            const _resolveGroup = (gName?: string, pName?: string) => {
              const g = String(gName || '').trim();
              return g || _inferGroup(String(pName || ''));
            };

            // ─── 收集所有尺码并排序 ───
            const sizeNames = [...new Set(data.sizes.map((s: any) => s.sizeName).filter(Boolean))];
            const sortedSizeNames = sortSizeNames([...sizeNames]);

            // ─── 按 sort 字段预排序，与 Tab 保持一致 ───
            const sortedSizes = [...data.sizes].sort((a: any, b: any) => (a.sort || 0) - (b.sort || 0));

            // ─── 构建部位矩阵行 ───
            type PrintRow = { resolvedGroupName: string; partName: string; measureMethod: string; tolerance: number | null; cells: Record<string, number | null>; };
            const partMap = new Map<string, PrintRow>();
            const groupOrder: string[] = [];
            const partOrderPerGroup = new Map<string, string[]>();

            sortedSizes.forEach((s: any) => {
              const rg = _resolveGroup(s.groupName, s.partName);
              const pk = `${rg}::${s.partName}`;
              if (!partMap.has(pk)) {
                partMap.set(pk, { resolvedGroupName: rg, partName: s.partName || '', measureMethod: s.measureMethod || '', tolerance: null, cells: {} });
                if (!groupOrder.includes(rg)) { groupOrder.push(rg); partOrderPerGroup.set(rg, []); }
                partOrderPerGroup.get(rg)!.push(s.partName || '');
              }
              const row = partMap.get(pk)!;
              row.cells[s.sizeName] = s.standardValue != null ? Number(s.standardValue) : null;
              if (row.tolerance === null && s.tolerance != null) row.tolerance = Number(s.tolerance);
            });

            // ─── 每分组取首条有图的记录作参考图（最多2张）───
            const groupImages = new Map<string, string[]>();
            sortedSizes.forEach((s: any) => {
              if (!s.imageUrls) return;
              const rg = _resolveGroup(s.groupName, s.partName);
              if (!groupImages.has(rg)) {
                try { const p: string[] = JSON.parse(s.imageUrls); if (p.length) groupImages.set(rg, p.slice(0, 2)); } catch { /* skip */ }
              }
            });

            // ─── 构建扁平展示行（含 rowspan 元数据）───
            type FlatRow = PrintRow & { key: string; isGroupStart: boolean; groupSpan: number; chunkImgs: string[]; isImgStart: boolean; imgSpan: number; };
            const flatRows: FlatRow[] = [];
            groupOrder.forEach(rg => {
              const parts = partOrderPerGroup.get(rg) || [];
              const imgs = groupImages.get(rg) || [];
              parts.forEach((pn, i) => {
                flatRows.push({ ...partMap.get(`${rg}::${pn}`)!, key: `${rg}::${pn}`, isGroupStart: i === 0, groupSpan: i === 0 ? parts.length : 0, chunkImgs: i === 0 ? imgs : [], isImgStart: i === 0, imgSpan: i === 0 ? parts.length : 0 });
              });
            });

            const thS: React.CSSProperties = { border: '1px solid var(--color-border)', padding: '6px 8px', textAlign: 'center', background: 'var(--color-bg-container)', whiteSpace: 'nowrap' as const };
            const tdS: React.CSSProperties = { border: '1px solid var(--color-border)', padding: '6px 8px', verticalAlign: 'middle', fontSize: 'var(--font-size-xs)' };

            return (
              <div className="print-section">
                <div className="print-section-title">📏 尺寸表</div>
                {/* table-layout:fixed + 只固定图片/分组列宽，其余列自动均分剩余空间 */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-xs)', tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <th style={{ ...thS, width: 160 }}>参考图</th>
                      <th style={{ ...thS, width: 60 }}>分组</th>
                      <th style={{ ...thS, width: 60, textAlign: 'left' }}>部位(cm)</th>
                      <th style={{ ...thS, width: 100 }}>度量方式</th>
                      {sortedSizeNames.map((sn: string) => <th key={sn} style={{ ...thS, width: 60 }}>{sn}</th>)}
                      <th style={{ ...thS, width: 60 }}>公差(+/-)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flatRows.map(row => (
                      <tr key={row.key}>
                        {row.isImgStart && (
                          <td rowSpan={row.imgSpan} style={{ ...tdS, verticalAlign: 'top', textAlign: 'center', padding: 6 }}>
                            {row.chunkImgs.length > 0
                              ? <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch' }}>
                                  {row.chunkImgs.map((url: string) => (
                                    <img key={url} src={getFullAuthedFileUrl(url)} style={{ width: '100%', height: row.chunkImgs.length > 1 ? 120 : 220, objectFit: 'contain', borderRadius: 8, border: '1px solid #eee', background: '#fff', padding: 4, boxSizing: 'border-box' as const }} />
                                  ))}
                                </div>
                              : <span style={{ color: '#ccc', fontSize: 11 }}>无图</span>
                            }
                          </td>
                        )}
                        {row.isGroupStart && (
                          <td rowSpan={row.groupSpan} style={{ ...tdS, verticalAlign: 'top', textAlign: 'center', fontWeight: 600 }}>
                            {row.resolvedGroupName}
                          </td>
                        )}
                        <td style={tdS}>{row.partName}</td>
                        <td style={{ ...tdS, textAlign: 'center' }}>{row.measureMethod || '平量'}</td>
                        {sortedSizeNames.map((sn: string) => (
                          <td key={sn} style={{ ...tdS, textAlign: 'center' }}>{row.cells[sn] != null ? row.cells[sn] : '-'}</td>
                        ))}
                        <td style={{ ...tdS, textAlign: 'center' }}>{row.tolerance != null ? `±${row.tolerance}` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* BOM表 */}
          {options.bomTable && data.bom.length > 0 && (
            <div className="print-section">
              <div className="print-section-title">📦 BOM物料清单</div>
              <ResizableTable
                storageKey="print-bom"
                className="print-table"
                dataSource={data.bom}
                rowKey="id"
                size="small"
                pagination={false}
                bordered
                columns={[
                  { title: '物料类型', dataIndex: 'materialType', key: 'materialType', width: 100,
                    render: (v: unknown) => getMaterialTypeLabel(v) },
                  { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 150 },
                  { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 120 },
                  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 100 },
                  { title: '单位', dataIndex: 'unit', key: 'unit', width: 60 },
                  { title: '用量', dataIndex: 'quantity', key: 'quantity', width: 80, align: 'right' as const },
                  { title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 80, align: 'right' as const,
                    render: (v: number) => v ? `¥${Number(v).toFixed(2)}` : '-' },
                  { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
                  { title: '图片', dataIndex: 'imageUrls', key: 'image', width: 90,
                    render: (v: string) => {
                      const imgs: string[] = (() => { try { return JSON.parse(v || '[]'); } catch { return []; } })();
                      if (!imgs.length) return null;
                      return (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {imgs.map((url: string) => (
                            <img key={url} src={getFullAuthedFileUrl(url)} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 3, border: '1px solid #eee' }} />
                          ))}
                        </div>
                      );
                    }
                  },
                ]}
              />
            </div>
          )}

          {/* 工序表 */}
          {options.processTable && data.process.length > 0 && (
            <div className="print-section">
              <div className="print-section-title">⚙️ 工序表</div>
              <ResizableTable
                storageKey="print-process"
                className="print-table"
                dataSource={data.process}
                rowKey="id"
                size="small"
                pagination={false}
                bordered
                columns={[
                  { title: '序号', dataIndex: 'sortOrder', key: 'sortOrder', width: 60 },
                  { title: '工序名称', dataIndex: 'processName', key: 'processName', width: 150 },
                  { title: '工序编码', dataIndex: 'processCode', key: 'processCode', width: 100 },
                  { title: '工时(秒)', dataIndex: 'standardTime', key: 'standardTime', width: 80, align: 'right' as const },
                  { title: '单价', dataIndex: 'price', key: 'price', width: 80, align: 'right' as const,
                    render: (v: number) => v ? `¥${Number(v).toFixed(2)}` : '-' },
                  { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
                ]}
              />
            </div>
          )}

          {/* 生产制单（生产要求） */}
          {options.productionSheet && (() => {
            const description = data.productionSheet?.description || '';
            const sampleReviewStatus = String((data.productionSheet as any)?.sampleReviewStatus || '').trim().toUpperCase();
            const sampleReviewComment = String((data.productionSheet as any)?.sampleReviewComment || '').trim();
            const sampleReviewer = String((data.productionSheet as any)?.sampleReviewer || '').trim();
            const sampleReviewTime = (data.productionSheet as any)?.sampleReviewTime;
            const reviewLabel =
              sampleReviewStatus === 'PASS' ? '通过'
                : sampleReviewStatus === 'REWORK' ? '需修改'
                  : sampleReviewStatus === 'REJECT' ? '不通过'
                    : sampleReviewStatus === 'PENDING' ? '待审核'
                      : '';
            // 将 description 拆分成多行
            const lines = description
              .split(/\r?\n/)
              .map((l: string) => String(l || '').replace(/^\s*\d+\s*[.、)）-]?\s*/, '').trim())
              .filter((l: string) => Boolean(l));
            // 固定15行
            const fixedLines = Array.from({ length: 15 }).map((_, i) => lines[i] || '');

            return (
              <div className="print-section">
                <div className="print-section-title">📋 生产要求</div>
                {(reviewLabel || sampleReviewComment || sampleReviewer || sampleReviewTime) && (
                  <div style={{ marginBottom: 10, border: '1px solid var(--color-border)', padding: '8px 10px', borderRadius: 6 }}>
                    <div style={{ marginBottom: 6, fontWeight: 600 }}>样衣审核</div>
                    <div style={{ fontSize: 12, lineHeight: '20px' }}>
                      <span>审核状态：{reviewLabel || '-'}</span>
                      <span style={{ marginLeft: 16 }}>审核人：{sampleReviewer || '-'}</span>
                      <span style={{ marginLeft: 16 }}>审核时间：{sampleReviewTime ? formatDateTime(sampleReviewTime) : '-'}</span>
                    </div>
                    {sampleReviewComment && (
                      <div style={{ marginTop: 4, fontSize: 12, whiteSpace: 'pre-wrap' }}>审核评语：{sampleReviewComment}</div>
                    )}
                  </div>
                )}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: "var(--font-size-xs)" }}>
                  <thead>
                    <tr style={{ background: 'var(--color-bg-container)' }}>
                      <th style={{ border: '1px solid var(--color-border)', padding: '6px 8px', width: 60, textAlign: 'center' }}>序号</th>
                      <th style={{ border: '1px solid var(--color-border)', padding: '6px 8px', textAlign: 'left' }}>内容</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fixedLines.map((line: string, idx: number) => (
                      <tr key={idx}>
                        <td style={{ border: '1px solid var(--color-border)', padding: '6px 8px', textAlign: 'center' }}>{idx + 1}</td>
                        <td style={{ border: '1px solid var(--color-border)', padding: '6px 8px', whiteSpace: 'pre-wrap', textAlign: 'left' }}>{line}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* 纸样附件 */}
          {options.attachments && data.attachments.length > 0 && (
            <div className="print-section">
              <div className="print-section-title">📎 纸样附件</div>
              <ResizableTable
                storageKey="print-attachments"
                className="print-table"
                dataSource={data.attachments}
                rowKey="id"
                size="small"
                pagination={false}
                bordered
                columns={[
                  { title: '类型', dataIndex: 'bizType', key: 'bizType', width: 120,
                    render: (t: string) => {
                      if (t === 'pattern' || t === 'pattern_final') return <Tag color="blue">原始纸样</Tag>;
                      if (t === 'pattern_grading' || t === 'pattern_grading_final') return <Tag color="green">放码纸样</Tag>;
                      if (t === 'size_table') return <Tag color="orange">尺寸表</Tag>;
                      if (t === 'production_sheet') return <Tag color="purple">生产制单</Tag>;
                      return <Tag>{t}</Tag>;
                    }
                  },
                  { title: '文件名', dataIndex: 'fileName', key: 'fileName', ellipsis: true },
                  { title: '上传时间', dataIndex: 'createTime', key: 'createTime', width: 160 },
                ]}
              />
            </div>
          )}

          {/* 无数据提示 */}
          {!loading && !options.basicInfo && data.sizes.length === 0 && data.bom.length === 0 &&
           data.process.length === 0 && data.attachments.length === 0 && (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--color-text-tertiary)' }}>
              暂无打印数据，请选择要打印的内容
            </div>
          )}
        </div>
        )}

        {/* 未展开时的提示 */}
        {!expanded && (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: 'var(--color-text-tertiary)',
            background: 'var(--color-bg-container)',
            borderRadius: 12,
            border: '1px dashed #d9d9d9'
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>👆</div>
            <div style={{ fontSize: "var(--font-size-base)" }}>点击"展开预览"按钮查看打印内容</div>
          </div>
        )}
      </Spin>
    </StandardModal>
  );
};

export default StylePrintModal;
