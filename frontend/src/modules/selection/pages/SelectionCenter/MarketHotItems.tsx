import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Row, Col, Button, Tag, Select, Space, message, Typography, Tooltip, Spin, Input, Empty, Image } from 'antd';
import { FireOutlined, SendOutlined, PlusOutlined, SearchOutlined, ShopOutlined } from '@ant-design/icons';
import { candidateSave, candidateStageAction, candidateCreateStyle, searchMarketStyles } from '@/services/selection/selectionApi';

const { Text } = Typography;
const { Search } = Input;

const CATEGORIES = ['全部', '连衣裙', '外套', '卫衣', '裤子', '衬衫', 'T恤', '半身裙', '针织', '长裙', '背心', '上衣'];

// 品类 emoji 映射（用于无封面图时的占位）
const CATEGORY_EMOJI: Record<string, string> = {
  '连衣裙': '👗', '外套': '🧥', '卫衣': '🩱', '裤子': '👖', '衬衫': '👔',
  'T恤': '👕', '半身裙': '🌸', '针织': '🧶', '长裙': '✨', '背心': '🦺', '上衣': '👚',
};

interface MarketItem {
  id: number;
  styleNo: string;
  styleName: string;
  category: string;
  color: string;
  season: string;
  price: number;
  cover: string;
  description: string;
  year: number;
  customer: string;
  orderCount: number;
  totalQuantity: number;
  totalWarehoused: number;
  repeatOrderCount: number;
}

export default function MarketHotItems({ onAdded }: { onAdded?: () => void }) {
  const [items, setItems] = useState<MarketItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('全部');
  const [searched, setSearched] = useState(false);
  const [addLoading, setAddLoading] = useState<Record<number, boolean>>({});
  const [deployLoading, setDeployLoading] = useState<Record<number, boolean>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const doSearch = useCallback(async (kw?: string, cat?: string) => {
    setLoading(true);
    setSearched(true);
    try {
      const data = await searchMarketStyles({
        keyword: kw ?? keyword,
        category: cat ?? category,
        limit: 50,
      });
      const arr = (data as MarketItem[]) ?? [];
      setItems(arr);
    } catch {
      message.error('查询失败，请检查网络');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [keyword, category]);

  // 首次加载：搜索全部款式
  useEffect(() => { doSearch('', '全部'); }, []);

  const handleSearch = (value: string) => {
    setKeyword(value);
    doSearch(value, category);
  };

  const handleCategoryChange = (val: string) => {
    setCategory(val);
    doSearch(keyword, val);
  };

  const handleAdd = async (item: MarketItem) => {
    setAddLoading(p => ({ ...p, [item.id]: true }));
    try {
      await candidateSave({
        styleName: item.styleName,
        category: item.category,
        colorFamily: item.color,
        sourceType: 'INTERNAL',
        costEstimate: item.price ? Math.round(item.price * 0.6) : undefined,
        targetPrice: item.price,
        remark: `来源：系统款式库 ${item.styleNo || ''}`,
        seasonTags: item.season || undefined,
      });
      message.success(`「${item.styleName}」已加入选品库`);
      onAdded?.();
    } catch { message.error('添加失败'); }
    finally { setAddLoading(p => ({ ...p, [item.id]: false })); }
  };

  const handleDeploy = async (item: MarketItem) => {
    setDeployLoading(p => ({ ...p, [item.id]: true }));
    try {
      const res = await candidateSave({
        styleName: item.styleName,
        category: item.category,
        colorFamily: item.color,
        sourceType: 'INTERNAL',
        costEstimate: item.price ? Math.round(item.price * 0.6) : undefined,
        targetPrice: item.price,
        remark: `来源：系统款式库 ${item.styleNo || ''}`,
      }) as { id?: number };
      if (!res?.id) throw new Error('保存失败');
      await candidateStageAction(res.id, 'approve');
      await candidateCreateStyle(res.id);
      message.success(`「${item.styleName}」已一键下版！到「样衣管理」查看`);
      onAdded?.();
    } catch (e: unknown) {
      message.error((e as { message?: string })?.message ?? '下版失败');
    } finally { setDeployLoading(p => ({ ...p, [item.id]: false })); }
  };

  return (
    <div>
      {/* 顶部搜索栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <ShopOutlined style={{ color: '#1890ff', fontSize: 18 }} />
        <Text strong style={{ fontSize: 15 }}>系统款式库</Text>
        <Tag color="blue" style={{ fontSize: 11 }}>真实数据 · 来自您的款式和生产记录</Tag>
        <div style={{ flex: 1 }} />
        <Search
          placeholder="搜索款式名 / 款号 / 品类 / 颜色"
          allowClear
          enterButton={<><SearchOutlined /> 搜索</>}
          onSearch={handleSearch}
          style={{ maxWidth: 360 }}
          size="middle"
        />
      </div>

      {/* 品类筛选 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>品类：</Text>
        {CATEGORIES.map(c => (
          <Button
            key={c}
            size="small"
            type={category === c ? 'primary' : 'default'}
            onClick={() => handleCategoryChange(c)}
            style={{ borderRadius: 16, fontSize: 12 }}
          >
            {c !== '全部' && (CATEGORY_EMOJI[c] || '📦')} {c}
          </Button>
        ))}
      </div>

      {/* 结果计数 */}
      {searched && !loading && (
        <div style={{ marginBottom: 10 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {items.length > 0
              ? `共找到 ${items.length} 款真实款式${keyword ? `（关键词：${keyword}）` : ''}`
              : ''}
          </Text>
        </div>
      )}

      <Spin spinning={loading}>
        {items.length > 0 ? (
          <Row gutter={[12, 14]}>
            {items.map(item => (
              <Col key={item.id} xs={24} sm={12} md={8} lg={6}>
                <div
                  style={{
                    border: '1px solid #f0f0f0', borderRadius: 10, background: '#fff',
                    overflow: 'hidden', transition: 'box-shadow .2s, transform .2s',
                    display: 'flex', flexDirection: 'column', height: '100%',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
                >
                  {/* 封面图 / 品类占位 */}
                  <div style={{
                    height: 120, background: item.cover ? '#fafafa' : 'linear-gradient(135deg,#f0f0f0,#e8e8e8)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden',
                  }}>
                    {item.cover ? (
                      <Image
                        src={item.cover}
                        alt={item.styleName}
                        style={{ width: '100%', height: 120, objectFit: 'cover' }}
                        preview={false}
                        fallback="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>"
                      />
                    ) : (
                      <span style={{ fontSize: 48, opacity: 0.5 }}>{CATEGORY_EMOJI[item.category] || '👗'}</span>
                    )}
                    {/* 品类角标 */}
                    <Tag color="blue" style={{ position: 'absolute', top: 6, left: 6, fontSize: 10, borderRadius: 4 }}>
                      {item.category || '未分类'}
                    </Tag>
                    {/* 生产数据角标 */}
                    {item.orderCount > 0 && (
                      <Tag color="volcano" style={{ position: 'absolute', top: 6, right: 6, fontSize: 10, borderRadius: 4 }}>
                        <FireOutlined /> {item.orderCount}次下单
                      </Tag>
                    )}
                  </div>

                  {/* 内容区 */}
                  <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {/* 款式名 + 款号 */}
                    <Tooltip title={`${item.styleName}${item.styleNo ? ` (${item.styleNo})` : ''}`}>
                      <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.styleName}
                      </div>
                    </Tooltip>
                    {item.styleNo && (
                      <Text type="secondary" style={{ fontSize: 11 }}>款号：{item.styleNo}</Text>
                    )}

                    {/* 基本信息 */}
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {item.color && <Tag style={{ fontSize: 10, margin: 0, padding: '0 5px' }}>{item.color}</Tag>}
                      {item.season && <Tag style={{ fontSize: 10, margin: 0, padding: '0 5px' }}>{item.season}</Tag>}
                      {item.customer && <Tag color="cyan" style={{ fontSize: 10, margin: 0, padding: '0 5px' }}>{item.customer}</Tag>}
                    </div>

                    {/* 价格 + 生产数据 */}
                    <div style={{ background: '#f8f9fa', borderRadius: 6, padding: '6px 8px', marginTop: 'auto' }}>
                      {item.price != null && item.price > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                          <Text strong style={{ fontSize: 16, color: '#ff4d4f' }}>¥{item.price}</Text>
                          <Text type="secondary" style={{ fontSize: 10 }}>单价</Text>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#595959' }}>
                        {item.totalQuantity > 0 && <span>累计 <b>{item.totalQuantity}</b> 件</span>}
                        {item.totalWarehoused > 0 && <span>入库 <b>{item.totalWarehoused}</b> 件</span>}
                        {item.repeatOrderCount > 0 && <span style={{ color: '#fa8c16' }}>返单 <b>{item.repeatOrderCount}</b> 次</span>}
                      </div>
                      {item.orderCount === 0 && (
                        <Text type="secondary" style={{ fontSize: 10 }}>尚无生产记录</Text>
                      )}
                    </div>

                    {item.description && (
                      <Text type="secondary" style={{ fontSize: 10, lineHeight: 1.4 }} ellipsis={{ tooltip: item.description }}>
                        {item.description}
                      </Text>
                    )}

                    {/* 操作按钮 */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <Tooltip title="加入选品库，走评审流程">
                        <Button block size="small" icon={<PlusOutlined />} loading={addLoading[item.id]} onClick={() => handleAdd(item)} style={{ flex: 1, fontSize: 11 }}>
                          加入选品
                        </Button>
                      </Tooltip>
                      <Tooltip title="直接创建款式进入开发">
                        <Button block size="small" type="primary" icon={<SendOutlined />} loading={deployLoading[item.id]} onClick={() => handleDeploy(item)} style={{ flex: 1, fontSize: 11 }}>
                          一键下版
                        </Button>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        ) : (
          !loading && searched && (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <div>
                  <p style={{ margin: '8px 0', fontSize: 14 }}>
                    {keyword ? `未找到包含「${keyword}」的款式` : '暂无款式数据'}
                  </p>
                  <p style={{ margin: 0, color: '#999', fontSize: 12 }}>
                    此处显示的是您系统中的真实款式数据。请先在「款式管理」中录入款式，或调整搜索条件。
                  </p>
                </div>
              }
            />
          )
        )}
      </Spin>
    </div>
  );
}
