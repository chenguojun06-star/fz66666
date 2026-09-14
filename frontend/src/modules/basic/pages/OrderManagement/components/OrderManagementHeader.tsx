import React from 'react';
import { Card } from 'antd';
import PageStatCards from '@/components/common/PageStatCards';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import type { StatCard, HintItem } from '@/components/common/PageStatCards';
import type { SmartErrorInfo } from '@/smart/core/types';

interface OrderManagementHeaderProps {
  showSmartErrorNotice: boolean;
  smartError: SmartErrorInfo | null;
  fetchStyles: () => void;
  activeStatFilter: string;
  cards: StatCard[];
  hints: HintItem[];
  onClearHints?: () => void;
}

const OrderManagementHeader: React.FC<OrderManagementHeaderProps> = ({
  showSmartErrorNotice,
  smartError,
  fetchStyles,
  activeStatFilter,
  cards,
  hints,
  onClearHints,
}) => {
  return (
    <>
      {showSmartErrorNotice && smartError ? (
        <Card style={{ marginBottom: 12 }}>
          <SmartErrorNotice error={smartError} onFix={fetchStyles} />
        </Card>
      ) : null}

      <PageStatCards
        activeKey={activeStatFilter}
        cards={cards}
        hints={hints}
        onClearHints={onClearHints}
      />
    </>
  );
};

export default OrderManagementHeader;
