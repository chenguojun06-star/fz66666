import React from 'react';
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
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { InputRef } from 'antd';
import {
  DeleteOutlined,
  ReloadOutlined,
  ScanOutlined,
  ShoppingCartOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { message } from '@/utils/antdStatic';
import { unwrapApiData } from '@/utils/api';
import { formatMoney } from '@/utils/format';
import posApi from '@/services/pos/posApi';
import type {
  PosChannelReadiness,
  PosCheckoutResult,
  PosCustomer,
  PosPayInfo,
  PosPayMethod,
  PosSku,
  PosToday,
} from '@/services/pos/posApi';
import { QRCodeSVG } from 'qrcode.react';
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
  { value: 'CREDIT', label: '挂账' },
];

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

  const searchRef = React.useRef<InputRef>(null);

  const loadToday = React.useCallback(async () => {
    try {
      setToday(unwrapApiData<PosToday>(await posApi.today(), '加载今日汇总失败'));
    } catch {
      // 交班数据拿不到不该影响开单
    }
  }, []);

  React.useEffect(() => {
    void loadToday();
    void (async () => {
      try {
        setChannels(unwrapApiData<PosChannelReadiness>(await posApi.channels(), '渠道状态加载失败'));
      } catch {
        // 拿不到渠道状态就按"都不可用"处理：宁可让收银员用现金，也不能点了报错
        setChannels(null);
      }
    })();
  }, [loadToday]);

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

  /* ── 选货 ── */

  const doSearch = React.useCallback(async (kw: string): Promise<PosSku[]> => {
    const q = kw.trim();
    if (!q) {
      setResults([]);
      return [];
    }
    setSearching(true);
    try {
      const list = unwrapApiData<PosSku[]>(await posApi.searchSkus(q), '搜索失败');
      setResults(list);
      return list;
    } catch (e) {
      message.error(e instanceof Error ? e.message : '搜索失败');
      return [];
    } finally {
      setSearching(false);
    }
  }, []);

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
      setResults([]);
      searchRef.current?.focus();
    }
  }, [keyword, doSearch, addLine]);

  /* ── 客户 ── */

  const loadCustomer = React.useCallback(async (p: string) => {
    const v = p.trim();
    if (v.length < 5) {
      setCustomer(null);
      return;
    }
    try {
      const c = unwrapApiData<PosCustomer>(await posApi.customer(v), '查询客户失败');
      setCustomer(c);
      if (c?.customerName) {
        setCustomerName((old) => old || c.customerName || '');
      }
    } catch {
      setCustomer(null);
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
    setResults([]);
    setResult(null);
    searchRef.current?.focus();
  }, []);

  const submit = React.useCallback(async () => {
    if (!lines.length) {
      message.warning('请先添加商品');
      return;
    }
    if (payMethod === 'CREDIT' && !phone.trim()) {
      message.warning('挂账需要填写客户手机号');
      return;
    }
    setSubmitting(true);
    try {
      const res = unwrapApiData<PosCheckoutResult>(
        await posApi.checkout({
          items: lines.map((l) => ({ skuId: l.skuId, quantity: l.quantity, unitPrice: l.unitPrice })),
          payMethod,
          discount: discount || 0,
          roundOff: roundOff || 0,
          customerName: customerName.trim() || undefined,
          customerPhone: phone.trim() || undefined,
          remark: remark.trim() || undefined,
        }),
        '开单失败',
      );
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
      setDiscount(0);
      setRoundOff(0);
      setReceived(null);
      setRemark('');
      void loadToday();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '开单失败');
    } finally {
      setSubmitting(false);
    }
  }, [lines, payMethod, phone, discount, roundOff, customerName, remark, loadToday]);

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
        const st = unwrapApiData<{ paid: boolean; payStatus: string; outstockNo?: string | null }>(
          await posApi.payState(payInfo.saleNo),
          '查询支付状态失败',
        );
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
      unwrapApiData(await posApi.cancelPay(payInfo.saleNo, '收银员取消'), '取消失败');
      setPayInfo(null);
      message.info('已取消该笔待支付');
      void loadToday();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '取消失败');
    } finally {
      setCancelling(false);
    }
  }, [payInfo, loadToday]);

  /* ── 表格 ── */

  const columns: ColumnsType<CartLine> = [
    {
      title: '商品',
      dataIndex: 'styleName',
      render: (_v, r) => (
        <div>
          <div>{r.styleName || r.styleNo || r.skuCode || '—'}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {[r.styleNo, r.color, r.size].filter(Boolean).join(' / ')}
          </Text>
        </div>
      ),
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      width: 130,
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
              style={{ width: 110 }}
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
      width: 100,
      render: (v: number, r) => (
        <InputNumber
          value={v}
          min={1}
          max={r.stock}
          size="small"
          style={{ width: 80 }}
          onChange={(nv) =>
            setLines((prev) =>
              prev.map((l) => (l.skuId === r.skuId ? { ...l, quantity: Number(nv) || 1 } : l)),
            )
          }
        />
      ),
    },
    {
      title: '小计',
      dataIndex: 'unitPrice',
      width: 100,
      align: 'right',
      render: (v: number, r) => formatMoney(round2(v * r.quantity)),
    },
    {
      title: '',
      width: 48,
      render: (_v, r) => (
        <Button
          type="text"
          danger
          size="small"
          icon={<DeleteOutlined />}
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
          <Button icon={<ReloadOutlined />} onClick={() => void loadToday()}>
            刷新
          </Button>
        </Space>
      </div>

      <Row gutter={12} className="pos-body">
        <Col xs={24} lg={13}>
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

            <div className="pos-results">
              {results.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={searching ? '查询中…' : '输入后回车查询，或直接扫码'}
                />
              ) : (
                results.map((sku) => (
                  <div
                    key={sku.skuId}
                    className={'pos-sku' + (sku.stock <= 0 ? ' pos-sku--out' : '')}
                    onClick={() => addLine(sku)}
                  >
                    <div className="pos-sku__main">
                      <div className="pos-sku__name">{sku.styleName || sku.styleNo || '未命名'}</div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {[sku.skuCode, sku.color, sku.size].filter(Boolean).join(' / ')}
                      </Text>
                    </div>
                    <div className="pos-sku__right">
                      <div className="pos-sku__price">
                        {formatMoney(Number(sku.salesPrice ?? sku.tagPrice ?? 0))}
                      </div>
                      <Tag color={sku.stock > 0 ? 'green' : 'red'}>库存 {sku.stock}</Tag>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={11}>
          <Card size="small" title="本单" className="pos-card">
            <Space.Compact style={{ width: '100%' }}>
              <Input
                prefix={<UserOutlined />}
                placeholder="客户手机号（挂账必填）"
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

            <div className="pos-total">
              <span>应收</span>
              <span className="pos-total__num">{formatMoney(totalAmount)}</span>
            </div>

            <div className="pos-label" style={{ marginTop: 8 }}>
              收款方式
            </div>
            <Radio.Group
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as PosPayMethod)}
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
            {payMethod === 'WECHAT' || payMethod === 'ALIPAY' ? (
              <Alert
                style={{ marginTop: 8 }}
                type="info"
                showIcon
                message="顾客扫屏幕上的二维码付款，收到款项后自动出库"
              />
            ) : null}

            {payMethod === 'CASH' ? (
              <Row gutter={8} style={{ marginTop: 8 }} align="middle">
                <Col span={12}>
                  <div className="pos-label">实收现金</div>
                  <InputNumber
                    value={received}
                    min={0}
                    precision={2}
                    style={{ width: '100%' }}
                    onChange={(v) => setReceived(v == null ? null : Number(v))}
                  />
                </Col>
                <Col span={12}>
                  <div className="pos-label">找零</div>
                  <div className="pos-amount">
                    {changeAmount == null ? '—' : formatMoney(Math.max(0, changeAmount))}
                  </div>
                </Col>
              </Row>
            ) : null}

            {payMethod === 'CREDIT' ? (
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

            <Button
              type="primary"
              size="large"
              block
              style={{ marginTop: 12 }}
              loading={submitting}
              disabled={!lines.length}
              onClick={() => void submit()}
            >
              {payMethod === 'CREDIT' ? '挂账开单' : `收款 ${formatMoney(totalAmount)}`}
            </Button>
          </Card>

          <Card size="small" title="今日单据" className="pos-card" style={{ marginTop: 12 }}>
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={today?.recent ?? []}
              locale={{ emptyText: '今天还没有单据' }}
              columns={[
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
              ]}
            />
          </Card>
        </Col>
      </Row>

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
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default PosTerminal;
