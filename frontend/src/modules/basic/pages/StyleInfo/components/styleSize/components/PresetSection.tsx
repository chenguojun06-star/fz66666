import React from 'react';
import { Button, Alert } from 'antd';
import { BulbOutlined } from '@ant-design/icons';
import { GRADING_PRESETS } from '../gradingPresets';

interface Props {
  onApplyPreset: (presetKey: string) => void;
}

const PresetSection: React.FC<Props> = ({ onApplyPreset }) => {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
        <BulbOutlined style={{ color: 'var(--color-warning)' }} />
        快速应用行业预设
      </div>
      <div style={{ color: 'var(--color-text-tertiary)', fontSize: 13, marginBottom: 8 }}>
        选择服装品类，系统自动根据行业标准推荐各部位跳码量
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {GRADING_PRESETS.map((preset) => (
          <Button
            key={preset.key}
            size="small"
            onClick={() => onApplyPreset(preset.key)}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      <Alert
        type="info"
        showIcon={false}
        style={{ marginTop: 8, fontSize: 12, padding: '6px 10px' }}
        message="行业标准参考：胸围每码+2cm、肩宽+1cm、衣长+1cm、腰围+1.5cm、裤长+1.2cm、领围+0.5cm。具体数值请根据实际版型调整。"
      />
    </div>
  );
};

export default PresetSection;
