import React from 'react';
import XiaoyunCloudAvatar from './XiaoyunCloudAvatar';

interface XiaoyunSpinIndicatorProps {
  size?: 'small' | 'default' | 'large' | number;
}

const XiaoyunSpinIndicator: React.FC<XiaoyunSpinIndicatorProps> = ({ size = 'default' }) => {
  const getSize = () => {
    if (typeof size === 'number') return size;
    switch (size) {
      case 'small':
        return 32;
      case 'large':
        return 52;
      default:
        return 40;
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
      <XiaoyunCloudAvatar size={getSize()} loading />
    </div>
  );
};

export default XiaoyunSpinIndicator;
