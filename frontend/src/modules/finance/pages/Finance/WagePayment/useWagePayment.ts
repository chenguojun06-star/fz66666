import { useState } from 'react';
import type { WagePayment } from '@/services/finance/wagePaymentApi';

export function useWagePayment() {
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<WagePayment | null>(null);
  return { detailOpen, setDetailOpen, detailRecord, setDetailRecord };
}
