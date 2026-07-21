import React from 'react';
import { Button } from 'antd';
import StyleDevelopmentProgressBanner from '../StyleDevelopmentProgressBanner';
import type { Props } from './types';
import useStyleDevelopmentWorkbenchData from './useStyleDevelopmentWorkbenchData';
import StageContent from './StageContent';
import BudgetStatusBar from './BudgetStatusBar';

const StyleDevelopmentWorkbench: React.FC<Props> = ({ record, onClose, initialSection, onSync }) => {
  const {
    loading,
    activeSection,
    setActiveSection,
    productionSaving,
    productionReqRows,
    setProductionReqRows,
    detail,
    sizeColorConfig,
    stageCards,
    handleAttachmentListChange,
    handleSectionRefresh,
    handleSaveProduction,
    handleBudgetEdit,
  } = useStyleDevelopmentWorkbenchData({ record, initialSection, onSync });

  return (
    <aside className="style-workbench">
      <div className="style-workbench__header">
        <div>
          <div className="style-workbench__eyebrow">开发资料直编台</div>
          <div className="style-workbench__title">{record.styleNo}</div>
          <div className="style-workbench__subtitle">{record.styleName || '未命名样衣'}</div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <StyleDevelopmentProgressBanner
          stages={stageCards as any}
          activeKey={activeSection}
          onStageClick={(key) => setActiveSection(key as typeof activeSection)}
          style={{ margin: 0 }}
        />
      </div>

      {/* 当前阶段预算编辑栏 */}
      <BudgetStatusBar
        stageCards={stageCards}
        activeSection={activeSection}
        onBudgetEdit={handleBudgetEdit}
      />

      <div className="style-workbench__body">
        <StageContent
          loading={loading}
          activeSection={activeSection}
          record={record}
          detail={detail}
          sizeColorConfig={sizeColorConfig}
          productionReqRows={productionReqRows}
          productionSaving={productionSaving}
          setProductionReqRows={setProductionReqRows}
          onSectionRefresh={handleSectionRefresh}
          onAttachmentListChange={handleAttachmentListChange}
          onSaveProduction={handleSaveProduction}
        />
      </div>

      <div className="style-workbench__footer">
        <Button type="primary" onClick={onClose}>关闭</Button>
      </div>
    </aside>
  );
};

export default StyleDevelopmentWorkbench;
