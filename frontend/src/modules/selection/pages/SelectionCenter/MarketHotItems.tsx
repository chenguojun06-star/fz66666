import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Row, Col, Button, Tag, Space, Typography, Tooltip, Spin, Input, Empty, Popover, Rate, Tabs, App } from 'antd';
import { SendOutlined, PlusOutlined, SearchOutlined, GoogleOutlined, FireOutlined, ReloadOutlined } from '@ant-design/icons';
import { candidateSave, candidateStageAction, candidateCreateStyle, searchExternalMarket, fetchDailyHotItems, refreshDailyHotItems } from '@/services/selection/selectionApi';

const { Text } = Typography;
const { Search } = Input;

const HOT_KEYWORDS = ['连衣裙', '卫衣', '外套', '牛仔裤', 'T恤', '衬衫', '半身裙', '针织衫', '风衣', '西装', '夹克', '羽绒服'];
const SEARCH_HISTORY_STORAGE_KEY = 'selection-market-search-history';

interface ShoppingItem {
  title: string;
  price: string;
  extractedPrice: number | null;
  thumbnail: string;
  source: string;
  link: string;
  rating: number | null;
  reviews: number | null;
  delivery: string;
}

interface DailyHotGroup {
  keyword: string;
  heatScore: number;
  products: ShoppingItem[];
  sourceCount?: number;
  sources?: string[];
}

interface DailyHotResponse {
  date: string;
  cached: boolean;
  serpApiEnabled: boolean;
  groups: DailyHotGroup[];
  total: number;
  sources?: Array<{ dataSource: string; label: string }>;
}

interface SearchResult {
  items: ShoppingItem[];
  trendScore: number;
  keyword: string;
  serpApiEnabled: boolean;
  sourceCount?: number;
  sources?: Array<{ dataSource: string; label: string }>;
}

export default function MarketHotItems({ onAdded }: { onAdded?: () => void }) {
  const { message } = App.useApp();
  const [searchHistory, setSearchHistory] = useState<SearchResult[]>(() => {
    try {
      const raw = localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [result, setResult] = useState<SearchResult | null>(() => {
    try {
      const raw = localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed[parsed.length - 1] : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [lastKeyword, setLastKeyword] = useState('');
  const [addLoading, setAddLoading] = useState<Record<number, boolean>>({});
  const [deployLoading, setDeployLoading] = useState<Record<number, boolean>>({});
  const [dailyHot, setDailyHot] = useState<DailyHotResponse | null>(null);
  const [dailyHotLoading, setDailyHotLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  /* 页面打开时自动加载今日热榜 */
  useEffect(() => { loadDailyHot(); }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(searchHistory));
    } catch {
      // Ignore storage failures
    }
  }, [searchHistory]);

  const loadDailyHot = useCallback(async () => {
    setDailyHotLoading(true);
    try {
      const data = await fetchDailyHotItems() as DailyHotResponse;
      setDailyHot(data);
    } catch { /* 静默失败，不影响手动搜索 */ }
    finally { setDailyHotLoading(false); }
  }, []);

  const handleRefreshDailyHot = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await refreshDailyHotItems() as any;
      if (res?.started) {
        // 异步任务已启动，约1分钟后完成
        message.success('热榜刷新任务已启动，约1分钟后完成，请稍后刷新页面查看');
        setTimeout(() => loadDailyHot(), 65000);
      } else {
        // 兼容旧响应格式（同步执行的情况）
        message.success(`热榜已更新：${res?.success ?? 0} 个关键词成功`);
        await loadDailyHot();
      }
    } catch { message.error('刷新失败，请稍后重试'); }
    finally { setRefreshing(false); }
  }, [loadDailyHot]);

  const handleClearSearchHistory = useCallback(() => {
    setResult(null);
    setLastKeyword('');
    setSearchHistory([]);
    try {
      localStorage.removeItem(SEARCH_HISTORY_STORAGE_KEY);
    } catch {
      // Ignore storage failures
    }
  }, []);

  /* 搜索 */
  const doSearch = useCallback(async (kw: string) => {
    const trimmed = kw.trim();
    if (!trimmed) { message.warning('请输入搜索关键词'); return; }
    setLoading(true);
    setLastKeyword(trimmed);
    try {
      const data = await searchExternalMarket(trimmed, 20) as SearchResult;
      setResult(data);
      setSearchHistory(prev => {
        const next = prev.filter(item => item.keyword !== data.keyword);
        return [...next, data];
      });
      const hasUsableSearchData = Boolean(data.items?.length) || (typeof data.trendScore === 'number' && data.trendScore >= 0);
      if (data.serpApiEnabled === false && !hasUsableSearchData) {
        message.warning('SerpApi 未启用，请联系管理员配置 SERPAPI_KEY');
      } else if (!data.items?.length) {
        message.info('未搜索到相关商品，请换个关键词试试');
      }
    } catch {
      message.error('搜索失败，请检查网络');
    } finally {
      setLoading(false);
    }
  }, []);

  /* AI 趋势分析（汇总） */
  const aiAnalysis = useMemo(() => {
    if (!result?.items?.length) return null;
    const prices = result.items.map(i => i.extractedPrice).filter((p): p is number => p != null && p > 0);
    const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
    const sources = [...new Set(result.items.map(i => i.source).filter(Boolean))];
    const ratedCount = result.items.filter(i => i.rating != null && i.rating > 0).length;
    return { avgPrice, minPrice, maxPrice, sources, ratedCount, trendScore: result.trendScore, total: result.items.length };
  }, [result]);

  /* 加入选品 */
  const handleAdd = async (item: ShoppingItem, idx: number) => {
    setAddLoading(p => ({ ...p, [idx]: true }));
    try {
      await candidateSave({
        styleName: item.title?.slice(0, 80) || lastKeyword,
        category: lastKeyword,
        colorFamily: '',
        sourceType: 'EXTERNAL',
        sourceDesc: item.source || 'Google Shopping',
        referenceImages: item.thumbnail ? [item.thumbnail] : undefined,
        targetPrice: item.extractedPrice || undefined,
        remark: `来源：${item.source || 'Google Shopping'}｜${item.link || ''}`,
        seasonTags: lastKeyword,
      });
      message.success('已加入选品库');
      onAdded?.();
    } catch { message.error('添加失败'); }
    finally { setAddLoading(p => ({ ...p, [idx]: false })); }
  };

  /* 一键下版 */
  const handleDeploy = async (item: ShoppingItem, idx: number) => {
    setDeployLoading(p => ({ ...p, [idx]: true }));
    try {
      const res = await candidateSave({
        styleName: item.title?.slice(0, 80) || lastKeyword,
        category: lastKeyword,
        colorFamily: '',
        sourceType: 'EXTERNAL',
        sourceDesc: item.source || 'Google Shopping',
        referenceImages: item.thumbnail ? [item.thumbnail] : undefined,
        targetPrice: item.extractedPrice || undefined,
        remark: `来源：${item.source || 'Google Shopping'}`,
      }) as { id?: number };
      if (!res?.id) throw new Error('保存失败');
      await candidateStageAction(res.id, 'approve');
      await candidateCreateStyle(res.id);
      message.success('已一键下版！到「款式管理」查看');
      onAdded?.();
    } catch (e: unknown) {
      message.error((e as { message?: string })?.message ?? '下版失败');
    } finally { setDeployLoading(p => ({ ...p, [idx]: false })); }
  };

  /* 单个商品的 AI Popover 内容 */
  const renderItemPopover = (item: ShoppingItem, analysis = aiAnalysis) => {
    const price = item.extractedPrice;
    const avg = analysis?.avgPrice || 0;
    const priceTag = price && avg > 0
      ? price < avg * 0.8 ? '低于均价20%+（高性价比）'
        : price > avg * 1.2 ? '高于均价20%+（高端定位）'
        : '接近市场均价（主流价位）'
      : '暂无价格数据';
    const ts = analysis?.trendScore ?? -1;
    const trendLabel = ts >= 70 ? '高热度' : ts >= 40 ? '中等热度' : '低热度';
    return (
      <div style={{ maxWidth: 280, fontSize: 13 }}>
        <div style={{ fontWeight: 700, marginBottom: 8, borderBottom: '1px solid #f0f0f0', paddingBottom: 6 }}>AI 趋势分析</div>
        <div style={{ marginBottom: 6 }}>
          <Text type="secondary">Google 趋势：</Text>
          <Tag color={ts >= 70 ? 'red' : ts >= 40 ? 'orange' : 'default'}>{ts >= 0 ? `${ts}/100 ${trendLabel}` : '未获取'}</Tag>
        </div>
        <div style={{ marginBottom: 6 }}><Text type="secondary">价格定位：</Text><span>{priceTag}</span></div>
        {avg > 0 && <div style={{ marginBottom: 6 }}><Text type="secondary">价格区间：</Text><span>¥{analysis?.minPrice?.toFixed(0)} ~ ¥{analysis?.maxPrice?.toFixed(0)}（均价 ¥{avg.toFixed(0)}）</span></div>}
        <div style={{ marginBottom: 6 }}><Text type="secondary">竞品数量：</Text><span>{analysis?.total || 0} 款在售</span></div>
        <div style={{ marginBottom: 6 }}><Text type="secondary">销售渠道：</Text><span>{analysis?.sources?.slice(0, 5).join('、') || '—'}</span></div>
        {item.rating != null && item.rating > 0 && (
          <div><Text type="secondary">评分：</Text><Rate disabled defaultValue={item.rating} allowHalf style={{ fontSize: 12 }} /><span style={{ marginLeft: 4, fontSize: 11 }}>({item.reviews ?? 0}条)</span></div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* 今日热榜 */}
      <div style={{ marginBottom: 16, border: '1px solid #f0f0f0', borderRadius: 8, padding: '12px 16px', background: '#fffbf0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <Space size={6}>
            <FireOutlined style={{ color: '#fa8c16' }} />
            <Text strong style={{ fontSize: 14 }}>今日热榜</Text>
            {dailyHot?.date && <Text type="secondary" style={{ fontSize: 11 }}>（{dailyHot.date} 数据）</Text>}
            {dailyHot?.cached && <Tag color="green" style={{ fontSize: 10 }}>已缓存</Tag>}
            {dailyHot?.sources?.length ? <Tag color="blue" style={{ fontSize: 10 }}>多渠道 {dailyHot.sources.length} 源</Tag> : null}
          </Space>
          <Button size="small" icon={<ReloadOutlined />} loading={refreshing} onClick={handleRefreshDailyHot} type="text">刷新</Button>
        </div>
        <Spin spinning={dailyHotLoading} size="small">
          {dailyHot && dailyHot.cached && dailyHot.groups.length > 0 ? (
            <Tabs size="small" type="card"
              items={dailyHot.groups.map(g => ({
                key: g.keyword,
                label: <span>{g.keyword}{g.heatScore > 0 && <Tag color={g.heatScore >= 70 ? 'red' : 'orange'} style={{ fontSize: 9, marginLeft: 3, padding: '0 4px' }}>{g.heatScore}</Tag>}{g.sourceCount ? <Tag color="blue" style={{ fontSize: 9, marginLeft: 3, padding: '0 4px' }}>{g.sourceCount}源</Tag> : null}</span>,
                children: (
                  <Row gutter={[10, 10]}>
                    {g.products.map((item, i) => (
                      <Col key={i} xs={24} sm={12} md={8} lg={6} xl={4}>
                        <div style={{ border: '1px solid #f0f0f0', borderRadius: 6, background: '#fff', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                          {item.thumbnail
                            ? (
                              <div style={{ width: '100%', height: 190, background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6 }}>
                                <img src={item.thumbnail} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'contain' }} loading="lazy" referrerPolicy="no-referrer" />
                              </div>
                            )
                            : <div style={{ height: 80, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: 12 }}>暂无图片</div>}
                          <div style={{ padding: '8px 10px' }}>
                            <Tooltip title={item.title}><div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{item.title}</div></Tooltip>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              {item.price && <Text strong style={{ fontSize: 14, color: '#ff4d4f' }}>{item.price}</Text>}
                              {item.source && <Tag style={{ fontSize: 10, margin: 0 }}>{item.source}</Tag>}
                            </div>
                            <Space size={4}>
                              <Button size="small" icon={<PlusOutlined />} onClick={() => handleAdd(item, i + 1000)} loading={addLoading[i + 1000]} style={{ fontSize: 11 }}>加入选品</Button>
                              <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => handleDeploy(item, i + 2000)} loading={deployLoading[i + 2000]} style={{ fontSize: 11 }}>下版</Button>
                            </Space>
                          </div>
                        </div>
                      </Col>
                    ))}
                  </Row>
                ),
              }))}
            />
          ) : (
            !dailyHotLoading && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {dailyHot?.serpApiEnabled === false
                  ? 'SerpApi 未配置，热榜暂不可用'
                  : '今日热榜暂未生成，点击「刷新」立即拉取'}
              </Text>
            )
          )}
        </Spin>
      </div>

      {/* 搜索栏 */}
      <div style={{ marginBottom: 12 }}>
        <Space wrap>
          <Search
            placeholder="输入关键词搜索市场真实商品（如：连衣裙、卫衣、牛仔外套）"
            allowClear
            enterButton={<><SearchOutlined /> 搜索市场</>}
            onSearch={doSearch}
            size="large"
            style={{ width: 520 }}
          />
          {searchHistory.length > 0 && (
            <Button onClick={handleClearSearchHistory}>清空本轮搜索结果</Button>
          )}
        </Space>
      </div>

      {/* 热门关键词 */}
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>热门搜索：</Text>
        {HOT_KEYWORDS.map(kw => (
          <Tag key={kw} style={{ cursor: 'pointer', borderRadius: 12, fontSize: 12 }} onClick={() => doSearch(kw)}>{kw}</Tag>
        ))}
      </div>

      <Spin spinning={loading}>
        {searchHistory.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {searchHistory.map((section, sectionIndex) => {
              const sectionAiAnalysis = (() => {
                if (!section.items?.length) return null;
                const prices = section.items.map(i => i.extractedPrice).filter((p): p is number => p != null && p > 0);
                const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
                const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
                const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
                const sources = [...new Set(section.items.map(i => i.source).filter(Boolean))];
                const ratedCount = section.items.filter(i => i.rating != null && i.rating > 0).length;
                return { avgPrice, minPrice, maxPrice, sources, ratedCount, trendScore: section.trendScore, total: section.items.length };
              })();

              return (
                <div key={`${section.keyword}-${sectionIndex}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <GoogleOutlined style={{ color: '#4285f4' }} />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      「{section.keyword}」共 {section.items?.length || 0} 件真实商品
                      {section.sourceCount ? <> · 覆盖 {section.sourceCount} 个外部渠道</> : null}
                      {section.trendScore >= 0 && (
                        <> · Google 趋势热度 <Tag color={section.trendScore >= 70 ? 'red' : section.trendScore >= 40 ? 'orange' : 'default'} style={{ fontSize: 10, marginLeft: 4 }}>{section.trendScore}/100</Tag></>
                      )}
                    </Text>
                  </div>
                  <Row gutter={[12, 14]}>
                    {section.items.map((item, idx) => (
                      <Col key={`${section.keyword}-${idx}`} xs={24} sm={12} md={8} lg={6} xl={4}>
                <Popover content={renderItemPopover(item, sectionAiAnalysis)} title={null} trigger="hover" placement="right" mouseEnterDelay={0.3}>
                  <div
                    style={{
                      border: '1px solid #f0f0f0', borderRadius: 8, background: '#fff',
                      overflow: 'hidden', transition: 'box-shadow .2s, transform .15s',
                      display: 'flex', flexDirection: 'column', height: '100%', cursor: 'default',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
                  >
                    {/* 商品图片 */}
                    {item.thumbnail ? (
                      <div style={{ height: 280, background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6 }}>
                        <img src={item.thumbnail} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'contain' }} loading="lazy" referrerPolicy="no-referrer" />
                      </div>
                    ) : (
                      <div style={{ height: 100, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: 13 }}>暂无图片</div>
                    )}
                    {/* 内容区 */}
                    <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <Tooltip title={item.title}>
                        <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                      </Tooltip>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              {item.price && <Text strong style={{ fontSize: 16, color: '#ff4d4f' }}>{item.price}</Text>}
                        {item.source && <Tag style={{ fontSize: 10, margin: 0 }}>{item.source}</Tag>}
                      </div>
                      {item.rating != null && item.rating > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Rate disabled defaultValue={item.rating} allowHalf style={{ fontSize: 11 }} />
                          {item.reviews != null && <Text type="secondary" style={{ fontSize: 10 }}>({item.reviews})</Text>}
                        </div>
                      )}
                      {item.delivery && <Text type="secondary" style={{ fontSize: 10 }}>{item.delivery}</Text>}
                      <Space style={{ marginTop: 'auto', paddingTop: 6 }} size={6}>
                        <Button size="small" icon={<PlusOutlined />} loading={addLoading[sectionIndex * 10000 + idx]} onClick={() => handleAdd(item, sectionIndex * 10000 + idx)} style={{ fontSize: 11 }}>加入选品</Button>
                        <Button size="small" type="primary" icon={<SendOutlined />} loading={deployLoading[sectionIndex * 10000 + idx]} onClick={() => handleDeploy(item, sectionIndex * 10000 + idx)} style={{ fontSize: 11 }}>一键下版</Button>
                      </Space>
                    </div>
                  </div>
                </Popover>
              </Col>
                    ))}
                  </Row>
                </div>
              );
            })}
          </div>
        ) : (
          !loading && (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                result && result.items?.length === 0 ? (
                  <div>
                    <p style={{ margin: '8px 0', fontSize: 14 }}>未搜索到「{lastKeyword}」的相关商品</p>
                    <p style={{ margin: 0, color: '#999', fontSize: 12 }}>请换一个关键词，或稍后重试</p>
                  </div>
                ) : (
                  <div>
                    <p style={{ margin: '8px 0', fontSize: 14 }}>输入关键词，搜索多渠道真实市场数据</p>
                    <p style={{ margin: 0, color: '#999', fontSize: 12 }}>数据来源：Google Shopping / Amazon / eBay / Walmart · 包含真实图片、真实价格、真实来源店铺</p>
                  </div>
                )
              }
            />
          )
        )}
      </Spin>
    </div>
  );
}
