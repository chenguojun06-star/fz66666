import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Empty,
  Input,
  InputNumber,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { InputRef } from 'antd';
import {
  CalculatorOutlined,
  DeleteOutlined,
  PauseCircleOutlined,
  PlusOutlined,
  ProfileOutlined,
  ReloadOutlined,
  RollbackOutlined,
  ScanOutlined,
  ShoppingCartOutlined,
  FieldTimeOutlined,
  TagsOutlined,
  UserOutlined,
  AppstoreOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
} from '@ant-design/icons';
import { message } from '@/utils/antdStatic';
import { Segmented } from 'antd';
import { formatMoney } from '@/utils/format';
import { CATEGORY_CODE_OPTIONS } from '@/utils/styleCategory';
import posApi from '@/services/pos/posApi';
import type {
  PosChannelReadiness,
  PosRecentSale,
  PosCheckoutResult,
  PosCustomer,
  PosPayInfo,
  PosMember,
  PosPayMethod,
  PosSku,
  PosToday,
  PosWholesaleTier,
} from '@/services/pos/posApi';
import { QRCodeSVG } from 'qrcode.react';
import TicketModal from '@/components/common/TicketModal';
import { styleImageColumn, styleNoColumn } from '@/components/common/styleImageColumns';
import StyleImageCell from '@/components/common/StyleImageCell';
import useStyleCoverImages from '@/hooks/useStyleCoverImages';
import PosReturnPanel from './PosReturnPanel';
import PosHoldPanel from './PosHoldPanel';
import PosShiftPanel from './PosShiftPanel';
import CashNumpad from './CashNumpad';
import TicketPrint from './TicketPrint';
import ticketApi, { type TicketData } from '@/services/ticket/ticketApi';
import './ticket-print.css';
import './index.css';

const { Text } = Typography;

/** 购物车行（前端态；小计一律现算，不缓存，避免改价后对不上） */
interface CartLine {
  skuId: number;
  skuCode?: string | null;
  styleNo?: string | null;
  styleName?: string | null;
  color?: string | null;
  size?: string | null;
  tagPrice?: number | null;
  unitPrice: number;
  quantity: number;
  stock: number;
}

const PAY_OPTIONS: Array<{ value: PosPayMethod; label: string }> = [
  { value: 'CASH', label: '现金' },
  { value: 'WECHAT', label: '微信' },
  { value: 'ALIPAY', label: '支付宝' },
  { value: 'CARD', label: '刷卡' },
  { value: 'MEMBER_BALANCE', label: '会员余额' },
  { value: 'CREDIT', label: '挂账' },
];

/**
 * 组合收款可选的方式：微信/支付宝是「一笔渠道单对应一个金额」的在线通道，
 * 拆金额要多次下单，暂不进组合；其余四种都能当场混收。
 */
const COMBO_OPTIONS: Array<{ value: PosPayMethod; label: string }> = [
  { value: 'CASH', label: '现金' },
  { value: 'CARD', label: '刷卡' },
  { value: 'MEMBER_BALANCE', label: '会员余额' },
  { value: 'CREDIT', label: '挂账' },
];

/** 组合收款的一行（前端态） */
interface ComboRow {
  payMethod: PosPayMethod;
  amount: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * 收银台（POS 开单）。
 *
 * 设计原则：**一屏完成「选货 → 改价 → 收款」，不搞多级菜单**。
 * 左边扫码/搜索选货，右边本单与收款；扫码枪就是键盘，回车即加一件。
 *
 * 金额一律服务端算：这里算出来的数字只用于**即时显示**，提交后以后端返回为准
 * （前端算错不该把错账记进库里）。
 */
const PosTerminal: React.FC = () => {
  const [keyword, setKeyword] = React.useState('');
  const [results, setResults] = React.useState<PosSku[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [lines, setLines] = React.useState<CartLine[]>([]);
  const [phone, setPhone] = React.useState('');
  const [customer, setCustomer] = React.useState<PosCustomer | null>(null);
  const [customerName, setCustomerName] = React.useState('');
  const [discount, setDiscount] = React.useState<number>(0);
  const [roundOff, setRoundOff] = React.useState<number>(0);
  const [payMethod, setPayMethod] = React.useState<PosPayMethod>('CASH');
  const [cashOpen, setCashOpen] = React.useState(false);
  // 会员：输手机号即认人。折扣与余额都要在收银台当场可见，
  // 不然收银员按原价收了钱，回头才发现这单本该打折。
  const [member, setMember] = React.useState<PosMember | null>(null);
  const [memberOpen, setMemberOpen] = React.useState(false);
  const [rechargeAmount, setRechargeAmount] = React.useState(0);
  // 小票打印：开单完成就该打，顾客当场会要；没打成的保留「补打」入口
  const [printTicket, setPrintTicket] = React.useState<TicketData | null>(null);
  // 挂账授权（防资损）：不到账也能出单的唯一方式，必须有人签字
  const [creditAuthOpen, setCreditAuthOpen] = React.useState(false);
  const [creditAuth, setCreditAuth] = React.useState<{ user: string; pwd: string }>({
    user: '',
    pwd: '',
  });
  const [received, setReceived] = React.useState<number | null>(null);
  const [remark, setRemark] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [today, setToday] = React.useState<PosToday | null>(null);
  const [result, setResult] = React.useState<PosCheckoutResult | null>(null);
  /** 在线收款渠道可用性：未配置的渠道按钮置灰，避免收银员点了才发现报错 */
  const [channels, setChannels] = React.useState<PosChannelReadiness | null>(null);
  /** 待支付单（二维码已生成，等顾客扫码） */
  const [payInfo, setPayInfo] = React.useState<PosPayInfo | null>(null);
  /** 二维码剩余有效秒数 */
  const [payLeft, setPayLeft] = React.useState(0);
  const [cancelling, setCancelling] = React.useState(false);
  /** 电子小票弹窗（开单成功 / 今日单据查看） */
  const [ticket, setTicket] = React.useState<{ id: number; saleNo?: string } | null>(null);
  /**
   * D-817：收银台内的功能分区。
   * 不拆成独立页面 —— 退货/换货与挂单都发生在结账现场，来回跳页在高峰期就是排队变慢。
   * 购物车 state 仍在本组件，切 Tab 不会丢（Tabs 不设 destroyOnClose）。
   */
  const [tab, setTab] = React.useState<'checkout' | 'return' | 'hold' | 'shift'>('checkout');
  // 分类页签：点分类过滤宫格，不用每次敲搜索词
  const [activeCat, setActiveCat] = React.useState('全部');
  // 组合收款（一笔单多种方式混收，如现金500+微信300）
  const [comboMode, setComboMode] = React.useState(false);
  const [payRows, setPayRows] = React.useState<ComboRow[]>([]);
  // 批发阶梯价（满 N 件打 X 折）+ 设置弹窗草稿
  const [wsTier, setWsTier] = React.useState<PosWholesaleTier | null>(null);
  const [wsOpen, setWsOpen] = React.useState(false);
  const [wsDraft, setWsDraft] = React.useState({ minQty: 10, discountRate: 0.9, enabled: true });
  const [wsSaving, setWsSaving] = React.useState(false);
  /** 批发价是否已应用（自动套用后可一键撤销，不反复打扰） */
  const [wsApplied, setWsApplied] = React.useState(false);
  const wsAutoRef = React.useRef(false);

  const searchRef = React.useRef<InputRef>(null);
  // 全屏收银台唯一的「出口」：回后台管理（老板管货/对账用）
  const navigate = useNavigate();

  /* ── 真·全屏切换 ──
     专业收银机形态：进入后浏览器地址栏/标签页全部隐藏，整屏只剩收银台。
     必须由用户点击触发（浏览器安全限制），不能自动进入。 */
  const [isFull, setIsFull] = React.useState(false);
  React.useEffect(() => {
    const sync = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);
  const toggleFullscreen = React.useCallback(() => {
    const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    const doc = document as Document & { webkitExitFullscreen?: () => void };
    if (document.fullscreenElement) {
      doc.exitFullscreen?.().catch(() => {}) ?? doc.webkitExitFullscreen?.();
    } else {
      root.requestFullscreen?.().catch(() => {}) ?? root.webkitRequestFullscreen?.();
    }
  }, []);

  const loadToday = React.useCallback(async () => {
    try {
      setToday(await posApi.today());
    } catch {
      // 交班数据拿不到不该影响开单
    }
  }, []);

  /** 浏览模式：不输关键词也出商品宫格（分类页签点选是主路径之一） */
  const loadGoods = React.useCallback(async () => {
    setSearching(true);
    try {
      setResults(await posApi.searchSkus('', 60));
    } catch {
      // 拿不到就保持空宫格，不打断收银
    } finally {
      setSearching(false);
    }
  }, []);

  React.useEffect(() => {
    void loadToday();
    void loadGoods();
    void (async () => {
      try {
        setChannels(await posApi.channels());
      } catch {
        // 拿不到渠道状态就按"都不可用"处理：宁可让收银员用现金，也不能点了报错
        setChannels(null);
      }
      try {
        setWsTier(await posApi.wholesaleTier());
      } catch {
        // 批发价配置加载失败 = 没有批发价，不影响正常收银
        setWsTier(null);
      }
    })();
  }, [loadToday, loadGoods]);

  const goodsAmount = React.useMemo(
    () => round2(lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0)),
    [lines],
  );
  const totalAmount = React.useMemo(
    () => round2(Math.max(0, goodsAmount - (discount || 0) - (roundOff || 0))),
    [goodsAmount, discount, roundOff],
  );
  const changeAmount = React.useMemo(
    () => (received == null ? null : round2(received - totalAmount)),
    [received, totalAmount],
  );

  /* ── 分类页签 ──
     category 存的是编码（SKIRT/DRESS…），页签要给人看，
     走系统标准映射（utils/styleCategory.ts，款式资料同一套）翻译成中文；
     再兜一层别名表：历史数据里有标准字典之外的编码（如 style_type 来源的
     SKIRT、手工录入的 upper），也翻成中文，翻不出才原样展示。 */
  const categoryLabel = React.useMemo(() => {
    const map = new Map(CATEGORY_CODE_OPTIONS.map((o) => [o.value, o.label]));
    const alias: Record<string, string> = { SKIRT: '裙子', UPPER: '上装' };
    return (code: string) => map.get(code) ?? alias[code.toUpperCase()] ?? code;
  }, []);
  const categories = React.useMemo(() => {
    const set = new Set<string>();
    results.forEach((r) => set.add(categoryLabel(r.category?.trim() || '未分类')));
    return ['全部', ...Array.from(set)];
  }, [results, categoryLabel]);
  const shownSkus = React.useMemo(
    () =>
      activeCat === '全部'
        ? results
        : results.filter((r) => categoryLabel(r.category?.trim() || '未分类') === activeCat),
    [results, activeCat, categoryLabel],
  );

  /* ── 批发阶梯价：件数达标自动提示/应用 ── */
  const itemCount = React.useMemo(() => lines.reduce((s, l) => s + l.quantity, 0), [lines]);
  const wsEligible =
    !!wsTier && wsTier.enabled && Number(wsTier.minQty) > 0 && itemCount >= Number(wsTier.minQty) && goodsAmount > 0;
  const wsSave = wsEligible ? round2(goodsAmount * (1 - Number(wsTier?.discountRate ?? 1))) : 0;
  const wsSaveRef = React.useRef(0);
  wsSaveRef.current = wsSave;

  // 跨过门槛自动套用一次；回落到门槛以下自动撤回（只撤自动加的折扣，不动手工折扣）
  React.useEffect(() => {
    if (wsEligible && !wsAutoRef.current) {
      wsAutoRef.current = true;
      setWsApplied(true);
      setDiscount((d) => (d === 0 && wsSaveRef.current > 0 ? wsSaveRef.current : d));
    } else if (!wsEligible && wsAutoRef.current) {
      wsAutoRef.current = false;
      setWsApplied(false);
      setDiscount((d) => (Math.abs(d - wsSaveRef.current) < 0.01 ? 0 : d));
    }
  }, [wsEligible]);

  /* ── 组合收款：分配进度 ── */
  const comboAssigned = React.useMemo(
    () => round2(payRows.reduce((s, r) => s + (r.amount || 0), 0)),
    [payRows],
  );
  const comboRemaining = React.useMemo(() => round2(totalAmount - comboAssigned), [totalAmount, comboAssigned]);
  const comboHasCredit = payRows.some((r) => r.payMethod === 'CREDIT');
  const comboHasBalance = payRows.some((r) => r.payMethod === 'MEMBER_BALANCE');

  /* ── 选货 ── */

  const doSearch = React.useCallback(async (kw: string): Promise<PosSku[]> => {
    const q = kw.trim();
    if (!q) {
      // 清空搜索 → 回到浏览模式（按当前分类展示宫格）
      setActiveCat('全部');
      await loadGoods();
      return [];
    }
    setSearching(true);
    try {
      const list = await posApi.searchSkus(q);
      setResults(list);
      return list;
    } catch (e) {
      message.error(e instanceof Error ? e.message : '搜索失败');
      return [];
    } finally {
      setSearching(false);
    }
  }, [loadGoods]);

  const addLine = React.useCallback((sku: PosSku) => {
    if (sku.stock <= 0) {
      message.warning('该规格已无库存');
      return;
    }
    setLines((prev) => {
      const hit = prev.findIndex((l) => l.skuId === sku.skuId);
      if (hit >= 0) {
        const next = [...prev];
        const line = next[hit];
        if (line.quantity + 1 > line.stock) {
          message.warning(`库存仅剩 ${line.stock} 件`);
          return prev;
        }
        next[hit] = { ...line, quantity: line.quantity + 1 };
        return next;
      }
      return [
        ...prev,
        {
          skuId: sku.skuId,
          skuCode: sku.skuCode,
          styleNo: sku.styleNo,
          styleName: sku.styleName,
          color: sku.color,
          size: sku.size,
          tagPrice: sku.tagPrice,
          unitPrice: Number(sku.salesPrice ?? sku.tagPrice ?? 0),
          quantity: 1,
          stock: sku.stock,
        },
      ];
    });
  }, []);

  /**
   * 扫码回车：命中唯一结果直接加一件；多结果则列出来让人选。
   *
   * 放在 addLine 之后定义 —— useCallback 的依赖数组在**渲染期**求值，
   * 引用后声明的 const 会踩 TDZ。
   */
  const onScanEnter = React.useCallback(async () => {
    const kw = keyword.trim();
    if (!kw) return;
    const list = await doSearch(kw);
    if (list.length === 1) {
      addLine(list[0]);
      setKeyword('');
      await loadGoods();
      searchRef.current?.focus();
    }
  }, [keyword, doSearch, addLine, loadGoods]);

  /* ── 客户 ── */

  const loadCustomer = React.useCallback(async (p: string) => {
    const v = p.trim();
    if (v.length < 5) {
      setCustomer(null);
      return;
    }
    try {
      const c = await posApi.customer(v);
      setCustomer(c);
      if (c?.customerName) {
        setCustomerName((old) => old || c.customerName || '');
      }
    } catch {
      setCustomer(null);
    }
    // 会员识别与客户查询分开试：会员接口挂了不该影响按散客收银
    try {
      const m = await posApi.memberByPhone(v);
      setMember(m ?? null);
    } catch {
      setMember(null);
    }
  }, []);

  /** 带出该客户上次成交价（批发档口报价基准） */
  const lastPriceOf = React.useCallback(
    (skuId: number): number | null => {
      const raw = customer?.lastPrices?.[String(skuId)];
      return raw == null ? null : Number(raw);
    },
    [customer],
  );

  const applyLastPrices = React.useCallback(() => {
    if (!customer?.lastPrices) {
      message.info('该客户没有历史成交价');
      return;
    }
    let n = 0;
    setLines((prev) =>
      prev.map((l) => {
        const p = lastPriceOf(l.skuId);
        if (p == null) return l;
        n += 1;
        return { ...l, unitPrice: p };
      }),
    );
    message.success(n ? `已套用 ${n} 个商品的历史成交价` : '本单商品都没有历史成交价');
  }, [customer, lastPriceOf]);

  /* ── 开单 ── */

  const resetAll = React.useCallback(() => {
    setLines([]);
    setDiscount(0);
    setRoundOff(0);
    setReceived(null);
    setRemark('');
    setPayMethod('CASH');
    setKeyword('');
    setComboMode(false);
    setPayRows([]);
    setWsApplied(false);
    wsAutoRef.current = false;
    setActiveCat('全部');
    setResult(null);
    void loadGoods();
    searchRef.current?.focus();
  }, [loadGoods]);

  /** 拉小票并打开打印窗；拉不到不阻断开单（小票可以事后补打） */
  const openPrint = React.useCallback(async (
    saleId?: string | number | null,
    saleNo?: string | null,
  ) => {
    if (!saleId && !saleNo) return;
    try {
      const t = await ticketApi.getByBiz('POS_SALE', String(saleId ?? ''), saleNo ?? undefined);
      setPrintTicket(t);
    } catch (e) {
      message.warning(`小票加载失败，可稍后补打：${e instanceof Error ? e.message : '未知原因'}`);
    }
  }, []);

  const submit = React.useCallback(async () => {
    if (!lines.length) {
      message.warning('请先添加商品');
      return;
    }
    if (comboMode) {
      // 组合收款：前端先把明显不对的分配拦下来，给收银员即时纠错的机会
      if (!payRows.length) {
        message.warning('请至少添加一种收款方式');
        return;
      }
      if (payRows.some((r) => !r.amount || r.amount <= 0)) {
        message.warning('每种收款方式的金额必须大于 0');
        return;
      }
      if (comboRemaining > 0) {
        message.warning(`还有 ${formatMoney(comboRemaining)} 未收，请补充分配金额`);
        return;
      }
      if (comboRemaining < 0) {
        message.warning(`收款合计超出应收 ${formatMoney(-comboRemaining)}，请核对`);
        return;
      }
      if (comboHasBalance && !member) {
        message.warning('余额支付需先识别会员（输入手机号）');
        return;
      }
      if (comboHasCredit && !phone.trim()) {
        message.warning('挂账需要填写客户手机号');
        return;
      }
      if (comboHasCredit && !creditAuth.user.trim()) {
        message.warning('挂账需要店长或财务授权，请先填写授权账号');
        setCreditAuthOpen(true);
        return;
      }
    } else {
      if (payMethod === 'CREDIT' && !phone.trim()) {
        message.warning('挂账需要填写客户手机号');
        return;
      }
      // 挂账必须先取得店长/财务授权，否则直接拦在提交之前，
      // 不让收银员先开单再补授权（补了就等于没有约束）
      if (payMethod === 'CREDIT' && !creditAuth.user.trim()) {
        message.warning('挂账需要店长或财务授权，请先填写授权账号');
        setCreditAuthOpen(true);
        return;
      }
    }
    const withCredit = comboMode ? comboHasCredit : payMethod === 'CREDIT';
    setSubmitting(true);
    try {
      const res = (await posApi.checkout({
          items: lines.map((l) => ({ skuId: l.skuId, quantity: l.quantity, unitPrice: l.unitPrice })),
          payMethod: comboMode ? payRows[0].payMethod : payMethod,
          // 组合收款：每种方式一行；单方式走老协议（后端自动补明细行）
          ...(comboMode ? { payments: payRows.map((r) => ({ payMethod: r.payMethod, amount: r.amount })) } : {}),
          ...(withCredit
            ? {
                creditApprover: creditAuth.user.trim(),
                creditApproverPassword: creditAuth.pwd,
              }
            : {}),
          memberId: member?.id,
          discount: discount || 0,
          roundOff: roundOff || 0,
          customerName: customerName.trim() || undefined,
          customerPhone: phone.trim() || undefined,
          remark: remark.trim() || undefined,
        }));
      if (res?.payStatus === 'PAYING' && res.qrCode) {
        // 在线支付：先不结算，把二维码给顾客扫，等渠道确认（回调/轮询）才出库
        setPayInfo({
          saleNo: res.saleNo,
          qrCode: res.qrCode,
          totalAmount: Number(res.totalAmount ?? 0),
          payMethod: res.payMethod,
          expireSeconds: res.expireSeconds,
        });
        void loadToday();
        return;
      }
      setResult(res);
      setLines([]);
      // 当场出小票：专业收银打完小票这一单才算结束，顾客会当场要
      void openPrint(res.saleId, res.saleNo);
      setDiscount(0);
      setRoundOff(0);
      setReceived(null);
      setRemark('');
      setComboMode(false);
      setPayRows([]);
      setWsApplied(false);
      wsAutoRef.current = false;
      void loadToday();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '开单失败');
    } finally {
      setSubmitting(false);
    }
  }, [
    lines, comboMode, payRows, comboRemaining, comboHasCredit, comboHasBalance,
    payMethod, phone, member, creditAuth, discount, roundOff, customerName, remark,
    loadToday,
  ]);

  /**
   * 待支付单轮询：每 2 秒问一次服务端。
   *
   * 服务端在 pay-state 里会**主动向微信/支付宝查询**并就地确认，
   * 所以即使支付回调丢了（网络抖动、发布重启、回调地址配错），这里也能把单子推进到已支付。
   */
  React.useEffect(() => {
    if (!payInfo) {
      return undefined;
    }
    let stopped = false;
    const tick = async () => {
      try {
        const st = (await posApi.payState(payInfo.saleNo)) as unknown as {
          paid: boolean;
          payStatus: string;
          outstockNo?: string | null;
        };
        if (stopped) return;
        if (st?.paid) {
          setPayInfo(null);
          setResult({
            saleNo: payInfo.saleNo,
            goodsAmount: 0,
            discountAmount: 0,
            roundOffAmount: 0,
            totalAmount: payInfo.totalAmount,
            payMethod: payInfo.payMethod,
            payStatus: 'PAID',
            itemCount: 0,
            outstockNo: st.outstockNo ?? null,
          } as PosCheckoutResult);
          setLines([]);
          setDiscount(0);
          setRoundOff(0);
          setReceived(null);
          setRemark('');
          void loadToday();
        } else if (st?.payStatus === 'CANCELLED') {
          setPayInfo(null);
          message.warning('该单已取消');
          void loadToday();
        }
      } catch {
        // 轮询失败不打断收银：下一轮再试
      }
    };
    const timer = window.setInterval(() => void tick(), 2000);
    void tick();
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [payInfo, loadToday]);

  /** 二维码倒计时 */
  React.useEffect(() => {
    if (!payInfo) {
      return undefined;
    }
    setPayLeft(payInfo.expireSeconds ?? 900);
    const timer = window.setInterval(() => {
      setPayLeft((v) => (v <= 0 ? 0 : v - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [payInfo]);

  /** 取消待支付单（顾客不买了 / 换支付方式） */
  const cancelPay = React.useCallback(async () => {
    if (!payInfo) return;
    setCancelling(true);
    try {
      await posApi.cancelPay(payInfo.saleNo, '收银员取消');
      setPayInfo(null);
      message.info('已取消该笔待支付');
      void loadToday();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '取消失败');
    } finally {
      setCancelling(false);
    }
  }, [payInfo, loadToday]);

  /* ── 款式图 / 款号（铁律 15）── */

  const { imageMap, briefBySku, fetchBySkuCodes } = useStyleCoverImages();

  // 购物车：本单里的每一件都要看得见是什么货
  React.useEffect(() => {
    void fetchBySkuCodes(lines.map((l) => l.skuCode));
  }, [lines, fetchBySkuCodes]);

  // 选货结果
  React.useEffect(() => {
    void fetchBySkuCodes(results.map((r) => r.skuCode));
  }, [results, fetchBySkuCodes]);

  // 今日单据：后端已带出首件商品 skuCode
  React.useEffect(() => {
    void fetchBySkuCodes((today?.recent ?? []).map((r) => r.skuCode));
  }, [today, fetchBySkuCodes]);

  /* ── 表格 ── */

  const columns: ColumnsType<CartLine> = [
    // 款式图 + 款号（铁律 15）：款号由后端 /style/sku/brief 权威解析，前端不猜
    styleImageColumn<CartLine>({ imageMap, skuCode: (r) => r.skuCode }),
    styleNoColumn<CartLine>({ briefBySku, skuCode: (r) => r.skuCode, width: 170 }),
    {
      title: '品名',
      dataIndex: 'styleName',
      render: (_v, r) => r.styleName || '—',
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      width: 120,
      render: (v: number, r) => {
        const last = lastPriceOf(r.skuId);
        const changed = r.tagPrice != null && v !== Number(r.tagPrice);
        return (
          <Space direction="vertical" size={0}>
            <InputNumber
              value={v}
              min={0}
              precision={2}
              size="small"
              style={{ width: 104 }}
              onChange={(nv) =>
                setLines((prev) =>
                  prev.map((l) => (l.skuId === r.skuId ? { ...l, unitPrice: Number(nv) || 0 } : l)),
                )
              }
            />
            {last != null ? (
              <Text type="secondary" style={{ fontSize: 11 }}>
                上次 ¥{last.toFixed(2)}
              </Text>
            ) : changed ? (
              <Text type="secondary" style={{ fontSize: 11 }}>
                吊牌 ¥{Number(r.tagPrice).toFixed(2)}
              </Text>
            ) : null}
          </Space>
        );
      },
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      width: 116,
      // 行内 ± 步进：加一件/减一件是收银台最高频动作，不能每次都弹输入框
      render: (v: number, r) => (
        <div className="pos-qty">
          <button
            type="button"
            className="pos-qty__btn"
            aria-label="减一件"
            disabled={v <= 1}
            onClick={() =>
              setLines((prev) =>
                prev.map((l) => (l.skuId === r.skuId ? { ...l, quantity: Math.max(1, l.quantity - 1) } : l)),
              )
            }
          >
            −
          </button>
          <span className="pos-qty__num">{v}</span>
          <button
            type="button"
            className="pos-qty__btn"
            aria-label="加一件"
            disabled={v >= r.stock}
            onClick={() =>
              setLines((prev) =>
                prev.map((l) => (l.skuId === r.skuId ? { ...l, quantity: Math.min(r.stock, l.quantity + 1) } : l)),
              )
            }
          >
            +
          </button>
        </div>
      ),
    },
    {
      title: '小计',
      dataIndex: 'unitPrice',
      width: 90,
      align: 'right',
      render: (v: number, r) => formatMoney(round2(v * r.quantity)),
    },
    {
      title: '',
      width: 48,
      render: (_v, r) => (
        <Button
          danger
          type="text"
          size="middle"
          className="pos-del"
          icon={<DeleteOutlined />}
          aria-label="删除本行"
          onClick={() => setLines((prev) => prev.filter((l) => l.skuId !== r.skuId))}
        />
      ),
    },
  ];

  return (
    <div className="pos-page">
      <div className="pos-head">
        <div className="pos-head__title">
          <ShoppingCartOutlined /> 收银台
        </div>
        <Space size={24} wrap>
          <Statistic title="今日单数" value={Number(today?.summary?.saleCount ?? 0)} />
          <Statistic title="今日件数" value={Number(today?.summary?.itemCount ?? 0)} />
          <Statistic title="今日收款" value={Number(today?.summary?.amount ?? 0)} precision={2} prefix="¥" />
          <Statistic
            title="其中挂账"
            value={Number(today?.summary?.creditAmount ?? 0)}
            precision={2}
            prefix="¥"
            valueStyle={{ color: '#d46b08' }}
          />
          <Button icon={<AppstoreOutlined />} onClick={() => {
            // 回后台前先退出全屏，别让后台页面也铺满整屏
            if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
            navigate('/dashboard');
          }}>
            返回后台
          </Button>
          <Button
            icon={isFull ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            onClick={toggleFullscreen}
          >
            {isFull ? '退出全屏' : '全屏'}
          </Button>
          <Button icon={<TagsOutlined />} onClick={() => {
            setWsDraft({
              minQty: Number(wsTier?.minQty ?? 0) || 10,
              discountRate: Number(wsTier?.discountRate ?? 1) || 0.9,
              enabled: !!wsTier?.enabled,
            });
            setWsOpen(true);
          }}>
            批发价{wsTier?.enabled ? '·开' : ''}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void loadToday()}>
            刷新
          </Button>
        </Space>
      </div>

      {/* D-816/D-817：收银台内三个分区。
          用分段器做导航 + 条件渲染，而不是把原收银界面塞进 Tabs.children ——
          那需要给 360 行既有 JSX 再套一层括号，极易失衡；片段包裹不会改变原有结构。
          购物车 state 在本组件，切分区不丢。 */}
      <Segmented
        value={tab}
        onChange={(v) => setTab(v as 'checkout' | 'return' | 'hold' | 'shift')}
        options={[
          { label: '收银', value: 'checkout', icon: <ShoppingCartOutlined /> },
          { label: '退货 / 换货', value: 'return', icon: <RollbackOutlined /> },
          { label: '挂单', value: 'hold', icon: <PauseCircleOutlined /> },
          { label: '交接班', value: 'shift', icon: <FieldTimeOutlined /> },
        ]}
        style={{ marginBottom: 16 }}
      />

      {tab === 'checkout' && (
        <>
          <div className="pos-body">
            {/* 本单栏固定宽度：收银员靠肌肉记忆找输入格/删除键/收款键，
                宽度必须恒定，不能随屏幕百分比变化。 */}
            <div className="pos-body__bill">
              <Card size="small" title="本单" className="pos-card">
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    prefix={<UserOutlined />}
                    placeholder="客户手机号（会员识别 / 挂账必填）"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onBlur={() => void loadCustomer(phone)}
                    onPressEnter={() => void loadCustomer(phone)}
                  />
                  <Button onClick={applyLastPrices} disabled={!customer?.lastPrices}>
                    带出历史价
                  </Button>
                </Space.Compact>
                {customer?.customerName ? (
                  <div style={{ marginTop: 6 }}>
                    <Tag color="blue">{customer.customerName}</Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      老客户
                    </Text>
                  </div>
                ) : null}
                <Input
                  style={{ marginTop: 8 }}
                  placeholder="客户名称（可选）"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />

                <Table<CartLine>
                  rowKey="skuId"
                  size="small"
                  style={{ marginTop: 8 }}
                  columns={columns}
                  dataSource={lines}
                  pagination={false}
                  scroll={{ y: 260 }}
                  locale={{ emptyText: '还没有商品' }}
                />

                <Divider style={{ margin: '10px 0' }} />

                {wsEligible ? (
                  <Alert
                    type="success"
                    showIcon
                    style={{ marginBottom: 8 }}
                    message={
                      <Space size={8} wrap>
                        <span>
                          已达批发价：满 {wsTier?.minQty} 件享{' '}
                          <b>{Number(wsTier?.discountRate ?? 1) * 10} 折</b>，可省{' '}
                          {formatMoney(wsSave)}
                        </span>
                        {wsApplied && discount > 0 ? (
                          <Button size="small" type="link" onClick={() => setDiscount(0)}>
                            撤销
                          </Button>
                        ) : (
                          <Button size="small" type="primary" onClick={() => setDiscount(wsSave)}>
                            一键应用
                          </Button>
                        )}
                      </Space>
                    }
                  />
                ) : null}

                <Row gutter={8}>
                  <Col span={8}>
                    <div className="pos-label">商品金额</div>
                    <div className="pos-amount">{formatMoney(goodsAmount)}</div>
                  </Col>
                  <Col span={8}>
                    <div className="pos-label">整单折扣</div>
                    <InputNumber
                      value={discount}
                      min={0}
                      max={goodsAmount}
                      precision={2}
                      style={{ width: '100%' }}
                      onChange={(v) => setDiscount(Number(v) || 0)}
                    />
                  </Col>
                  <Col span={8}>
                    <div className="pos-label">抹零</div>
                    <InputNumber
                      value={roundOff}
                      min={0}
                      max={goodsAmount}
                      precision={2}
                      style={{ width: '100%' }}
                      onChange={(v) => setRoundOff(Number(v) || 0)}
                    />
                  </Col>
                </Row>

                {member ? (
                  <div className="pos-member">
                    <Space size={8} wrap>
                      <Tag color="gold">{member.name || member.phone}</Tag>
                      <Text type="secondary">{member.memberNo}</Text>
                      {Number(member.discountRate) < 1 ? (
                        <Tag color="blue">
                          会员价 {Number(member.discountRate) * 10} 折
                        </Tag>
                      ) : null}
                      <Tag color={Number(member.balance) > 0 ? 'green' : 'default'}>
                        余额 {formatMoney(member.balance)}
                      </Tag>
                      <Button size="small" onClick={() => setMemberOpen(true)}>
                        充值
                      </Button>
                      <Button size="small" type="text" onClick={() => setMember(null)}>
                        取消关联
                      </Button>
                    </Space>
                  </div>
                ) : (
                  <div className="pos-member">
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      输入客户手机号自动识别会员（享会员价与储值余额）
                    </Text>
                  </div>
                )}

                <div className="pos-label" style={{ marginTop: 8 }}>
                  收款方式
                </div>
                {comboMode ? (
                  <div className="pos-combo">
                    {payRows.map((row, i) => (
                      <Space.Compact key={`${row.payMethod}-${i}`} style={{ width: '100%', marginBottom: 6 }}>
                        <Select<PosPayMethod>
                          style={{ width: 128 }}
                          value={row.payMethod}
                          options={COMBO_OPTIONS.map((o) => ({
                            ...o,
                            // 已被其他行占用的方式不再出现，重复方式后端会拒
                            disabled: payRows.some((r, j) => j !== i && r.payMethod === o.value),
                          }))}
                          onChange={(v) =>
                            setPayRows((prev) => prev.map((r, j) => (j === i ? { ...r, payMethod: v } : r)))
                          }
                        />
                        <InputNumber
                          value={row.amount || undefined}
                          min={0}
                          precision={2}
                          placeholder="金额"
                          style={{ flex: 1 }}
                          onChange={(v) =>
                            setPayRows((prev) =>
                              prev.map((r, j) => (j === i ? { ...r, amount: Number(v) || 0 } : r)),
                            )
                          }
                        />
                        <Button
                          icon={<DeleteOutlined />}
                          onClick={() => setPayRows((prev) => prev.filter((_, j) => j !== i))}
                        />
                      </Space.Compact>
                    ))}
                    <Space size={8} wrap>
                      <Button
                        size="small"
                        icon={<PlusOutlined />}
                        disabled={payRows.length >= 4}
                        onClick={() =>
                          setPayRows((prev) => {
                            const used = new Set(prev.map((r) => r.payMethod));
                            const next = COMBO_OPTIONS.find((o) => !used.has(o.value))?.value ?? 'CASH';
                            return [...prev, { payMethod: next, amount: 0 }];
                          })
                        }
                      >
                        加一种收款方式
                      </Button>
                      <Button
                        size="small"
                        type="text"
                        onClick={() => {
                          setComboMode(false);
                          setPayRows([]);
                        }}
                      >
                        返回单一收款
                      </Button>
                    </Space>
                    <div className="pos-combo__rest">
                      已分配 <b>{formatMoney(comboAssigned)}</b> · 剩余{' '}
                      <b style={{ color: comboRemaining === 0 ? 'var(--color-success, #389e0d)' : 'var(--color-error, #cf1322)' }}>
                        {formatMoney(comboRemaining)}
                      </b>
                    </div>
                  </div>
                ) : (
                  <>
                    <Radio.Group
                      value={payMethod}
                      onChange={(e) => {
                        const next = e.target.value as PosPayMethod;
                        setPayMethod(next);
                        // 一选挂账就弹授权：把「要先授权」这件事提前，
                        // 而不是等到点收款才被拦，节拍上少一次挫败
                        if (next === 'CREDIT') setCreditAuthOpen(true);
                      }}
                      optionType="button"
                      buttonStyle="solid"
                      options={PAY_OPTIONS.map((o) => ({
                        ...o,
                        // 未配置商户号的在线渠道直接置灰：让收银员一眼看出"这个收不了"，
                        // 而不是点了才弹报错（收款方式配置在「店铺管理 → 收款设置」）
                        disabled:
                          (o.value === 'WECHAT' && !channels?.WECHAT_PAY) ||
                          (o.value === 'ALIPAY' && !channels?.ALIPAY),
                      }))}
                    />
                    <div>
                      <Button
                        type="link"
                        size="small"
                        icon={<PlusOutlined />}
                        style={{ paddingLeft: 0, marginTop: 4 }}
                        onClick={() => {
                          // 微信/支付宝进不了组合（在线通道一笔单一个金额），默认换成现金行
                          const first: PosPayMethod =
                            payMethod === 'WECHAT' || payMethod === 'ALIPAY' ? 'CASH' : payMethod;
                          setPayRows([{ payMethod: first, amount: 0 }]);
                          setComboMode(true);
                        }}
                      >
                        组合收款（多种方式混收，如现金+刷卡）
                      </Button>
                    </div>
                  </>
                )}
                {payMethod === 'WECHAT' || payMethod === 'ALIPAY' ? (
                  <Alert
                    style={{ marginTop: 8 }}
                    type="info"
                    showIcon
                    message="顾客扫屏幕上的二维码付款，收到款项后自动出库"
                  />
                ) : null}

                {payMethod === 'CREDIT' || comboHasCredit ? (
                  <Alert
                    style={{ marginTop: 8 }}
                    type="warning"
                    showIcon
                    message="挂账会生成一条应收单，请在「收付款中心」核销"
                  />
                ) : null}

                <Input
                  style={{ marginTop: 8 }}
                  placeholder="备注（可选）"
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                />

              </Card>

              <Card size="small" title="今日单据" className="pos-card" style={{ marginTop: 12 }}>
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={today?.recent ?? []}
                  locale={{ emptyText: '今天还没有单据' }}
                  // 展开看该单全部商品：只显示首件的话，一单多件时
                  // 收银员无从核对这个单到底卖了什么。
                  expandable={{
                    rowExpandable: (r) => (r.items?.length ?? 0) > 1,
                    expandedRowRender: (r) => (
                      <div className="pos-sale-items">
                        {(r.items ?? []).map((it, i) => (
                          <div key={`${it.skuId ?? i}`} className="pos-sale-items__row">
                            <StyleImageCell
                              skuCode={it.skuCode ?? undefined}
                              imageMap={imageMap}
                            />
                            <span className="pos-sale-items__name">
                              {it.styleName || it.styleNo || it.skuCode || '—'}
                            </span>
                            <span className="pos-sale-items__spec">
                              {[it.styleNo, it.color, it.size].filter(Boolean).join(' / ')}
                            </span>
                            <span className="pos-sale-items__qty">×{it.quantity ?? 0}</span>
                            <span className="pos-sale-items__amt">
                              {formatMoney(Number(it.amount ?? 0))}
                            </span>
                          </div>
                        ))}
                      </div>
                    ),
                  }}
                  onExpand={(expanded, record) => {
                    // 只在展开时拉图，避免一屏 20 单全量预请求
                    if (expanded) {
                      void fetchBySkuCodes((record.items ?? []).map((i) => i.skuCode));
                    }
                  }}
                  columns={[
                    styleImageColumn<PosRecentSale>({
                      imageMap,
                      skuCode: (r) => r.skuCode,
                    }),
                    styleNoColumn<PosRecentSale>({
                      briefBySku,
                      skuCode: (r) => r.skuCode,
                      width: 140,
                    }),
                    { title: '单号', dataIndex: 'saleNo', width: 170 },
                    { title: '客户', dataIndex: 'customerName', render: (v: string) => v || '散客' },
                    { title: '件数', dataIndex: 'itemCount', width: 60 },
                    {
                      title: '金额',
                      dataIndex: 'totalAmount',
                      width: 100,
                      align: 'right',
                      render: (v: number) => formatMoney(v),
                    },
                    {
                      title: '方式',
                      dataIndex: 'payMethod',
                      width: 80,
                      render: (v: string, r) => (
                        <Tag color={r.payStatus === 'UNPAID' ? 'orange' : 'green'}>
                          {PAY_OPTIONS.find((o) => o.value === v)?.label ?? v}
                          {r.payStatus === 'UNPAID' ? '(挂账)' : ''}
                        </Tag>
                      ),
                    },
                    {
                      title: '',
                      width: 56,
                      render: (_v: string, r) => (
                        <Button
                          type="link"
                          size="small"
                          icon={<ProfileOutlined />}
                          onClick={() => void openPrint(r.id, r.saleNo)}
                        >
                          打印
                        </Button>
                      ),
                    },
                  ]}
                />
              </Card>
            {/* 吸底收款条：专业收银的收款键位置恒定，收银员不用低头找。
                应收/实收/找零/收款全部集中在这里，表单区只管填单。 */}
            <div className="pos-paybar">
              <div className="pos-paybar__due">
                <span className="pos-paybar__label">应收</span>
                <span className="pos-paybar__num">{formatMoney(totalAmount)}</span>
              </div>

              {payMethod === 'CASH' ? (
                <>
                  <div className="pos-paybar__field">
                    <span className="pos-paybar__label">实收现金</span>
                    <InputNumber
                      value={received}
                      min={0}
                      precision={2}
                      placeholder="点右侧键盘输入"
                      style={{ width: 130 }}
                      onChange={(v) => setReceived(v == null ? null : Number(v))}
                    />
                    <Button icon={<CalculatorOutlined />} onClick={() => setCashOpen(true)}>
                      键盘
                    </Button>
                  </div>
                  <div className="pos-paybar__field">
                    <span className="pos-paybar__label">找零</span>
                    <span className="pos-paybar__change">
                      {changeAmount == null ? '—' : formatMoney(Math.max(0, changeAmount))}
                    </span>
                  </div>
                </>
              ) : null}

              <Button
                type="primary"
                size="large"
                className="pos-paybar__go"
                loading={submitting}
                disabled={!lines.length}
                onClick={() => void submit()}
              >
                {payMethod === 'CREDIT' ? '挂账开单' : `收款 ${formatMoney(totalAmount)}`}
              </Button>
            </div>
            </div>
            <div className="pos-body__pick">
              <Card size="small" title="选货（扫码枪回车即加一件）" className="pos-card">
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    ref={searchRef}
                    autoFocus
                    allowClear
                    prefix={<ScanOutlined />}
                    placeholder="扫条码 / 输款号、商品编码、款名"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onPressEnter={onScanEnter}
                  />
                  <Button type="primary" loading={searching} onClick={() => void doSearch(keyword)}>
                    查询
                  </Button>
                </Space.Compact>

                <div className="pos-cats">
                  {categories.map((c) => (
                    <button
                      type="button"
                      key={c}
                      className={'pos-cat' + (activeCat === c ? ' pos-cat--on' : '')}
                      onClick={() => setActiveCat(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>

                <div className="pos-results pos-grid">
                  {shownSkus.length === 0 ? (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={searching ? '查询中…' : activeCat === '全部' ? '输入后回车查询，或直接扫码' : '该分类暂无在售商品'}
                    />
                  ) : (
                    shownSkus.map((sku) => (
                      <button
                        type="button"
                        key={sku.skuId}
                        className={'pos-sku' + (sku.stock <= 0 ? ' pos-sku--out' : '')}
                        onClick={() => addLine(sku)}
                      >
                        <div className="pos-sku__thumb">
                          {/* fill：铺满 1:1 图区（44px 表格缩略图在宫格里太小，认不出款） */}
                          <StyleImageCell skuCode={sku.skuCode ?? undefined} imageMap={imageMap} fill />
                        </div>
                        <div className="pos-sku__name">{sku.styleName || sku.styleNo || '未命名'}</div>
                        <div className="pos-sku__spec">
                          {[briefBySku[sku.skuCode ?? '']?.styleNo ?? sku.styleNo, sku.color, sku.size]
                            .filter(Boolean)
                            .join(' / ')}
                        </div>
                        <div className="pos-sku__foot">
                          <span className="pos-sku__price">
                            {formatMoney(Number(sku.salesPrice ?? sku.tagPrice ?? 0))}
                          </span>
                          <Tag color={sku.stock > 0 ? 'green' : 'red'} bordered={false}>
                            {sku.stock > 0 ? `库存 ${sku.stock}` : '无库存'}
                          </Tag>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </Card>
            </div>
          </div>


          <TicketPrint
            open={!!printTicket}
            ticket={printTicket}
            onClose={() => setPrintTicket(null)}
          />

          {/* 会员充值 */}
          <Modal
            open={memberOpen}
            title={`会员充值 · ${member?.name || member?.phone || ''}`}
            okText="确认充值"
            cancelText="取消"
            onCancel={() => setMemberOpen(false)}
            onOk={async () => {
              if (!member || !rechargeAmount) {
                message.warning('请填写充值金额');
                return;
              }
              try {
                const m = await posApi.rechargeMember({
                  memberId: member.id,
                  amount: rechargeAmount,
                });
                setMember(m);
                setRechargeAmount(0);
                setMemberOpen(false);
                message.success(`充值成功，当前余额 ${formatMoney(m.balance)}`);
              } catch (e: unknown) {
                message.error(e instanceof Error ? e.message : '充值失败');
              }
            }}
            width={400}
          >
            <div style={{ marginBottom: 12 }}>
              <Text type="secondary">当前余额</Text>
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-primary)' }}>
                {formatMoney(member?.balance ?? 0)}
              </div>
            </div>
            <InputNumber
              min={1}
              precision={2}
              prefix="¥"
              style={{ width: '100%' }}
              value={rechargeAmount || undefined}
              placeholder="充值金额"
              onChange={(v) => setRechargeAmount(Number(v) || 0)}
            />
            <Space wrap style={{ marginTop: 12 }}>
              {[100, 500, 1000, 2000].map((v) => (
                <Button key={v} size="small" onClick={() => setRechargeAmount(v)}>
                  {v}
                </Button>
              ))}
            </Space>
          </Modal>

          {/* 批发阶梯价设置：满 N 件整单打 X 折，覆盖式单档配置 */}
          <Modal
            open={wsOpen}
            title="批发阶梯价设置"
            okText="保存"
            cancelText="取消"
            confirmLoading={wsSaving}
            onCancel={() => setWsOpen(false)}
            onOk={async () => {
              if (wsDraft.minQty < 2) {
                message.warning('批发件数门槛至少 2 件');
                return;
              }
              if (wsDraft.discountRate <= 0 || wsDraft.discountRate > 1) {
                message.warning('折扣率请在 0 ~ 1 之间（0.90 = 九折）');
                return;
              }
              setWsSaving(true);
              try {
                const saved = await posApi.saveWholesaleTier(wsDraft);
                setWsTier(saved);
                setWsOpen(false);
                message.success(saved.enabled ? '批发价已启用' : '批发价已停用');
              } catch (e) {
                message.error(e instanceof Error ? e.message : '保存失败');
              } finally {
                setWsSaving(false);
              }
            }}
            width={440}
          >
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <div>
                <div className="pos-label">件数门槛（满多少件触发）</div>
                <InputNumber
                  min={2}
                  precision={0}
                  style={{ width: '100%' }}
                  value={wsDraft.minQty || undefined}
                  onChange={(v) => setWsDraft((d) => ({ ...d, minQty: Number(v) || 0 }))}
                />
              </div>
              <div>
                <div className="pos-label">折扣率（0.90 = 九折）</div>
                <InputNumber
                  min={0.01}
                  max={1}
                  step={0.05}
                  precision={2}
                  style={{ width: '100%' }}
                  value={wsDraft.discountRate}
                  onChange={(v) => setWsDraft((d) => ({ ...d, discountRate: Number(v) || 0 }))}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text type="secondary">启用后，件数达标会在本单自动提示并应用</Text>
                <Switch
                  checked={wsDraft.enabled}
                  onChange={(v) => setWsDraft((d) => ({ ...d, enabled: v }))}
                />
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                批发价以「整单折扣」落地，不改动逐行单价；与会员折扣叠加时以后填的为准。
              </Text>
            </Space>
          </Modal>

          {/* 挂账授权：不到账也能出单，必须有人签字，否则资损口子敞开 */}
          <Modal
            open={creditAuthOpen}
            title="挂账授权"
            okText="已授权，去挂账"
            cancelText="取消"
            onCancel={() => setCreditAuthOpen(false)}
            onOk={() => {
              if (!creditAuth.user.trim()) {
                message.warning('请填写授权账号');
                return;
              }
              setCreditAuthOpen(false);
              void submit();
            }}
            width={420}
          >
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message="挂账是唯一「不到账也能出单」的收款方式"
              description="需店长 / 财务输入授权账号与密码。授权人会被记入本单备注，事后对账可追溯。"
            />
            <Space direction="vertical" style={{ width: '100%' }} size={10}>
              <Input
                placeholder="授权账号"
                autoComplete="off"
                value={creditAuth.user}
                onChange={(e) =>
                  setCreditAuth((v) => ({ ...v, user: e.target.value, pwd: '' }))
                }
              />
              <Input.Password
                placeholder="授权密码"
                autoComplete="new-password"
                value={creditAuth.pwd}
                onChange={(e) => setCreditAuth((v) => ({ ...v, pwd: e.target.value }))}
                onPressEnter={() => {
                  if (creditAuth.user.trim()) {
                    setCreditAuthOpen(false);
                    void submit();
                  }
                }}
              />
            </Space>
          </Modal>

          {/* 现金数字键盘：大按键盲打，避免在触屏小键盘上输错一分 */}
          <CashNumpad
            open={cashOpen}
            due={totalAmount}
            onCancel={() => setCashOpen(false)}
            onConfirm={(v) => {
              setReceived(v);
              setCashOpen(false);
            }}
          />

          {/* 待支付：展示二维码 + 倒计时，收银员可随时取消 */}
          <Modal
            open={!!payInfo}
            title="等待顾客付款"
            footer={null}
            onCancel={() => void cancelPay()}
            maskClosable={false}
            width={380}
          >
            {payInfo ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: '#8c8c8c' }}>应收</div>
                <div className="pos-total__num" style={{ marginBottom: 8 }}>
                  {formatMoney(payInfo.totalAmount)}
                </div>
                {payInfo.qrCode ? (
                  <div style={{ display: 'inline-block', padding: 8, background: '#fff', borderRadius: 8 }}>
                    <QRCodeSVG value={payInfo.qrCode} size={220} level="M" />
                  </div>
                ) : (
                  <Alert type="warning" showIcon message="渠道未返回二维码，请取消后重试" />
                )}
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary">
                    {payInfo.payMethod === 'WECHAT' ? '微信' : '支付宝'}扫码付款 ·
                    剩余 {Math.floor(payLeft / 60)}:{(payLeft % 60).toString().padStart(2, '0')}
                  </Text>
                </div>
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    单号 {payInfo.saleNo}
                  </Text>
                </div>
                <Button style={{ marginTop: 12 }} loading={cancelling} onClick={() => void cancelPay()}>
                  取消这笔
                </Button>
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    付款成功后会自动出库并计入今日收款，无需再点确认
                  </Text>
                </div>
              </div>
            ) : null}
          </Modal>

          <Modal
            open={!!result}
            title="开单成功"
            onOk={resetAll}
            onCancel={resetAll}
            okText="继续开单"
            cancelButtonProps={{ style: { display: 'none' } }}
          >
            {result ? (
              <div>
                <div className="pos-done__row">
                  <span>销售单号</span>
                  <Text copyable>{result.saleNo}</Text>
                </div>
                <div className="pos-done__row">
                  <span>商品金额</span>
                  <span>{formatMoney(result.goodsAmount)}</span>
                </div>
                {Number(result.discountAmount) > 0 ? (
                  <div className="pos-done__row">
                    <span>折扣</span>
                    <span>-{formatMoney(result.discountAmount)}</span>
                  </div>
                ) : null}
                {Number(result.roundOffAmount) > 0 ? (
                  <div className="pos-done__row">
                    <span>抹零</span>
                    <span>-{formatMoney(result.roundOffAmount)}</span>
                  </div>
                ) : null}
                <div className="pos-done__row pos-done__row--total">
                  <span>应收</span>
                  <span>{formatMoney(result.totalAmount)}</span>
                </div>
                {changeAmount != null && changeAmount >= 0 ? (
                  <div className="pos-done__row">
                    <span>找零</span>
                    <span>{formatMoney(changeAmount)}</span>
                  </div>
                ) : null}
                {result.receivableId ? (
                  <Alert
                    style={{ marginTop: 8 }}
                    type="warning"
                    showIcon
                    message="已生成应收单，请在「收付款中心」核销"
                  />
                ) : null}
                {result.saleId ? (
                  <Button
                    block
                    style={{ marginTop: 8 }}
                    icon={<ProfileOutlined />}
                    onClick={() => setTicket({ id: Number(result.saleId), saleNo: result.saleNo })}
                  >
                    查看电子小票（扫码签收）
                  </Button>
                ) : null}
              </div>
            ) : null}
          </Modal>

          {/* 电子小票：开单成功 / 今日单据均可打开 */}
        </>
      )}

      {tab === 'return' && (
        <PosReturnPanel onGoCheckout={() => setTab('checkout')} />
      )}

      {tab === 'shift' && <PosShiftPanel />}

      {tab === 'hold' && (
        <PosHoldPanel
          cartLines={lines}
          customerName={customerName || null}
          customerPhone={phone || null}
          payMethod={payMethod}
          onResumed={({ lines: restored, customerName: cn, customerPhone: cp, payMethod: pm }) => {
            setLines(restored as typeof lines);
            if (cn) setCustomerName(cn);
            if (cp) setPhone(cp);
            if (pm) setPayMethod(pm as PosPayMethod);
            setTab('checkout');
            message.success('已取回到收银台，请继续收款');
          }}
        />
      )}

      <TicketModal
        open={!!ticket}
        onClose={() => setTicket(null)}
        sourceBizType="POS_SALE"
        sourceBizId={ticket?.id ?? 0}
        sourceBizNo={ticket?.saleNo}
      />
    </div>
  );
};

export default PosTerminal;
