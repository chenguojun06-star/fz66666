import React from 'react';
import { InputNumber } from 'antd';
import SmallModal from '@/components/common/SmallModal';
import { SAMPLE_PARENT_STAGES, clampPercent } from './styleTableViewUtils';
import type { UseStyleTableViewDataReturn } from './useStyleTableViewData';

type StyleProgressEditorModalProps = Pick<
  UseStyleTableViewDataReturn,
  'sample'
>;

/** 样衣进度编辑弹窗：逐阶段录入百分比 */
const StyleProgressEditorModal: React.FC<StyleProgressEditorModalProps> = ({ sample }) => {
  return (
    <SmallModal
      open={sample.progressEditorOpen}
      title="更新样衣进度"
      onCancel={() => sample.setProgressEditorOpen(false)}
      onOk={() => void sample.handleSaveSampleProgress()}
      okText="保存进度"
      confirmLoading={sample.sampleActionLoading}
    >
      <div className="style-smart-progress-editor">
        {SAMPLE_PARENT_STAGES.map((item) => (
          <div key={item.key} className="style-smart-progress-editor__row">
            <div className="style-smart-progress-editor__label">{item.label}</div>
            <InputNumber
              min={0}
              max={100}
              value={sample.progressDraft[item.key] ?? 0}
              onChange={(value) => sample.setProgressDraft((prev) => ({
                ...prev,
                [item.key]: clampPercent(Number(value || 0)),
              }))}
            />
          </div>
        ))}
      </div>
    </SmallModal>
  );
};

export default StyleProgressEditorModal;
