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
        <div style={{ fontWeight: 700, marginBottom: 8, borderBottom: '1px solid var(--color-border-light)', paddingBottom: 6 }}>市场判断</div>
        <DecisionInsightCard compact insight={insight} />
        {analysis && analysis.avgPrice > 0 && (
          <div style={{ marginTop: 8, fontSize: 14, color: '#595959', lineHeight: 1.6 }}>
            价格区间：¥{analysis.minPrice.toFixed(0)} ~ ¥{analysis.maxPrice.toFixed(0)}（均价 ¥{analysis.avgPrice.toFixed(0)}）
          </div>
        )}
        <div style={{ marginTop: 6, fontSize: 14, color: '#595959', lineHeight: 1.6 }}>
          竞品数量：{analysis?.total || 0} 款在售
          {analysis?.sources?.length ? ` · 渠道覆盖 ${analysis.sources.slice(0, 5).join('、')}` : ''}
        </div>
        {item.rating != null && item.rating > 0 && (
          <div style={{ marginTop: 6 }}><Text type="secondary">评分：</Text><Rate disabled defaultValue={item.rating} allowHalf style={{ fontSize: 14 }} /><span style={{ marginLeft: 4, fontSize: 14 }}>({item.reviews ?? 0}条)</span></div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* 今日热榜 */}
      <div style={{ marginBottom: 16, border: '1px solid var(--color-border-light)', borderRadius: 8, padding: '12px 16px', background: '#F6FFED' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <Space size={6}>
            <FireOutlined style={{ color: 'var(--color-warning)' }} />
            <Text strong style={{ fontSize: 14 }}>今日热榜</Text>
            {dailyHot?.date && <Text type="secondary" style={{ fontSize: 14 }}>（{dailyHot.date} 数据）</Text>}
            {dailyHot?.cached && <Tag color="green" style={{ fontSize: 14 }}>已缓存</Tag>}
            {dailyHot?.sources?.length ? <Tag color="blue" style={{ fontSize: 14 }}>多渠道 {dailyHot.sources.length} 源</Tag> : null}
          </Space>
          <Space size={8}>
            {sourceOptions.map(option => (
              <Tag
                key={option.dataSource}
                color={sourceFilter === option.dataSource ? 'blue' : 'default'}
                style={{ cursor: 'pointer', margin: 0 }}
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
                label: <span>{g.keyword}{g.heatScore > 0 && <Tag color={g.heatScore >= 70 ? 'red' : 'orange'} style={{ fontSize: 9, marginLeft: 3, padding: '0 4px' }}>{g.heatScore}</Tag>}{g.sourceCount ? <Tag color="blue" style={{ fontSize: 9, marginLeft: 3, padding: '0 4px' }}>{g.sourceCount}源</Tag> : null}</span>,
                children: (
                  <Row gutter={[10, 10]}>
                    {filterProductsBySource(g.products).map((item, i) => (
                      <Col key={i} xs={24} sm={12} md={8} lg={6} xl={4}>
                        <div style={{ border: '1px solid var(--color-border-light)', borderRadius: 6, background: 'var(--color-bg-base)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                          {item.thumbnail
                            ? (
                              <div style={{ width: '100%', height: 190, background: 'var(--color-bg-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6 }}>
                                <Image src={item.thumbnail} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'contain' }} loading="lazy" referrerPolicy="no-referrer" fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Crect fill='%23f5f5f5' width='120' height='120'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23ccc' font-size='14'%3E%E5%8A%A0%E8%BD%BD%E5%A4%B1%E8%B4%A5%3C/text%3E%3C/svg%3E" />
                              </div>
                            )
                            : <div style={{ height: 80, background: 'var(--color-bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-quaternary)', fontSize: 14 }}>暂无图片</div>}
                          <div style={{ padding: '8px 10px' }}>
                            <Tooltip title={item.title}><div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{item.title}</div></Tooltip>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              {item.price && <Text strong style={{ fontSize: 14, color: 'var(--color-danger)' }}>{item.price}</Text>}
                              {item.sourceLabel && <Tag color="blue" style={{ fontSize: 14, margin: 0 }}>{item.sourceLabel}</Tag>}
                            </div>
                            {item.rankScore != null && <Text type="secondary" style={{ fontSize: 14 }}>权重 {item.rankScore}</Text>}
                            <Space size={4}>
                              <Button icon={<PlusOutlined />} onClick={() => handleAdd(item, i + 1000)} loading={addLoading[i + 1000]} style={{ fontSize: 14 }}>加入选品</Button>
                              <Button type="primary" icon={<SendOutlined />} onClick={() => handleDeploy(item, i + 2000)} loading={deployLoading[i + 2000]} style={{ fontSize: 14 }}>下版</Button>
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
              <Text type="secondary" style={{ fontSize: 14 }}>
                {dailyHot?.serpApiEnabled === false
                  ? 'SerpApi 未配置，热榜暂不可用'
                  : '点击「加载热榜」获取今日市场热门商品数据'}
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
        <Text type="secondary" style={{ fontSize: 14 }}>热门搜索：</Text>
        {HOT_KEYWORDS.map(kw => (
          <Tag key={kw} style={{ cursor: 'pointer', borderRadius: 12, fontSize: 14 }} onClick={() => doSearch(kw)}>{kw}</Tag>
        ))}
      </div>

      <Spin spinning={loading}>
        {searchHistory.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {searchHistory.map((section, sectionIndex) => {
              const sectionAiAnalysis = computeMarketAnalysis({ items: section.items, trendScore: section.trendScore });

              return (
                <div key={`${section.keyword}-${sectionIndex}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <GoogleOutlined style={{ color: '#4285f4' }} />
                    <Text type="secondary" style={{ fontSize: 14 }}>
                      「{section.keyword}」共 {filterProductsBySource(section.items || []).length || 0} 件真实商品
                      {section.sourceCount ? <> · 覆盖 {section.sourceCount} 个外部渠道</> : null}
                      {section.trendScore >= 0 && (
                        <> · Google 趋势热度 <Tag color={section.trendScore >= 70 ? 'red' : section.trendScore >= 40 ? 'orange' : 'default'} style={{ fontSize: 14, marginLeft: 4 }}>{section.trendScore}/100</Tag></>
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
                      <div style={{ height: 280, background: 'var(--color-bg-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6 }}>
                        <Image src={item.thumbnail} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'contain' }} loading="lazy" referrerPolicy="no-referrer" fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Crect fill='%23f5f5f5' width='120' height='120'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23ccc' font-size='14'%3E%E5%8A%A0%E8%BD%BD%E5%A4%B1%E8%B4%A5%3C/text%3E%3C/svg%3E" />
                      </div>
                    ) : (
                      <div style={{ height: 100, background: 'var(--color-bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-quaternary)', fontSize: 14 }}>暂无图片</div>
                    )}
                    {/* 内容区 */}
                    <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <Tooltip title={item.title}>
                        <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                      </Tooltip>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              {item.price && <Text strong style={{ fontSize: 13, color: 'var(--color-danger)' }}>{item.price}</Text>}
                        {item.sourceLabel && <Tag color="blue" style={{ fontSize: 14, margin: 0 }}>{item.sourceLabel}</Tag>}
                      </div>
                      {item.rankScore != null && <Text type="secondary" style={{ fontSize: 14 }}>榜单权重 {item.rankScore}</Text>}
                      {item.rating != null && item.rating > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Rate disabled defaultValue={item.rating} allowHalf style={{ fontSize: 14 }} />
                          {item.reviews != null && <Text type="secondary" style={{ fontSize: 14 }}>({item.reviews})</Text>}
                        </div>
                      )}
                      {item.delivery && <Text type="secondary" style={{ fontSize: 14 }}>{item.delivery}</Text>}
                      <Space style={{ marginTop: 'auto', paddingTop: 6 }} size={6}>
                        <Button icon={<PlusOutlined />} loading={addLoading[sectionIndex * 10000 + idx]} onClick={() => handleAdd(item, sectionIndex * 10000 + idx)} style={{ fontSize: 14 }}>加入选品</Button>
                        <Button type="primary" icon={<SendOutlined />} loading={deployLoading[sectionIndex * 10000 + idx]} onClick={() => handleDeploy(item, sectionIndex * 10000 + idx)} style={{ fontSize: 14 }}>一键下版</Button>
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
                    <p style={{ margin: 0, color: 'var(--color-text-tertiary)', fontSize: 14 }}>请换一个关键词，或稍后重试</p>
                  </div>
                ) : (
                  <div>
                    <p style={{ margin: '8px 0', fontSize: 14 }}>输入关键词，搜索多渠道真实市场数据</p>
                    <p style={{ margin: 0, color: 'var(--color-text-tertiary)', fontSize: 14 }}>数据来源：Google Shopping / Amazon / eBay / Walmart，结果按渠道权重、评分和评论量排序</p>
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
