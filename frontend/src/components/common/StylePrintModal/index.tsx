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

import { StylePrintModalProps } from './types';
import { useStylePrintData } from './useStylePrintData';
import PrintOptionsSelector from './sections/PrintOptionsSelector';
// D-611：正文抽为共享组件，与批量打印静态渲染同源，保证「批量 = 单一」逐字节一致
import StylePrintDocBody from './StylePrintDocBody';
import { STYLE_PRINT_CONTENT_CSS } from './stylePrintContentCss';

const StylePrintModal: React.FC<StylePrintModalProps> = ({
  visible, onClose, styleId, orderId, orderNo,
  styleNo = '', styleName = '', cover, color, quantity,
  category, season, mode = 'sample', patternProductionId: propPatternId, extraInfo = {}, sizeDetails = [],
  sizes: _propSizes, sizeColorConfig, initialLabelMode = false, enableLabelPrint = false,
}) => {
  // 注：_propSizes 当前未在本组件使用，保留以维持 props 接口稳定
  void _propSizes;

  const hook = useStylePrintData({
    visible, onClose, styleId, orderId, orderNo,
    styleNo, styleName, cover, color, quantity,
    category, season, mode,
    patternProductionId: propPatternId,
    extraInfo, sizeDetails, sizeColorConfig, initialLabelMode,
  });
  const {
    options, setOptions,
    fontScale, setFontScale,
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

  return (
    <Drawer
      title={`打印预览 - ${styleNo}`}
      open={visible}
      onClose={onClose}
      placement="right"
      styles={{
        wrapper: { width: '85%' },
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
            background: 'var(--status-processing-bg)',
            borderRadius: 8, border: '1px solid var(--status-processing-border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
          }}>
            <div style={{ fontWeight: 600, color: 'var(--color-primary-darker)' }}> 打印预览</div>
            <Space>
              {enableLabelPrint && (
                <Button icon={<PrinterOutlined />} onClick={() => setLabelPrintMode(v => !v)}>打印标签</Button>
              )}
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
            fontScale={fontScale}
            onFontScaleChange={setFontScale}
            onLabelPrint={handleLabelPrint}
            labelItems={labelItems}
          />

            {/* 打印内容预览区域（正文 = 共享组件，与批量打印同源；此 <style> 会被单一打印的
                innerHTML 抓取一并带走，故必须保留在 #style-print-content 内部） */}
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
            <style>{STYLE_PRINT_CONTENT_CSS}</style>

            <StylePrintDocBody
              options={options}
              data={data}
              sizeColorMatrix={sizeColorMatrix}
              sizeDetails={sizeDetails}
              styleNo={styleNo}
              styleName={styleName}
              category={category}
              season={season}
              mode={mode}
              orderNo={orderNo}
              orderCreatorName={orderCreatorName}
              extraInfo={extraInfo}
              resolvedCover={resolvedCover}
              qrPngDataUrl={qrPngDataUrl}
              qrValue={qrValue}
              user={user}
              loading={loading}
            />
          </div>
        </Spin>
      </div>
    </Drawer>
  );
};

export default StylePrintModal;
