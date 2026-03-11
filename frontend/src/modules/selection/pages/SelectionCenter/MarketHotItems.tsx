import React, { useState, useEffect, useMemo } from 'react';
import { Row, Col, Button, Tag, Select, Space, message, Typography, Tooltip, Spin, Progress } from 'antd';
import { FireOutlined, SendOutlined, PlusOutlined, ThunderboltOutlined, StarFilled, LineChartOutlined } from '@ant-design/icons';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import { candidateSave, candidateStageAction, candidateCreateStyle, topStyles } from '@/services/selection/selectionApi';

const { Text } = Typography;

// ── 品类视觉配置（渐变背景 + 大 emoji + 主题色）──────────────────────────
const CATEGORY_VISUAL: Record<string, { bg: string; emoji: string; accent: string }> = {
  '连衣裙': { bg: 'linear-gradient(135deg,#fce4ec 0%,#f8bbd0 100%)', emoji: '👗', accent: '#c2185b' },
  '外套':   { bg: 'linear-gradient(135deg,#e3f2fd 0%,#bbdefb 100%)', emoji: '🧥', accent: '#1565c0' },
  '卫衣':   { bg: 'linear-gradient(135deg,#fff3e0 0%,#ffe0b2 100%)', emoji: '🩱', accent: '#e65100' },
  '裤子':   { bg: 'linear-gradient(135deg,#e8eaf6 0%,#c5cae9 100%)', emoji: '👖', accent: '#283593' },
  '衬衫':   { bg: 'linear-gradient(135deg,#e0f7fa 0%,#b2ebf2 100%)', emoji: '👔', accent: '#006064' },
  'T恤':    { bg: 'linear-gradient(135deg,#e8f5e9 0%,#c8e6c9 100%)', emoji: '👕', accent: '#2e7d32' },
  '半身裙': { bg: 'linear-gradient(135deg,#fce4ec 0%,#f48fb1 100%)', emoji: '🌸', accent: '#ad1457' },
  '半裙':   { bg: 'linear-gradient(135deg,#fce4ec 0%,#f48fb1 100%)', emoji: '🌸', accent: '#ad1457' },
  '针织':   { bg: 'linear-gradient(135deg,#fff8e1 0%,#ffecb3 100%)', emoji: '🧶', accent: '#ff6f00' },
  '长裙':   { bg: 'linear-gradient(135deg,#ede7f6 0%,#d1c4e9 100%)', emoji: '✨', accent: '#4a148c' },
  '背心':   { bg: 'linear-gradient(135deg,#f3e5f5 0%,#ce93d8 100%)', emoji: '🦺', accent: '#6a1b9a' },
  '上衣':   { bg: 'linear-gradient(135deg,#e0f2f1 0%,#a5d6a7 100%)', emoji: '👚', accent: '#00695c' },
};
const DEFAULT_VISUAL = { bg: 'linear-gradient(135deg,#f5f5f5 0%,#eeeeee 100%)', emoji: '👗', accent: '#757575' };
const getVisual = (cat: string) => CATEGORY_VISUAL[cat] ?? DEFAULT_VISUAL;

// ── AI 指标计算 ──────────────────────────────────────────────────────────────
function aiMetrics(item: HotItem) {
  const profitRate = item.targetPrice > 0
    ? Math.round((item.targetPrice - item.costEstimate) / item.targetPrice * 100) : 0;
  const rec = Math.round(item.trendScore * 0.6 + Math.min(100, profitRate * 1.5) * 0.4);
  return { profitRate, rec };
}
const profitColor = (r: number) => r >= 50 ? '#52c41a' : r >= 35 ? '#fa8c16' : '#ff4d4f';
const heatColor  = (s: number) => s >= 90 ? '#ff4d4f' : s >= 85 ? '#fa8c16' : '#1890ff';
const recLabel   = (s: number) => s >= 88
  ? { text: '强烈推荐', color: '#ff4d4f' }
  : s >= 78 ? { text: '推荐', color: '#fa8c16' }
  : { text: '可考虑', color: '#52c41a' };

// ── 季节标签判断 ─────────────────────────────────────────────────────────────
function itemSeason(tags: string[]): 'spring_summer' | 'autumn_winter' | 'all' {
  const joined = tags.join('');
  if (/春|夏/.test(joined)) return 'spring_summer';
  if (/秋|冬/.test(joined)) return 'autumn_winter';
  return 'all';
}

interface HotItem {
  key: string;
  styleName: string;
  category: string;
  colorFamily: string;
  trendScore: number;
  costEstimate: number;
  targetPrice: number;
  tags: string[];
  remark: string;
}

// 30款 2026流行趋势参考数据（系统无历史数据时兜底展示）
const FALLBACK_ITEMS: HotItem[] = [
  { key: 'f01', styleName: '春日碎花泡泡袖连衣裙', category: '连衣裙', colorFamily: '粉色系', trendScore: 94, costEstimate: 85, targetPrice: 168, tags: ['春夏爆款', '韩系甜美'], remark: '2026春夏热搜TOP1，泡泡袖+碎花，韩系甜美风' },
  { key: 'f02', styleName: '新中式盘扣旗袍改良款', category: '连衣裙', colorFamily: '藏青色', trendScore: 92, costEstimate: 110, targetPrice: 228, tags: ['新中式', '国潮高端'], remark: '国风爆款，改良旗袍高级感强，溢价空间大' },
  { key: 'f03', styleName: 'Y2K辣妹短款露脐卫衣', category: '卫衣', colorFamily: '多色', trendScore: 91, costEstimate: 55, targetPrice: 118, tags: ['Z世代', '复古Y2K'], remark: '小红书爆款，Z世代必备，辣妹风全年热销' },
  { key: 'f04', styleName: '户外机能轻薄防晒衣', category: '外套', colorFamily: '卡其色', trendScore: 89, costEstimate: 65, targetPrice: 128, tags: ['防晒功能', '夏季必备'], remark: '防晒功能款，夏季跑量爆款，出口热销' },
  { key: 'f05', styleName: '宽松牛仔工装阔腿裤', category: '裤子', colorFamily: '深蓝色', trendScore: 88, costEstimate: 70, targetPrice: 138, tags: ['百搭基础', '工装风'], remark: '复古工装风，全年出货稳定，多尺码好卖' },
  { key: 'f06', styleName: '香芋紫泡泡袖针织开衫', category: '针织', colorFamily: '紫色系', trendScore: 87, costEstimate: 75, targetPrice: 158, tags: ['甜美学院', '秋冬爆量'], remark: '香芋紫大热色系，泡泡袖设计增量' },
  { key: 'f07', styleName: '软妹毛绒泡泡袖小外套', category: '外套', colorFamily: '奶白色', trendScore: 87, costEstimate: 90, targetPrice: 188, tags: ['甜妹风', '秋冬'], remark: '毛绒感面料，泡泡袖，保暖又显瘦' },
  { key: 'f08', styleName: '醋酸缎面吊带长裙', category: '长裙', colorFamily: '茶色系', trendScore: 86, costEstimate: 75, targetPrice: 158, tags: ['轻奢质感', '出行聚会'], remark: '醋酸面料显高级感，出行/职场/聚会通用' },
  { key: 'f09', styleName: '甜辣格纹短款T恤', category: 'T恤', colorFamily: '格纹多色', trendScore: 86, costEstimate: 35, targetPrice: 78, tags: ['夏日必备', '高复购'], remark: '格纹基础T恤，高复购率，买手必备' },
  { key: 'f10', styleName: '新中式斜襟提花衬衫', category: '衬衫', colorFamily: '绿色系', trendScore: 85, costEstimate: 80, targetPrice: 168, tags: ['新中式', '国潮'], remark: '国潮新中式热度持续爆发，竞争差异化' },
  { key: 'f11', styleName: '立体绣花蕾丝半身裙', category: '半身裙', colorFamily: '米白色', trendScore: 85, costEstimate: 95, targetPrice: 198, tags: ['法式甜美', '轻奢感'], remark: '蕾丝+立体绣花，轻奢感满分，出片率高' },
  { key: 'f12', styleName: '多巴胺撞色Polo衫', category: 'T恤', colorFamily: '撞色系', trendScore: 85, costEstimate: 45, targetPrice: 98, tags: ['多巴胺穿搭', '夏日'], remark: '多巴胺穿搭趋势，撞色设计抓眼球' },
  { key: 'f13', styleName: '法式碎花灯笼袖衬衣', category: '上衣', colorFamily: '碎花', trendScore: 83, costEstimate: 65, targetPrice: 138, tags: ['法式碎花', '春夏'], remark: '法式碎花经典款，搭配性强，出货量稳定' },
  { key: 'f14', styleName: '港风复古圆领针织衫', category: '针织', colorFamily: '奶咖色', trendScore: 83, costEstimate: 70, targetPrice: 148, tags: ['港风复古', '秋冬百搭'], remark: '港味复古风，秋冬百搭基础款' },
  { key: 'f15', styleName: '镂空蕾丝海边短款上衣', category: '上衣', colorFamily: '白色', trendScore: 83, costEstimate: 50, targetPrice: 108, tags: ['海边度假', '出片率高'], remark: '度假风必备，蕾丝镂空出片率极高' },
  { key: 'f16', styleName: '复古格纹高腰半裙', category: '半身裙', colorFamily: '格纹色', trendScore: 84, costEstimate: 65, targetPrice: 128, tags: ['复古学院', '英伦风'], remark: '格纹学院风，秋冬常销经典款' },
  { key: 'f17', styleName: '山系机能户外派克外套', category: '外套', colorFamily: '军绿色', trendScore: 84, costEstimate: 120, targetPrice: 248, tags: ['户外机能', '秋冬大衣'], remark: '户外山系风大热，功能性外套耐穿好卖' },
  { key: 'f18', styleName: '夏日超短牛仔热裤', category: '裤子', colorFamily: '浅蓝色', trendScore: 84, costEstimate: 40, targetPrice: 88, tags: ['辣妹风', '夏日爆款'], remark: '夏季辣妹必备，短裤季爆量款' },
  { key: 'f19', styleName: '法式方领短款西装外套', category: '外套', colorFamily: '米白色', trendScore: 83, costEstimate: 95, targetPrice: 198, tags: ['法式职场', '两穿'], remark: '法式风高客单价，上班/约会两穿' },
  { key: 'f20', styleName: '高腰显瘦喇叭牛仔裤', category: '裤子', colorFamily: '浅蓝色', trendScore: 82, costEstimate: 65, targetPrice: 128, tags: ['显瘦神器', '欧美风'], remark: '欧美风显瘦经典款，跨境出口持续热销' },
  { key: 'f21', styleName: '西装短款阔腿九分裤', category: '裤子', colorFamily: '黑色', trendScore: 82, costEstimate: 75, targetPrice: 148, tags: ['职场通勤', '显高'], remark: '职场通勤款，西裤面料四季可穿' },
  { key: 'f22', styleName: '工装多口袋机能马甲', category: '背心', colorFamily: '黑色', trendScore: 82, costEstimate: 55, targetPrice: 118, tags: ['机能工装', '百搭外穿'], remark: '机能工装风，多口袋实用性强' },
  { key: 'f23', styleName: '蝴蝶结甜美法式泡泡裙', category: '连衣裙', colorFamily: '粉红色', trendScore: 81, costEstimate: 90, targetPrice: 188, tags: ['甜美少女', '约会'], remark: '蝴蝶结+泡泡设计，少女感满满' },
  { key: 'f24', styleName: '蓬蓬纱裙叠穿半身裙', category: '半身裙', colorFamily: '浅粉色', trendScore: 81, costEstimate: 80, targetPrice: 168, tags: ['公主感', '叠穿出片'], remark: '蓬蓬纱浪漫感，多层叠穿出片率高' },
  { key: 'f25', styleName: '解构主义不对称设计西装', category: '外套', colorFamily: '格纹', trendScore: 81, costEstimate: 110, targetPrice: 228, tags: ['设计感', '艺术小众'], remark: '解构设计小众感强，溢价高，艺术群体首选' },
  { key: 'f26', styleName: '大廓形落肩街头皮衣', category: '外套', colorFamily: '黑色', trendScore: 80, costEstimate: 130, targetPrice: 268, tags: ['街头潮流', '酷感'], remark: '大廓形皮衣，街头酷感，秋冬热销款' },
  { key: 'f27', styleName: '软糯垂坠丝绒阔腿裤', category: '裤子', colorFamily: '墨绿色', trendScore: 80, costEstimate: 85, targetPrice: 178, tags: ['高级质感', '秋冬'], remark: '丝绒面料垂坠感强，穿出高级感' },
  { key: 'f28', styleName: '渐变扎染宽松运动套装', category: '裤子', colorFamily: '渐变色', trendScore: 80, costEstimate: 65, targetPrice: 138, tags: ['扎染潮流', '休闲运动'], remark: '扎染工艺流行趋势，运动休闲两穿' },
  { key: 'f29', styleName: '原宿甜酷格纹超短裙', category: '半身裙', colorFamily: '格纹多色', trendScore: 80, costEstimate: 50, targetPrice: 108, tags: ['原宿风', '甜酷少女'], remark: '日系原宿风复兴，甜酷少女风爆发' },
  { key: 'f30', styleName: '冷淡风宽松连帽卫衣', category: '卫衣', colorFamily: '灰色系', trendScore: 80, costEstimate: 55, targetPrice: 118, tags: ['极简中性', '男女同款'], remark: '中性极简风，男女同款打法，受众更广' },
];

const CATEGORIES = ['全部', '连衣裙', '外套', '卫衣', '裤子', '衬衫', 'T恤', '半身裙', '针织', '长裙', '背心', '上衣'];

export default function MarketHotItems({ onAdded }: { onAdded?: () => void }) {
  const [items, setItems] = useState<HotItem[]>(FALLBACK_ITEMS);
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState<'real' | 'fallback'>('fallback');
  const [keyword, setKeyword] = useState('');
  const [season, setSeason] = useState<'all' | 'spring_summer' | 'autumn_winter'>('all');
  const [category, setCategory] = useState('全部');
  const [addLoading, setAddLoading]    = useState<Record<string, boolean>>({});
  const [deployLoading, setDeployLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    topStyles(30)
      .then((data: unknown) => {
        const arr = data as Array<Record<string, unknown>>;
        if (arr?.length >= 5) {
          const mapped: HotItem[] = arr.map((dto, i) => ({
            key: `real_${String(dto.id ?? i)}`,
            styleName:    String(dto.styleName ?? `款式${i + 1}`),
            category:     String(dto.category ?? '时装'),
            colorFamily:  String(dto.colorFamily ?? '多色'),
            trendScore:   Math.min(95, 70 + Math.min(25, Math.round(Number(dto.totalQuantity ?? dto.orderCount ?? 10) / 5))),
            costEstimate: Number(dto.costEstimate ?? 80),
            targetPrice:  Number(dto.targetPrice ?? 168),
            tags: ['系统热销', String(dto.category ?? '时装')].filter(Boolean),
            remark: `热销款式，已累计出货 ${String(dto.totalQuantity ?? '-')} 件`,
          }));
          setItems(mapped.length >= 20 ? mapped : [...mapped, ...FALLBACK_ITEMS.slice(mapped.length)]);
          setDataSource('real');
        }
      })
      .catch(() => { /* 保留 fallback */ })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = items;
    if (keyword)  list = list.filter(i => i.styleName.includes(keyword) || i.category.includes(keyword) || i.tags.some(t => t.includes(keyword)));
    if (season !== 'all') list = list.filter(i => { const s = itemSeason(i.tags); return s === season || s === 'all'; });
    if (category !== '全部') list = list.filter(i => i.category === category);
    return list;
  }, [items, keyword, season, category]);

  const handleAdd = async (item: HotItem) => {
    setAddLoading(p => ({ ...p, [item.key]: true }));
    try {
      // 后端会自动获取/创建「市场热品导入」批次，无需传 batchId
      await candidateSave({
        styleName: item.styleName, category: item.category, colorFamily: item.colorFamily,
        sourceType: 'MARKET', costEstimate: item.costEstimate, targetPrice: item.targetPrice,
        remark: item.remark,
      });
      message.success(`「${item.styleName}」已加入选品库`);
      onAdded?.();
    } catch { message.error('添加失败，请重试'); }
    finally { setAddLoading(p => ({ ...p, [item.key]: false })); }
  };

  const handleDeploy = async (item: HotItem) => {
    setDeployLoading(p => ({ ...p, [item.key]: true }));
    try {
      const res = await candidateSave({
        styleName: item.styleName, category: item.category, colorFamily: item.colorFamily,
        sourceType: 'MARKET', costEstimate: item.costEstimate, targetPrice: item.targetPrice,
        remark: item.remark,
      }) as { id?: number };
      if (!res?.id) throw new Error('保存失败，未获取候选款ID');
      await candidateStageAction(res.id, 'approve');
      await candidateCreateStyle(res.id);
      message.success(`「${item.styleName}」已一键下版！到「样衣管理」查看`);
      onAdded?.();
    } catch (e: unknown) {
      message.error((e as { message?: string })?.message ?? '下版失败，请重试');
    } finally { setDeployLoading(p => ({ ...p, [item.key]: false })); }
  };

  const seasonTabs = [
    { key: 'all',           label: '🌐 全部' },
    { key: 'spring_summer', label: '🌸 春夏款' },
    { key: 'autumn_winter', label: '🍂 秋冬款' },
  ];

  return (
    <div>
      {/* 顶部：标题行 + 数据来源 + 搜索 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <Space align="center">
          <FireOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />
          <Text strong style={{ fontSize: 14 }}>2026流行趋势款 · {filtered.length} 款</Text>
          <Tag color={dataSource === 'real' ? 'green' : 'orange'} style={{ fontSize: 11 }}>
            {dataSource === 'real' ? '📊 基于系统真实数据' : '📋 市场参考数据'}
          </Tag>
          <Text type="secondary" style={{ fontSize: 11 }}>加入选品库评审，或直接一键下版开发样衣</Text>
        </Space>
        <StandardSearchBar
          searchValue={keyword}
          onSearchChange={setKeyword}
          searchPlaceholder="搜款式名 / 品类 / 标签"
          showDate={false}
          showStatus={false}
        />
      </div>

      {/* 季节筛选 Tab + 品类下拉 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {seasonTabs.map(t => (
            <Button
              key={t.key}
              size="small"
              type={season === t.key ? 'primary' : 'default'}
              onClick={() => setSeason(t.key as typeof season)}
              style={{ borderRadius: 20, fontSize: 12 }}
            >
              {t.label}
            </Button>
          ))}
        </div>
        <Select
          size="small"
          value={category}
          onChange={setCategory}
          options={CATEGORIES.map(c => ({ label: c, value: c }))}
          style={{ width: 110 }}
          placeholder="品类"
        />
        <Text type="secondary" style={{ fontSize: 11, marginLeft: 'auto' }}>
          <LineChartOutlined /> AI分析 = 热度指数 × 0.6 + 利润空间 × 0.4
        </Text>
      </div>

      <Spin spinning={loading}>
        <Row gutter={[12, 14]}>
          {filtered.map(item => {
            const visual = getVisual(item.category);
            const { profitRate, rec } = aiMetrics(item);
            const recLvl = recLabel(rec);
            return (
              <Col key={item.key} xs={24} sm={12} md={8} lg={6}>
                <div
                  style={{ border: '1px solid #f0f0f0', borderRadius: 10, background: '#fff', overflow: 'hidden', transition: 'box-shadow .2s, transform .2s', display: 'flex', flexDirection: 'column' }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
                >
                  {/* 品类图片区：渐变背景 + 大 emoji */}
                  <div style={{ height: 90, background: visual.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0 }}>
                    <span style={{ fontSize: 44, lineHeight: 1, userSelect: 'none' }}>{visual.emoji}</span>
                    {/* 热度角标 */}
                    <div style={{ position: 'absolute', top: 7, right: 8, background: heatColor(item.trendScore), color: '#fff', borderRadius: 12, padding: '1px 8px', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                      <ThunderboltOutlined /> {item.trendScore}热度
                    </div>
                    {/* 推荐角标 */}
                    <div style={{ position: 'absolute', top: 7, left: 8, background: recLvl.color, color: '#fff', borderRadius: 12, padding: '1px 8px', fontSize: 10, fontWeight: 600 }}>
                      <StarFilled style={{ fontSize: 9, marginRight: 2 }} />{recLvl.text}
                    </div>
                    {/* 品类名 */}
                    <div style={{ position: 'absolute', bottom: 5, left: 0, right: 0, textAlign: 'center', fontSize: 10, color: visual.accent, fontWeight: 600, letterSpacing: 0.5 }}>
                      {item.category} · {item.colorFamily}
                    </div>
                  </div>

                  {/* 内容区 */}
                  <div style={{ padding: '8px 10px', flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {/* 款式名 */}
                    <Tooltip title={item.styleName}>
                      <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#1a1a1a' }}>{item.styleName}</div>
                    </Tooltip>

                    {/* 标签 */}
                    <div>
                      {item.tags.slice(0, 3).map(t => (
                        <Tag key={t} style={{ fontSize: 10, margin: '0 2px 2px 0', padding: '0 5px', border: 'none', background: '#f5f5f5', color: '#595959', borderRadius: 4 }}>{t}</Tag>
                      ))}
                    </div>

                    {/* 说明文字 */}
                    <Text type="secondary" style={{ fontSize: 10, lineHeight: 1.4 }}>{item.remark}</Text>

                    {/* AI 分析指标区 */}
                    <div style={{ background: '#fafafa', borderRadius: 6, padding: '6px 8px', border: '1px solid #f0f0f0' }}>
                      <div style={{ fontSize: 10, color: '#8c8c8c', marginBottom: 4, fontWeight: 600, letterSpacing: 0.5 }}>AI 分析指标</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {/* 利润率 */}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10, color: '#8c8c8c', marginBottom: 2 }}>利润率</div>
                          <div style={{ fontWeight: 700, color: profitColor(profitRate), fontSize: 14 }}>{profitRate}%</div>
                          <div style={{ fontSize: 9, color: '#bbb' }}>¥{item.costEstimate}→¥{item.targetPrice}</div>
                        </div>
                        {/* 热度进度 */}
                        <div style={{ flex: 2 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8c8c8c', marginBottom: 2 }}>
                            <span>热度指数</span><span style={{ color: heatColor(item.trendScore), fontWeight: 600 }}>{item.trendScore}</span>
                          </div>
                          <Progress percent={item.trendScore} showInfo={false} strokeColor={heatColor(item.trendScore)} size="small" />
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8c8c8c', marginTop: 2 }}>
                            <span>综合推荐</span><span style={{ color: recLvl.color, fontWeight: 600 }}>{rec}分</span>
                          </div>
                          <Progress percent={rec} showInfo={false} strokeColor={recLvl.color} size="small" />
                        </div>
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                      <Tooltip title="加入选品库，走评审流程决定是否开发">
                        <Button block size="small" icon={<PlusOutlined />} loading={addLoading[item.key]} onClick={() => handleAdd(item)} style={{ flex: 1, fontSize: 11 }}>加入选品</Button>
                      </Tooltip>
                      <Tooltip title="直接生成款式，进入样衣开发流程">
                        <Button block size="small" type="primary" icon={<SendOutlined />} loading={deployLoading[item.key]} onClick={() => handleDeploy(item)} style={{ flex: 1, fontSize: 11 }}>一键下版</Button>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              </Col>
            );
          })}
          {filtered.length === 0 && !loading && (
            <Col span={24}>
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#bbb' }}>
                <FireOutlined style={{ fontSize: 30, opacity: 0.3 }} />
                <div style={{ marginTop: 8 }}>暂无匹配款式，试试调整筛选条件</div>
              </div>
            </Col>
          )}
        </Row>
      </Spin>
    </div>
  );
}
