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
    <div className="u-d-flex u-ai-center u-jc-center u-w-full u-h-full">
      <XiaoyunCloudAvatar size={getSize()} loading />
    </div>
  );
};

export default XiaoyunSpinIndicator;
