import { Row, Col, Button, Tag, Space, Typography, Tooltip, Spin, Input, Empty, Popover, Rate, Tabs, Image } from 'antd';
import { SendOutlined, PlusOutlined, SearchOutlined, GoogleOutlined, FireOutlined, ReloadOutlined } from '@ant-design/icons';
import DecisionInsightCard, { SMART_CARD_CONTENT_WIDTH, SMART_CARD_OVERLAY_WIDTH } from '@/components/common/DecisionInsightCard';
import { HOT_KEYWORDS, buildMarketInsight, computeMarketAnalysis } from './helpers';
import type { MarketHotItemsProps, MarketAnalysis, ShoppingItem } from './types';
import { useMarketHotItemsData } from './useMarketHotItemsData';

const { Text } = Typography;
const { Search } = Input;

export default function MarketHotItems({ onAdded }: MarketHotItemsProps) {
  const {
    searchHistory,
    result,
    loading,
    lastKeyword,
    addLoading,
    deployLoading,
    dailyHot,
    dailyHotLoading,
    refreshing,
    sourceFilter,
    setSourceFilter,
    aiAnalysis,
    sourceOptions,
    filterProductsBySource,
    loadDailyHot,
    handleRefreshDailyHot,
    handleClearSearchHistory,
    doSearch,
    handleAdd,
    handleDeploy,
  } = useMarketHotItemsData(onAdded);

  /* 单个商品的 AI Popover 内容 */
  const renderItemPopover = (item: ShoppingItem, analysis: MarketAnalysis | null = aiAnalysis) => {
    const insight = buildMarketInsight(item, analysis);
    return (
      <div style={{ width: SMART_CARD_CONTENT_WIDTH, maxWidth: SMART_CARD_CONTENT_WIDTH, fontSize: 14, boxSizing: 'border-box' }}>
        <div className="u-fw-700 u-mb-8" style={{ borderBottom: '1px solid var(--color-border-light)', paddingBottom: 6 }}>市场判断</div>
        <DecisionInsightCard compact insight={insight} />
        {analysis && analysis.avgPrice > 0 && (
          <div className="u-mt-8 u-fs-14" style={{ color: 'var(--color-gray-700)', lineHeight: 1.6 }}>
            价格区间：¥{analysis.minPrice.toFixed(0)} ~ ¥{analysis.maxPrice.toFixed(0)}（均价 ¥{analysis.avgPrice.toFixed(0)}）
          </div>
        )}
        <div className="u-mt-6 u-fs-14" style={{ color: 'var(--color-gray-700)', lineHeight: 1.6 }}>
          竞品数量：{analysis?.total || 0} 款在售
          {analysis?.sources?.length ? ` · 渠道覆盖 ${analysis.sources.slice(0, 5).join('、')}` : ''}
        </div>
        {item.rating != null && item.rating > 0 && (
          <div className="u-mt-6"><Text type="secondary">评分：</Text><Rate disabled defaultValue={item.rating} allowHalf className="u-fs-14" /><span className="u-ml-4 u-fs-14">({item.reviews ?? 0}条)</span></div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* 今日热榜 */}
      <div className="u-mb-16 u-br-8" style={{ border: '1px solid var(--color-border-light)', padding: '12px 16px', background: 'var(--status-success-bg)' }}>
        <div className="u-d-flex u-ai-center u-jc-between u-mb-10">
          <Space size={6}>
            <FireOutlined style={{ color: 'var(--color-warning)' }} />
            <Text strong className="u-fs-14">今日热榜</Text>
            {dailyHot?.date && <Text type="secondary" className="u-fs-14">（{dailyHot.date} 数据）</Text>}
            {dailyHot?.cached && <Tag color="green" className="u-fs-14">已缓存</Tag>}
            {dailyHot?.sources?.length ? <Tag color="blue" className="u-fs-14">多渠道 {dailyHot.sources.length} 源</Tag> : null}
          </Space>
          <Space size={8}>
            {sourceOptions.map(option => (
              <Tag
                key={option.dataSource}
                color={sourceFilter === option.dataSource ? 'blue' : 'default'}
                className="u-cur-pointer u-m-0"
                onClick={() => setSourceFilter(option.dataSource)}
              >
                {option.label}
              </Tag>
            ))}
            {!dailyHot ? (
              <Button icon={<FireOutlined />} loading={dailyHotLoading} onClick={loadDailyHot} type="text">加载热榜</Button>
            ) : (
              <Button icon={<ReloadOutlined />} loading={refreshing} onClick={handleRefreshDailyHot} type="text">刷新</Button>
            )}
          </Space>
        </div>
        <Spin spinning={dailyHotLoading || refreshing}>
          {dailyHot && dailyHot.cached && dailyHot.groups.length > 0 ? (
            <Tabs type="card"
              items={dailyHot.groups.map(g => ({
                key: g.keyword,
                label: <span>{g.keyword}{g.heatScore > 0 && <Tag color={g.heatScore >= 70 ? 'red' : 'orange'} className="u-p-04px" style={{ fontSize: 9, marginLeft: 3 }}>{g.heatScore}</Tag>}{g.sourceCount ? <Tag color="blue" className="u-p-04px" style={{ fontSize: 9, marginLeft: 3 }}>{g.sourceCount}源</Tag> : null}</span>,
                children: (
                  <Row gutter={[10, 10]}>
                    {filterProductsBySource(g.products).map((item, i) => (
                      <Col key={i} xs={24} sm={12} md={8} lg={6} xl={4}>
                        <div className="u-br-6 u-ov-hidden u-d-flex u-fd-column" style={{ border: '1px solid var(--color-border-light)', background: 'var(--color-bg-base)' }}>
                          {item.thumbnail
                            ? (
                              <div className="u-w-full u-d-flex u-ai-center u-jc-center" style={{ height: 190, background: 'var(--color-bg-container)', padding: 6 }}>
                                <Image src={item.thumbnail} alt={item.title} className="u-w-full u-h-full" style={{ objectFit: 'contain' }} loading="lazy" referrerPolicy="no-referrer" fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Crect fill='%23f5f5f5' width='120' height='120'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23ccc' font-size='14'%3E%E5%8A%A0%E8%BD%BD%E5%A4%B1%E8%B4%A5%3C/text%3E%3C/svg%3E" />
                              </div>
                            )
                            : <div className="u-d-flex u-ai-center u-jc-center u-fs-14" style={{ height: 80, background: 'var(--color-bg-subtle)', color: 'var(--color-text-quaternary)' }}>暂无图片</div>}
                          <div className="u-p-8px10px">
                            <Tooltip title={item.title}><div className="u-fs-14 u-fw-600 u-ov-hidden u-ws-nowrap u-mb-4" style={{ textOverflow: 'ellipsis' }}>{item.title}</div></Tooltip>
                            <div className="u-d-flex u-jc-between u-ai-center u-mb-6">
                              {item.price && <Text strong className="u-fs-14" style={{ color: 'var(--color-danger)' }}>{item.price}</Text>}
                              {item.sourceLabel && <Tag color="blue" className="u-fs-14 u-m-0">{item.sourceLabel}</Tag>}
                            </div>
                            {item.rankScore != null && <Text type="secondary" className="u-fs-14">权重 {item.rankScore}</Text>}
                            <Space size={4}>
                              <Button icon={<PlusOutlined />} onClick={() => handleAdd(item, i + 1000)} loading={addLoading[i + 1000]} className="u-fs-14">加入选品</Button>
                              <Button type="primary" icon={<SendOutlined />} onClick={() => handleDeploy(item, i + 2000)} loading={deployLoading[i + 2000]} className="u-fs-14">下版</Button>
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
            !dailyHotLoading && !refreshing && (
              <Text type="secondary" className="u-fs-14">
                {dailyHot?.serpApiEnabled === false
                  ? 'SerpApi 未配置，热榜暂不可用'
                  : '点击「加载热榜」获取今日市场热门商品数据'}
              </Text>
            )
          )}
        </Spin>
      </div>

      {/* 搜索栏 */}
      <div className="u-mb-12">
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
      <div className="u-d-flex u-ai-center u-gap-6 u-fwrap-wrap" style={{ marginBottom: 14 }}>
        <Text type="secondary" className="u-fs-14">热门搜索：</Text>
        {HOT_KEYWORDS.map(kw => (
          <Tag key={kw} className="u-cur-pointer u-br-12 u-fs-14" onClick={() => doSearch(kw)}>{kw}</Tag>
        ))}
      </div>

      <Spin spinning={loading}>
        {searchHistory.length > 0 ? (
          <div className="u-d-flex u-fd-column" style={{ gap: 18 }}>
            {searchHistory.map((section, sectionIndex) => {
              const sectionAiAnalysis = computeMarketAnalysis({ items: section.items, trendScore: section.trendScore });

              return (
                <div key={`${section.keyword}-${sectionIndex}`}>
                  <div className="u-d-flex u-ai-center u-gap-8 u-mb-10">
                    <GoogleOutlined style={{ color: 'var(--color-blue-500)' }} />
                    <Text type="secondary" className="u-fs-14">
                      「{section.keyword}」共 {filterProductsBySource(section.items || []).length || 0} 件真实商品
                      {section.sourceCount ? <> · 覆盖 {section.sourceCount} 个外部渠道</> : null}
                      {section.trendScore >= 0 && (
                        <> · Google 趋势热度 <Tag color={section.trendScore >= 70 ? 'red' : section.trendScore >= 40 ? 'orange' : 'default'} className="u-fs-14 u-ml-4">{section.trendScore}/100</Tag></>
                      )}
                    </Text>
                  </div>
                  <Row gutter={[12, 14]}>
                    {filterProductsBySource(section.items || []).map((item, idx) => (
                      <Col key={`${section.keyword}-${idx}`} xs={24} sm={12} md={8} lg={6} xl={4}>
                <Popover content={renderItemPopover(item, sectionAiAnalysis)} title={null} trigger="hover" placement="right" mouseEnterDelay={0.3} overlayStyle={{ width: SMART_CARD_OVERLAY_WIDTH, maxWidth: SMART_CARD_OVERLAY_WIDTH }}>
                  <div
                    style={{
                      border: '1px solid var(--color-border-light)', borderRadius: 8, background: 'var(--color-bg-base)',
                      overflow: 'hidden', transition: 'box-shadow .2s, transform .15s',
                      display: 'flex', flexDirection: 'column', height: '100%', cursor: 'default',
                    }}
                    onMouseEnter={e => { e.currentTarget.classList.add('market-item-hovered'); }}
                    onMouseLeave={e => { e.currentTarget.classList.remove('market-item-hovered'); }}
                  >
                    {/* 商品图片 */}
                    {item.thumbnail ? (
                      <div className="u-d-flex u-ai-center u-jc-center" style={{ height: 280, background: 'var(--color-bg-container)', padding: 6 }}>
                        <Image src={item.thumbnail} alt={item.title} className="u-w-full u-h-full" style={{ objectFit: 'contain' }} loading="lazy" referrerPolicy="no-referrer" fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Crect fill='%23f5f5f5' width='120' height='120'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23ccc' font-size='14'%3E%E5%8A%A0%E8%BD%BD%E5%A4%B1%E8%B4%A5%3C/text%3E%3C/svg%3E" />
                      </div>
                    ) : (
                      <div className="u-d-flex u-ai-center u-jc-center u-fs-14" style={{ height: 100, background: 'var(--color-bg-subtle)', color: 'var(--color-text-quaternary)' }}>暂无图片</div>
                    )}
                    {/* 内容区 */}
                    <div className="u-flex-1 u-d-flex u-fd-column u-gap-6" style={{ padding: '10px 12px' }}>
                      <Tooltip title={item.title}>
                        <div className="u-fw-600 u-fs-14 u-ov-hidden u-ws-nowrap" style={{ textOverflow: 'ellipsis' }}>{item.title}</div>
                      </Tooltip>
                      <div className="u-d-flex u-jc-between u-ai-center">
                              {item.price && <Text strong className="u-fs-13" style={{ color: 'var(--color-danger)' }}>{item.price}</Text>}
                        {item.sourceLabel && <Tag color="blue" className="u-fs-14 u-m-0">{item.sourceLabel}</Tag>}
                      </div>
                      {item.rankScore != null && <Text type="secondary" className="u-fs-14">榜单权重 {item.rankScore}</Text>}
                      {item.rating != null && item.rating > 0 && (
                        <div className="u-d-flex u-ai-center u-gap-4">
                          <Rate disabled defaultValue={item.rating} allowHalf className="u-fs-14" />
                          {item.reviews != null && <Text type="secondary" className="u-fs-14">({item.reviews})</Text>}
                        </div>
                      )}
                      {item.delivery && <Text type="secondary" className="u-fs-14">{item.delivery}</Text>}
                      <Space style={{ marginTop: 'auto', paddingTop: 6 }} size={6}>
                        <Button icon={<PlusOutlined />} loading={addLoading[sectionIndex * 10000 + idx]} onClick={() => handleAdd(item, sectionIndex * 10000 + idx)} className="u-fs-14">加入选品</Button>
                        <Button type="primary" icon={<SendOutlined />} loading={deployLoading[sectionIndex * 10000 + idx]} onClick={() => handleDeploy(item, sectionIndex * 10000 + idx)} className="u-fs-14">一键下版</Button>
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
                    <p className="u-m-8px0 u-fs-14">未搜索到「{lastKeyword}」的相关商品</p>
                    <p className="u-m-0 u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>请换一个关键词，或稍后重试</p>
                  </div>
                ) : (
                  <div>
                    <p className="u-m-8px0 u-fs-14">输入关键词，搜索多渠道真实市场数据</p>
                    <p className="u-m-0 u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>数据来源：Google Shopping / Amazon / eBay / Walmart，结果按渠道权重、评分和评论量排序</p>
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
