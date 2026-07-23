/**
 * 通用样衣/订单打印预览组件
 * 支持选择性打印：基本信息、尺寸表、生产制单、BOM表、工序表、纸样附件等
 * 可在样衣开发、下单管理、大货生产等页面复用
 *
 * 重构说明（2026-07）：
 *   - 业务逻辑抽取到 useStylePrintData Hook
 *   - 工具/常量抽取到 helpers.ts
 *   - UI 区块拆分为 sections/* 子组件
 *   - 主文件仅做组合与布局
 */
import React from 'react';
import { Button, Drawer, Space, Spin } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';

import { canViewPrice } from '@/utils/sensitiveDataMask';

import { StylePrintModalProps } from './types';
import { useStylePrintData } from './useStylePrintData';
import PrintOptionsSelector from './sections/PrintOptionsSelector';
import BasicInfoSection from './sections/BasicInfoSection';
import SizeColorMatrixSection from './sections/SizeColorMatrixSection';
import SizeDetailsSection from './sections/SizeDetailsSection';
import SampleReviewSection from './sections/SampleReviewSection';
import ProductionSheetSection from './sections/ProductionSheetSection';
import SizeTableSection from './sections/SizeTableSection';
import BomTableSection from './sections/BomTableSection';
import ProcessTableSection from './sections/ProcessTableSection';

const StylePrintModal: React.FC<StylePrintModalProps> = ({
  visible, onClose, styleId, orderId, orderNo,
  styleNo = '', styleName = '', cover, color, quantity,
  category, season, mode = 'sample', patternProductionId: propPatternId, extraInfo = {}, sizeDetails = [],
  sizes: _propSizes, sizeColorConfig,
}) => {
  // 注：_propSizes 当前未在本组件使用，保留以维持 props 接口稳定
  void _propSizes;

  const hook = useStylePrintData({
    visible, onClose, styleId, orderId, orderNo,
    styleNo, styleName, cover, color, quantity,
    category, season, mode,
    patternProductionId: propPatternId,
    extraInfo, sizeDetails, sizeColorConfig,
  });
  const {
    options, setOptions,
    loading,
    resolvedCover,
    data,
    labelPrintMode, setLabelPrintMode,
    labelSize, setLabelSize,
    labelCount, setLabelCount,
    labelPrinting,
    printLoading,
    qrPngDataUrl,
    orderCreatorName,
    qrValue,
    sizeColorMatrix,
    labelItems,
    handlePrint,
    handleLabelPrint,
    user,
  } = hook;
  const showPrice = canViewPrice(user);

  return (
    <Drawer
      title={`打印预览 - ${styleNo}`}
      open={visible}
      onClose={onClose}
      placement="right"
      styles={{
        wrapper: { width: Math.min(1600, Math.round(typeof window !== 'undefined' ? window.innerWidth * 0.85 : 1600)) },
        body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' },
      }}
      maskClosable={false}
      footer={null}
    >
      <div style={{ padding: '16px', flex: 1, overflow: 'auto' }}>
        <Spin spinning={loading}>
          {/* 顶部操作栏 */}
          <div style={{
            marginBottom: 12, padding: '10px 16px',
            background: 'linear-gradient(90deg, #f0f5ff 0%, var(--status-processing-bg) 100%)',
            borderRadius: 8, border: '1px solid var(--status-processing-border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
          }}>
            <div style={{ fontWeight: 600, color: '#1d39c4' }}> 打印预览</div>
            <Space>
              <Button icon={<PrinterOutlined />} onClick={() => setLabelPrintMode(v => !v)}>打印标签</Button>
              <Button type="primary" onClick={() => void handlePrint()} loading={printLoading}>打印</Button>
            </Space>
          </div>

          {/* 打印选项 + 标签打印选项 */}
          <PrintOptionsSelector
            options={options}
            onOptionsChange={setOptions}
            mode={mode}
            labelPrintMode={labelPrintMode}
            labelSize={labelSize}
            onLabelSizeChange={setLabelSize}
            labelCount={labelCount}
            onLabelCountChange={setLabelCount}
            labelPrinting={labelPrinting}
            onLabelPrint={handleLabelPrint}
            labelItems={labelItems}
          />

          {/* 打印内容预览区域 */}
          <div
            className="style-print-content"
            id="style-print-content"
            style={{
              background: 'var(--color-bg-base)',
              padding: 20,
              border: '1px solid var(--color-border)',
              borderRadius: 12,
            }}
          >
            <style>{`
              .print-section { margin-bottom: 16px; }
              .print-section-title { font-size: 12px; font-weight: 600; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 0.75px solid #ccc; }
              /* 统一打印表格样式 */
              .pt { width: 100%; border-collapse: collapse; font-size: 12px; }
              .pt th, .pt td { border: 0.5px solid #d0d0d0; padding: 5px 8px; vertical-align: middle; }
              .pt th { background: var(--color-bg-subtle); font-weight: 600; text-align: center; white-space: nowrap; }
              .pt td { color: #333; }
              .pt .label-cell { background: var(--color-bg-subtle); font-weight: 500; color: #333; width: 100px; white-space: nowrap; }
              .pt .total-row td { background: var(--color-bg-subtle); font-weight: 700; }
              .pt .highlight-cell { font-weight: 700; color: #1d39c4; }
            `}</style>

            {/* 基本信息 */}
            <BasicInfoSection
              options={options}
              resolvedCover={resolvedCover}
              qrPngDataUrl={qrPngDataUrl}
              qrValue={qrValue}
              data={data}
              styleNo={styleNo}
              styleName={styleName}
              category={category}
              season={season}
              mode={mode}
              orderNo={orderNo}
              orderCreatorName={orderCreatorName}
              extraInfo={extraInfo}
              user={user}
            />

            {/* 下单明细（颜色×尺码矩阵） */}
            {options.basicInfo && (
              <SizeColorMatrixSection sizeColorMatrix={sizeColorMatrix} />
            )}

            {/* 码数明细（基于 sizeDetails） */}
            {options.basicInfo && (
              <SizeDetailsSection sizeDetails={sizeDetails} />
            )}

            {/* 样衣审核 */}
            {options.sampleReview && (
              <SampleReviewSection productionSheet={data.productionSheet} />
            )}

            {/* 生产制单（生产要求） */}
            {options.productionSheet && (
              <ProductionSheetSection productionSheet={data.productionSheet} />
            )}

            {/* 尺寸表 */}
            {options.sizeTable && (
              <SizeTableSection sizes={data.sizes} />
            )}

            {/* BOM表 */}
            {options.bomTable && (
              <BomTableSection bom={data.bom} showPrice={showPrice} />
            )}

            {/* 工序表 */}
            {options.processTable && (
              <ProcessTableSection process={data.process} showPrice={showPrice} />
            )}

            {/* 无数据提示 */}
            {!loading && !options.basicInfo && data.sizes.length === 0 && data.bom.length === 0 &&
              data.process.length === 0 && (
              <div style={{ textAlign: 'center', padding: 48, color: 'var(--color-text-tertiary)' }}>
                暂无打印数据，请选择要打印的内容
              </div>
            )}
          </div>
        </Spin>
      </div>
    </Drawer>
  );
};

export default StylePrintModal;
