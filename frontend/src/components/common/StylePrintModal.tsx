/**
 * 通用样衣/订单打印预览组件
 * 支持选择性打印：基本信息、尺寸表、生产制单、BOM表、工序表、纸样附件等
 * 可在样衣开发、下单管理、大货生产等页面复用
 */
import React, { useEffect, useState } from 'react';
import { Checkbox, Button, Space, Spin, Table, Tag, message, QRCode, Image } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import api from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import { safePrint } from '@/utils/safePrint';
import ResizableModal from './ResizableModal';

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
  const [data, setData] = useState<PrintData>({
    sizes: [],
    bom: [],
    process: [],
    attachments: [],
    productionSheet: null,
  });

  // 加载打印数据
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
          api.get(`/style/info/${styleId}`)
            .then(res => { if (res.code === 200) newData.productionSheet = res.data || null; })
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

    // 创建新窗口并打印
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      message.error('无法打开打印窗口，请检查浏览器弹窗设置');
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
      orderId ? `订单号: ${orderId}` : '',
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

        <!-- 固定页脚 -->
        <div class="print-footer">
          服装供应链管理系统
        </div>

        <!-- 打印内容 -->
        <div class="print-body">
          ${printContent.innerHTML}
        </div>
      </body>
      </html>
    `;

    const success = safePrint(htmlContent, `打印预览 - ${styleNo}`);
    if (!success) {
      message.error('无法打开打印窗口，请检查浏览器弹窗设置');
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
  const qrValue = JSON.stringify({
    type: mode === 'production' ? 'order' : 'style',
    styleNo,
    styleName,
    orderId,
  });

  return (
    <ResizableModal
      title={`打印预览 - ${styleNo}`}
      open={visible}
      onCancel={onClose}
      width="60vw"
      initialHeight={600}
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" icon={<PrinterOutlined />} onClick={handlePrint}>
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
          borderRadius: 6,
          border: '1px solid #d9d9d9'
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
              style={{ fontSize: 12, flexShrink: 0 }}
            >
              {expanded ? '▲ 收起预览' : '▼ 展开预览'}
            </Button>
          </div>
        </div>

        {/* 内容预览区域 - 可展开/收起 */}
        {expanded && (
          <div className="style-print-content" id="style-print-content" style={{ background: '#fff', padding: 20, border: '1px solid #d9d9d9', borderRadius: 6 }}>
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
                background: '#fafafa',
                borderRadius: 4,
              }}>
                {/* 封面图 */}
                {cover && (
                  <div style={{ flexShrink: 0 }}>
                    <Image
                      src={cover}
                      alt={styleNo}
                      width={120}
                      height={120}
                      style={{ objectFit: 'cover', borderRadius: 4 }}
                      preview={false}
                    />
                  </div>
                )}

                {/* 基本信息 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
                    {styleNo} - {styleName}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px', fontSize: 14 }}>
                    {color && <div><span style={{ color: '#666' }}>颜色：</span><strong>{color}</strong></div>}
                    {quantity !== undefined && (
                      <div>
                        <span style={{ color: '#666' }}>{getModeTitle()}数量：</span>
                        <strong>{quantity}</strong>
                      </div>
                    )}
                    {category && <div><span style={{ color: '#666' }}>分类：</span><strong>{category}</strong></div>}
                    {season && <div><span style={{ color: '#666' }}>季节：</span><strong>{season}</strong></div>}
                    {/* 额外信息 */}
                    {Object.entries(extraInfo).map(([key, value]) => (
                      value && <div key={key}><span style={{ color: '#666' }}>{key}：</span><strong>{String(value)}</strong></div>
                    ))}
                  </div>
                </div>

                {/* 二维码 */}
                <div style={{ flexShrink: 0, textAlign: 'center' }}>
                  <QRCode value={qrValue} size={160} />
                </div>
              </div>

              {/* 打印时间 */}
              <div style={{ textAlign: 'right', marginTop: 8, color: '#999', fontSize: 12 }}>
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
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#fafafa' }}>
                      <th style={{ border: '1px solid #d9d9d9', padding: '6px 8px', textAlign: 'left', width: 60 }}>颜色</th>
                      {colors.map(color => (
                        <th key={color} style={{ border: '1px solid #d9d9d9', padding: '6px 8px', textAlign: 'center' }}>{color}</th>
                      ))}
                      <th style={{ border: '1px solid #d9d9d9', padding: '6px 8px', textAlign: 'center', width: 80, background: '#e6f7ff' }}>合计</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* 尺码行 */}
                    <tr>
                      <td style={{ border: '1px solid #d9d9d9', padding: '6px 8px', fontWeight: 600 }}>尺码</td>
                      {colors.map(color => (
                        <td key={color} style={{ border: '1px solid #d9d9d9', padding: '6px 8px', textAlign: 'center' }}>
                          {sizes.join(' / ')}
                        </td>
                      ))}
                      <td style={{ border: '1px solid #d9d9d9', padding: '6px 8px', textAlign: 'center', background: '#e6f7ff' }}>-</td>
                    </tr>
                    {/* 数量行 */}
                    <tr>
                      <td style={{ border: '1px solid #d9d9d9', padding: '6px 8px', fontWeight: 600 }}>数量</td>
                      {colors.map(color => (
                        <td key={color} style={{ border: '1px solid #d9d9d9', padding: '6px 8px', textAlign: 'center' }}>
                          {sizes.map(size => dataMap[size]?.[color] || 0).join(' / ')}
                        </td>
                      ))}
                      <td style={{ border: '1px solid #d9d9d9', padding: '6px 8px', textAlign: 'center', fontWeight: 600, background: '#e6f7ff' }}>{grandTotal}</td>
                    </tr>
                    {/* 小计行 */}
                    <tr style={{ background: '#fafafa' }}>
                      <td style={{ border: '1px solid #d9d9d9', padding: '6px 8px', fontWeight: 600 }}>小计</td>
                      {colors.map(color => (
                        <td key={color} style={{ border: '1px solid #d9d9d9', padding: '6px 8px', textAlign: 'center', fontWeight: 600 }}>{colorTotals[color]}</td>
                      ))}
                      <td style={{ border: '1px solid #d9d9d9', padding: '6px 8px', textAlign: 'center', fontWeight: 700, background: '#e6f7ff', color: '#1890ff' }}>{grandTotal}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* 尺寸表 */}
          {options.sizeTable && data.sizes.length > 0 && (() => {
            // 将扁平数据转换为部位×尺码的表格
            const sizeNames = [...new Set(data.sizes.map((s: any) => s.sizeName).filter(Boolean))];
            const partNames = [...new Set(data.sizes.map((s: any) => s.partName).filter(Boolean))];

            // 尺码排序
            const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '2XL', '3XL', '4XL', '5XL'];
            const sortedSizeNames = [...sizeNames].sort((a, b) => {
              const ai = sizeOrder.indexOf(a?.toUpperCase());
              const bi = sizeOrder.indexOf(b?.toUpperCase());
              if (ai !== -1 && bi !== -1) return ai - bi;
              if (ai !== -1) return -1;
              if (bi !== -1) return 1;
              return String(a).localeCompare(String(b));
            });

            // 构建数据映射 partName -> sizeName -> { standardValue, tolerance }
            const dataMap: Record<string, Record<string, any>> = {};
            const methodMap: Record<string, string> = {};
            data.sizes.forEach((s: any) => {
              const part = s.partName || '';
              const size = s.sizeName || '';
              if (!dataMap[part]) dataMap[part] = {};
              dataMap[part][size] = {
                standardValue: s.standardValue,
                tolerance: s.tolerance
              };
              if (!methodMap[part] && s.measureMethod) {
                methodMap[part] = s.measureMethod;
              }
            });

            return (
              <div className="print-section">
                <div className="print-section-title">📏 尺寸表</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#fafafa' }}>
                      <th style={{ border: '1px solid #d9d9d9', padding: '6px 8px', textAlign: 'left' }}>部位(cm)</th>
                      <th style={{ border: '1px solid #d9d9d9', padding: '6px 8px', textAlign: 'center' }}>度量方式</th>
                      {sortedSizeNames.map(size => (
                        <th key={size} style={{ border: '1px solid #d9d9d9', padding: '6px 8px', textAlign: 'center' }}>{size}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {partNames.map((part: string) => (
                      <tr key={part}>
                        <td style={{ border: '1px solid #d9d9d9', padding: '6px 8px' }}>{part}</td>
                        <td style={{ border: '1px solid #d9d9d9', padding: '6px 8px', textAlign: 'center' }}>{methodMap[part] || '平量'}</td>
                        {sortedSizeNames.map(size => {
                          const cell = dataMap[part]?.[size];
                          const value = cell?.standardValue != null
                            ? `${cell.standardValue}${cell.tolerance != null ? ` ±${cell.tolerance}` : ''}`
                            : '-';
                          return (
                            <td key={size} style={{ border: '1px solid #d9d9d9', padding: '6px 8px', textAlign: 'center' }}>{value}</td>
                          );
                        })}
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
              <Table
                className="print-table"
                dataSource={data.bom}
                rowKey="id"
                size="small"
                pagination={false}
                bordered
                columns={[
                  { title: '物料类型', dataIndex: 'materialType', key: 'materialType', width: 100 },
                  { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 150 },
                  { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 120 },
                  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 100 },
                  { title: '单位', dataIndex: 'unit', key: 'unit', width: 60 },
                  { title: '用量', dataIndex: 'quantity', key: 'quantity', width: 80, align: 'right' as const },
                  { title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 80, align: 'right' as const,
                    render: (v: number) => v ? `¥${Number(v).toFixed(2)}` : '-' },
                  { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
                ]}
              />
            </div>
          )}

          {/* 工序表 */}
          {options.processTable && data.process.length > 0 && (
            <div className="print-section">
              <div className="print-section-title">⚙️ 工序表</div>
              <Table
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
                  { title: '工时(分)', dataIndex: 'duration', key: 'duration', width: 80, align: 'right' as const },
                  { title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 80, align: 'right' as const,
                    render: (v: number) => v ? `¥${Number(v).toFixed(2)}` : '-' },
                  { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
                ]}
              />
            </div>
          )}

          {/* 生产制单（生产要求） */}
          {options.productionSheet && (() => {
            const description = data.productionSheet?.description || '';
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
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#fafafa' }}>
                      <th style={{ border: '1px solid #d9d9d9', padding: '6px 8px', width: 60, textAlign: 'center' }}>序号</th>
                      <th style={{ border: '1px solid #d9d9d9', padding: '6px 8px', textAlign: 'center' }}>内容</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fixedLines.map((line: string, idx: number) => (
                      <tr key={idx}>
                        <td style={{ border: '1px solid #d9d9d9', padding: '6px 8px', textAlign: 'center' }}>{idx + 1}</td>
                        <td style={{ border: '1px solid #d9d9d9', padding: '6px 8px', whiteSpace: 'pre-wrap' }}>{line}</td>
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
              <Table
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
            <div style={{ textAlign: 'center', padding: 48, color: '#999' }}>
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
            color: '#999',
            background: '#fafafa',
            borderRadius: 6,
            border: '1px dashed #d9d9d9'
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>👆</div>
            <div style={{ fontSize: 14 }}>点击"展开预览"按钮查看打印内容</div>
          </div>
        )}
      </Spin>
    </ResizableModal>
  );
};

export default StylePrintModal;
