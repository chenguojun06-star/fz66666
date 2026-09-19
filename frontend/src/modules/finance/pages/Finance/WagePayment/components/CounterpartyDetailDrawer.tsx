import { useEffect, useState } from 'react';
import {
  billAggregationApi,
  type CounterpartyGroup,
} from '@/services/finance/billAggregationApi';
import CounterpartyBillDrawer from './CounterpartyBillDrawer';

interface CounterpartyDetailDrawerProps {
  open: boolean;
  /** 收款方 / 往来对象 ID（付款记录、应付款里的 payeeId） */
  payeeId?: string;
  payeeName?: string;
  onClose: () => void;
}

/**
 * D-473 往来明细统一入口（账单视角）。
 *
 * 背景：原先点收款方有两套抽屉——PayeeDetailDrawer 看付款记录、CounterpartyBillDrawer 看账单，
 * 同一个人在不同页面点开看到的内容不一样。现统一为账单视角（账单才是"银行账户"本体）。
 *
 * 用法：各处只需传 payeeId / payeeName，本组件先从总账聚合行里定位该对象的汇总
 * （按 id 匹配，id 不同源时按名称兜底），再交给详情抽屉，保证头部汇总数字真实。
 */
export default function CounterpartyDetailDrawer({
  open,
  payeeId,
  payeeName,
  onClose,
}: CounterpartyDetailDrawerProps) {
  const [target, setTarget] = useState<CounterpartyGroup | null>(null);

  useEffect(() => {
    if (!open) {
      setTarget(null);
      return;
    }
    if (!payeeId && !payeeName) {
      setTarget(null);
      return;
    }

    let alive = true;
    const fallback: CounterpartyGroup = {
      counterpartyType: '',
      counterpartyId: payeeId ?? '',
      counterpartyName: payeeName ?? '',
      billCount: 0,
      totalAmount: 0,
      settledAmount: 0,
      unsettledAmount: 0,
    };

    (async () => {
      try {
        const res: any = await billAggregationApi.listCounterpartyGroups({});
        const list: CounterpartyGroup[] = res?.data ?? res ?? [];
        const hit = list.find(
          (g) =>
            (payeeId && g.counterpartyId && g.counterpartyId === payeeId) ||
            (payeeName && g.counterpartyName && g.counterpartyName === payeeName),
        );
        if (!alive) return;
        setTarget(hit ?? fallback);
      } catch {
        // 聚合查询失败时退回空汇总，账单流水仍可按对象名加载
        if (alive) setTarget(fallback);
      }
    })();

    return () => {
      alive = false;
    };
  }, [open, payeeId, payeeName]);

  return <CounterpartyBillDrawer open={open && !!target} target={target} onClose={onClose} />;
}
