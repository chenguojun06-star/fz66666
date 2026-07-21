import React, { useCallback } from 'react';
import { Row, Col, Button } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { isAdmin } from '@/utils/AuthContext';
import QuotationBomSection from './styleQuotation/QuotationBomSection';
import QuotationProcessSection from './styleQuotation/QuotationProcessSection';
import QuotationSecondarySection from './styleQuotation/QuotationSecondarySection';
import QuotationAuditSection from './styleQuotation/QuotationAuditSection';
import QuotationCostPanel from './styleQuotation/QuotationCostPanel';
import UnlockQuotationModal from './styleQuotation/UnlockQuotationModal';
import { buildQuotationPrintHtml } from './styleQuotation/buildQuotationPrintHtml';
import { useStyleQuotationTabData } from './styleQuotation/useStyleQuotationTabData';

interface Props {
  styleId: string | number;
  styleNo?: string;
  readOnly?: boolean;
  onSaved?: () => void;
  totalQty?: number;
}

const StyleQuotationTab: React.FC<Props> = ({ styleId, styleNo, readOnly, onSaved, totalQty = 0 }) => {
  const data = useStyleQuotationTabData({ styleId, styleNo, onSaved });
  const {
    form,
    message,
    user,
    unlockModalOpen,
    unlockRemark,
    unlockSubmitting,
    setUnlockRemark,
    saving,
    auditSubmitting,
    auditRemark,
    setAuditRemark,
    quotation,
    bomList,
    processList,
    secondaryProcessList,
    bomColorCosts,
    isLocked,
    effectiveLocked,
    materialCost,
    processCost,
    otherCost,
    totalCost,
    totalPrice,
    profit,
    actualProfitRate,
    totalDevMaterialCost,
    calculateTotal,
    handleProcessRateChange,
    handleSave,
    handleUnlockClick,
    handleUnlockConfirm,
    handleAudit,
    setUnlockModalOpen,
  } = data;

  const handlePrintQuotation = useCallback(() => {
    if (bomList.length === 0 && processList.length === 0) {
      message.warning('暂无可打印的报价数据');
      return;
    }
    const html = buildQuotationPrintHtml({
      bomList,
      processList,
      secondaryProcessList,
      styleNo,
      materialCost,
      processCost,
      otherCost,
      totalCost,
      totalPrice,
      profit,
      actualProfitRate,
    });
    const printWindow = window.open('', '_blank', 'width=1000,height=800');
    if (!printWindow) {
      message.warning('请允许弹出窗口以进行打印');
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
  }, [bomList, processList, secondaryProcessList, styleNo, materialCost, processCost, otherCost, totalCost, totalPrice, profit, actualProfitRate, message]);

  return (
    <div className="style-quotation" style={{ padding: '0 8px' }}>
      {styleNo && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 12,
        }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-text-primary)' }}>
            款号：{styleNo}
          </div>
          <Button icon={<PrinterOutlined />} onClick={handlePrintQuotation}>打印报价单</Button>
        </div>
      )}
      <UnlockQuotationModal
        open={unlockModalOpen}
        remark={unlockRemark}
        submitting={unlockSubmitting}
        onRemarkChange={setUnlockRemark}
        onOk={handleUnlockConfirm}
        onCancel={() => { setUnlockModalOpen(false); setUnlockRemark(''); }}
      />
      <Row gutter={16} align="top">
        <Col span={24}>
          <QuotationBomSection
            bomList={bomList}
            bomColorCosts={bomColorCosts}
            materialCost={materialCost}
          />
          <QuotationProcessSection processList={processList} onRateChange={handleProcessRateChange} isLocked={effectiveLocked} />
          <QuotationSecondarySection
            secondaryProcessList={secondaryProcessList}
          />
          <QuotationCostPanel
            form={form}
            isLocked={effectiveLocked}
            canUnlock={isAdmin(user) && isLocked}
            readOnly={readOnly}
            totalCost={totalCost}
            totalPrice={totalPrice}
            materialCost={materialCost}
            processCost={processCost}
            profit={profit}
            actualProfitRate={actualProfitRate}
            totalQty={totalQty}
            totalDevMaterialCost={totalDevMaterialCost}
            onSave={handleSave}
            onUnlock={handleUnlockClick}
            onValuesChange={calculateTotal}
            saving={saving}
          />
          <QuotationAuditSection
            isLocked={effectiveLocked}
            quotation={quotation}
            auditRemark={auditRemark}
            onRemarkChange={setAuditRemark}
            auditSubmitting={auditSubmitting}
            onAudit={handleAudit}
          />
        </Col>
      </Row>
    </div>
  );
};

export default StyleQuotationTab;
