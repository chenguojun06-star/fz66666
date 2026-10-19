import api, { unwrapApiData } from '@/utils/api';

// ============================================================
// D-513 会计凭证 — 类型定义
// ============================================================

/** 会计凭证（表头） */
export interface AccountingVoucher {
  id: number;
  tenantId?: number;
  voucherNo: string;
  voucherDate: string;
  billAggregationId?: string;
  /** 付款记录 ID；应收收款用收款流水 ID（一次收款一张凭证） */
  paymentId?: string;
  sourceType?: string;
  sourceId?: string;
  summary?: string;
  totalAmount: number;
  /** JOURNAL=记账凭证（账单确认时挂账）/ PAYMENT=收付款凭证 */
  voucherType?: string;
  status?: string;
  /** 冲销凭证指向的原凭证 */
  reverseVoucherId?: number;
  accountingStandard?: string;
  createBy?: string;
  createTime?: string;
}

/** 凭证分录行 */
export interface AccountingEntry {
  id: number;
  voucherId: number;
  lineNo: number;
  subjectCode: string;
  subjectName: string;
  debitAmount: number;
  creditAmount: number;
  summary?: string;
}

/** 会计科目 */
export interface AccountSubject {
  id: number;
  subjectCode: string;
  subjectName: string;
  /** ASSET / LIABILITY / EQUITY / EXPENSE / REVENUE */
  subjectType: string;
  /** DEBIT / CREDIT */
  balanceDirection: string;
  parentCode?: string;
  isLeaf?: number;
  enabled?: number;
}

export interface VoucherDetail {
  voucher: AccountingVoucher;
  entries: AccountingEntry[];
}

// ============================================================
// 接口
//
// D-817：service 层统一解包（api 客户端返回的是 {code,data,message} 信封）。
// 调用方直接拿业务数据；失败会抛错，由页面 catch 提示。
// ============================================================

export const accountingVoucherApi = {
  /** 凭证列表（按凭证日期范围过滤，后端 LIMIT 500） */
  listVouchers: async (startDate?: string, endDate?: string): Promise<AccountingVoucher[]> =>
    unwrapApiData<AccountingVoucher[]>(
      await api.get('/finance/accounting/voucher/list', { params: { startDate, endDate } }),
      '加载凭证失败',
    ),

  /** 凭证详情（含分录行） */
  getVoucherDetail: async (id: number): Promise<VoucherDetail> =>
    unwrapApiData<VoucherDetail>(
      await api.get(`/finance/accounting/voucher/detail/${id}`),
      '加载凭证详情失败',
    ),

  /** 冲销凭证（生成红字凭证，借贷互换） */
  reverseVoucher: async (id: number): Promise<void> => {
    await unwrapApiData<void>(await api.post(`/finance/accounting/voucher/reverse/${id}`), '冲销凭证失败');
  },

  /** 补生成缺失的记账凭证（历史补账，幂等，返回本次新生成张数） */
  backfillVouchers: async (): Promise<number> =>
    unwrapApiData<number>(await api.post('/finance/accounting/voucher/backfill'), '补生成凭证失败'),

  /** 会计科目列表 */
  listSubjects: async (): Promise<AccountSubject[]> =>
    unwrapApiData<AccountSubject[]>(await api.get('/finance/accounting/subjects'), '加载会计科目失败'),
};

// ============================================================
// 展示映射
// ============================================================

export const VOUCHER_TYPE_MAP: Record<string, { text: string; color: string }> = {
  JOURNAL: { text: '记账凭证', color: 'blue' },
  PAYMENT: { text: '收付款凭证', color: 'green' },
};

export const SUBJECT_TYPE_MAP: Record<string, string> = {
  ASSET: '资产',
  LIABILITY: '负债',
  EQUITY: '所有者权益',
  EXPENSE: '成本费用',
  REVENUE: '收入',
};

export const BALANCE_DIRECTION_MAP: Record<string, string> = {
  DEBIT: '借',
  CREDIT: '贷',
};

/** 会计准则（库里存的是缩写码） */
export const ACCOUNTING_STANDARD_MAP: Record<string, string> = {
  CAS: '中国企业会计准则',
};
