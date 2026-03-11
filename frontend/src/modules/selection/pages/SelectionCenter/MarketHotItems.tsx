import React, { useState } from 'react';
import { Row, Col, Button, Tag, Space, message, Typography, Tooltip } from 'antd';
import { FireOutlined, SendOutlined, PlusOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { candidateSave, candidateStageAction, candidateCreateStyle } from '@/services/selection/selectionApi';

const { Text } = Typography;

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

const HOT_ITEMS: HotItem[] = [
  {
    key: 'm1', styleName: '春日碎花泡泡袖连衣裙', category: '连衣裙', colorFamily: '粉色系',
    trendScore: 94, costEstimate: 85, targetPrice: 168,
    tags: ['春夏爆款', '韩系'], remark: '2026春夏热搜NO.1，泡泡袖+碎花，韩系甜美风',
  },
  {
    key: 'm2', styleName: 'Y2K辣妹短款露脐卫衣', category: '卫衣', colorFamily: '多色',
    trendScore: 91, costEstimate: 55, targetPrice: 118,
    tags: ['Z世代', '复古Y2K'], remark: '小红书爆款，Z世代必备，辣妹风全年热销',
  },
  {
    key: 'm3', styleName: '宽松牛仔工装阔腿裤', category: '裤子', colorFamily: '深蓝色',
    trendScore: 88, costEstimate: 70, targetPrice: 138,
    tags: ['百搭', '工装风'], remark: '复古工装风，全年出货稳定，多尺码好卖',
  },
  {
    key: 'm4', styleName: '醋酸缎面吊带长裙', category: '长裙', colorFamily: '茶色系',
    trendScore: 86, costEstimate: 75, targetPrice: 158,
    tags: ['轻奢质感', '夏季'], remark: '醋酸面料显高级感，出行/职场/聚会通用',
  },
  {
    key: 'm5', styleName: '法式方领短款西装', category: '外套', colorFamily: '米白色',
    trendScore: 83, costEstimate: 95, targetPrice: 198,
    tags: ['法式风', '职场'], remark: '小众法式风，客单价高，上班/约会两穿',
  },
  {
    key: 'm6', styleName: '户外机能防晒衣', category: '外套', colorFamily: '卡其色',
    trendScore: 89, costEstimate: 65, targetPrice: 128,
    tags: ['防晒', '户外热'], remark: '防晒功能款，跑量爆款，夏季出口热销',
  },
  {
    key: 'm7', styleName: '新中式斜襟提花衬衫', category: '衬衫', colorFamily: '绿色系',
    trendScore: 85, costEstimate: 80, targetPrice: 168,
    tags: ['新中式', '国潮'], remark: '国潮新中式热度持续爆发，差异化品类竞争小',
  },
  {
    key: 'm8', styleName: '高腰显瘦喇叭牛仔裤', category: '裤子', colorFamily: '浅蓝色',
    trendScore: 82, costEstimate: 65, targetPrice: 128,
    tags: ['显瘦神器', '欧美'], remark: '欧美风显瘦经典款，跨境出口持续热销',
  },
];

const HEAT_COLOR = (score: number) =>
  score >= 90 ? '#ff4d4f' : score >= 80 ? '#fa8c16' : '#52c41a';

export default function MarketHotItems({ onAdded }: { onAdded?: () => void }) {
  const [addLoading, setAddLoading] = useState<Record<string, boolean>>({});
  const [deployLoading, setDeployLoading] = useState<Record<string, boolean>>({});

  const handleAdd = async (item: HotItem) => {
    setAddLoading(prev => ({ ...prev, [item.key]: true }));
    try {
      await candidateSave({
        styleName: item.styleName, category: item.category,
        colorFamily: item.colorFamily, sourceType: 'MARKET',
        costEstimate: item.costEstimate, targetPrice: item.targetPrice,
        remark: item.remark,
      });
      message.success(`「${item.styleName}」已加入我的选品库`);
      onAdded?.();
    } catch { message.error('添加失败，请重试'); }
    finally { setAddLoading(prev => ({ ...prev, [item.key]: false })); }
  };

  const handleDeploy = async (item: HotItem) => {
    setDeployLoading(prev => ({ ...prev, [item.key]: true }));
    try {
      const candidate = await candidateSave({
        styleName: item.styleName, category: item.category,
        colorFamily: item.colorFamily, sourceType: 'MARKET',
        costEstimate: item.costEstimate, targetPrice: item.targetPrice,
        remark: item.remark,
      }) as { id?: number };
      const id = candidate?.id;
      if (!id) throw new Error('保存失败，未获取到ID');
      await candidateStageAction(id, 'approve');
      await candidateCreateStyle(id);
      message.success(`「${item.styleName}」已下版！请到「样衣管理」查看`);
      onAdded?.();
    } catch (e: unknown) {
      message.error((e as { message?: string })?.message ?? '下版失败，请重试');
    } finally { setDeployLoading(prev => ({ ...prev, [item.key]: false })); }
  };

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <FireOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />
        <Text strong>2026春夏市场热门趋势款</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>点击「加入选品」评审后再下版，或直接「一键下版」生成样衣</Text>
      </div>
      <Row gutter={[16, 16]}>
        {HOT_ITEMS.map(item => (
          <Col key={item.key} xs={24} sm={12} md={8} lg={6} xl={4}>
            <div style={{
              border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden',
              background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              transition: 'box-shadow 0.2s',
            }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.14)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)')}
            >
              {/* 热度图示区 */}
              <div style={{
                height: 100, background: `linear-gradient(135deg, #fff7e6, #fff2e8)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', position: 'relative',
              }}>
                <FireOutlined style={{ fontSize: 32, color: HEAT_COLOR(item.trendScore) }} />
                <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>{item.category} · {item.colorFamily}</div>
                <div style={{
                  position: 'absolute', top: 8, right: 8,
                  background: HEAT_COLOR(item.trendScore), borderRadius: 4,
                  padding: '2px 8px', color: '#fff', fontSize: 12, fontWeight: 700,
                }}>
                  <ThunderboltOutlined /> {item.trendScore}
                </div>
              </div>
              {/* 信息区 */}
              <div style={{ padding: '10px 12px' }}>
                <div style={{
                  fontWeight: 600, fontSize: 13, marginBottom: 4,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {item.styleName}
                </div>
                <div style={{ marginBottom: 6 }}>
                  {item.tags.map(t => <Tag key={t} style={{ fontSize: 10, marginBottom: 2, padding: '0 4px' }}>{t}</Tag>)}
                </div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 8, lineHeight: 1.4 }}>
                  成本 ¥{item.costEstimate} · 报价 ¥{item.targetPrice}
                </div>
                <Space size={6} style={{ width: '100%' }}>
                  <Tooltip title="加入我的选品库，可AI评审后再决定">
                    <Button
                      size="small"
                      icon={<PlusOutlined />}
                      loading={addLoading[item.key]}
                      onClick={() => handleAdd(item)}
                      style={{ fontSize: 11 }}
                    >
                      加入选品
                    </Button>
                  </Tooltip>
                  <Tooltip title="直接生成款式，进入样衣开发流程">
                    <Button
                      size="small"
                      type="primary"
                      icon={<SendOutlined />}
                      loading={deployLoading[item.key]}
                      onClick={() => handleDeploy(item)}
                      style={{ fontSize: 11 }}
                    >
                      一键下版
                    </Button>
                  </Tooltip>
                </Space>
              </div>
            </div>
          </Col>
        ))}
      </Row>
    </div>
  );
}
