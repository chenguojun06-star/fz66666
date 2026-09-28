/**
 * 打印单据正文（D-611）
 *
 * 从 StylePrintModal 预览区抽出的共享正文：单一打印预览与批量打印静态渲染走同一份 JSX，
 * 保证批量打印出来的每张单与单独打印完全一致（区块、类名、结构逐字节相同）。
 * 纯展示组件：props 进、JSX 出，无请求无副作用，可被 renderToStaticMarkup 安全渲染。
 */
import React from 'react';
import { canViewPrice } from '@/utils/sensitiveDataMask';

import { PrintOptions, PrintData } from './types';
import { parseSizeColorMatrix } from './printDataTransform';
import BasicInfoSection from './sections/BasicInfoSection';
import SizeColorMatrixSection from './sections/SizeColorMatrixSection';
import SizeDetailsSection from './sections/SizeDetailsSection';
import SampleReviewSection from './sections/SampleReviewSection';
import ProductionSheetSection from './sections/ProductionSheetSection';
import SizeTableSection from './sections/SizeTableSection';
import BomTableSection from './sections/BomTableSection';
import ProcessTableSection from './sections/ProcessTableSection';

interface StylePrintDocBodyProps {
  options: PrintOptions;
  data: PrintData;
  sizeColorMatrix: ReturnType<typeof parseSizeColorMatrix>;
  sizeDetails: Array<{ color: string; size: string; quantity: number }>;
  styleNo: string;
  styleName: string;
  category?: string;
  season?: string;
  mode: 'sample' | 'order' | 'production';
  orderNo?: string;
  orderCreatorName: string;
  extraInfo: Record<string, any>;
  resolvedCover: string | null;
  qrPngDataUrl: string;
  qrValue: string;
  user: any;
  /** 仅预览态使用：加载中不显示「暂无打印数据」空态（批量静态渲染时不传，恒为已完成） */
  loading?: boolean;
}

const StylePrintDocBody: React.FC<StylePrintDocBodyProps> = ({
  options, data, sizeColorMatrix, sizeDetails,
  styleNo, styleName, category, season, mode,
  orderNo, orderCreatorName, extraInfo,
  resolvedCover, qrPngDataUrl, qrValue, user, loading = false,
}) => {
  const showPrice = canViewPrice(user);

  return (
    <>
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

      {/* 生产制单（生产要求）— D-514b 已去掉「工艺说明」左列标签，内容整宽保留 */}
      {options.productionSheet && (
        <div className="print-sec">
          <div className="print-section-title">生产制单</div>
          <ProductionSheetSection productionSheet={data.productionSheet} />
        </div>
      )}

      {/* 尺寸表 */}
      {options.sizeTable && (
        <div className="print-sec">
          <div className="print-section-title">尺寸表</div>
          <SizeTableSection sizes={data.sizes} />
        </div>
      )}

      {/* BOM表 */}
      {options.bomTable && (
        <div className="print-sec">
          <div className="print-section-title">物料明细（BOM）</div>
          <BomTableSection bom={data.bom} showPrice={showPrice} />
        </div>
      )}

      {/* 工序表 */}
      {options.processTable && (
        <div className="print-sec">
          <div className="print-section-title">工序表</div>
          <ProcessTableSection process={data.process} showPrice={showPrice} />
        </div>
      )}

      {/* 无数据提示 */}
      {!loading && !options.basicInfo && data.sizes.length === 0 && data.bom.length === 0 &&
        data.process.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--color-text-tertiary)' }}>
          暂无打印数据，请选择要打印的内容
        </div>
      )}
    </>
  );
};

export default StylePrintDocBody;
