import React, { useState, useEffect } from 'react';
import {
  Card,
  Collapse,
  Steps,
  Typography,
  Space,
  Tag,
  Image,
  Empty,
  Button,
  Row,
  Col,
  Tabs,
  Alert,
  Timeline,
  Badge,
} from 'antd';
import {
  BookOutlined,
  QuestionCircleOutlined,
  RocketOutlined,
  FileTextOutlined,
  VideoCameraOutlined,
  BulbOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import './style.css';
import type { Dayjs } from 'dayjs';
import type { Tutorial } from './types';
import { tutorials } from './tutorialData';

const { Title, Text, Paragraph } = Typography;

/** 根据 URL 形态渲染视频播放器 */
const VideoPlayerBlock: React.FC<{ url: string }> = ({ url }) => {
  const u = url.trim();

  // Bilibili：支持 BV 号
  const bvMatch = u.match(/bilibili\.com\/video\/(BV[\w]+)/i);
  if (bvMatch) {
    return (
      <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden' }}>
        <iframe
          src={`//player.bilibili.com/player.html?bvid=${bvMatch[1]}&page=1&high_quality=1&danmaku=0`}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
          allowFullScreen
          title="视频教程"
        />
      </div>
    );
  }

  // YouTube
  const ytMatch = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)?([\w-]{11})/);
  if (u.includes('youtube.com') || u.includes('youtu.be')) {
    const _vid = ytMatch ? ytMatch[1] : '';
    return (
      <Alert
        type="warning"
        showIcon
        message="YouTube 视频无法播放"
        description={
          <>
            <p style={{ margin: '4px 0' }}>YouTube 在国内网络环境下无法访问，请将视频上传至 Bilibili 后使用 Bilibili 链接。</p>
            <p style={{ margin: '4px 0' }}>原始链接：<a href={u} target="_blank" rel="noopener noreferrer">{u}</a></p>
          </>
        }
      />
    );
  }

  // 直链 MP4 / WebM
  if (/\.(mp4|webm|mov)(\?.*)?$/i.test(u)) {
    return (
      <video
        src={u}
        controls
        style={{ width: '100%', maxHeight: 480, background: '#000', display: 'block', borderRadius: 6 }}
        preload="metadata"
      >
        您的浏览器不支持 video 标签，请
        <a href={u} target="_blank" rel="noopener noreferrer">点击下载观看</a>。
      </video>
    );
  }

  // 其他链接：直接显示可点击链接
  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        description={
          <>
            视频链接：
            <a href={u} target="_blank" rel="noopener noreferrer">{u}</a>
          </>
        }
      />
      <Button type="primary" onClick={() => window.open(u, '_blank')}>
         点击播放视频
      </Button>
    </Space>
  );
};

const SystemTutorial: React.FC = () => {
  const [searchText, setSearchText] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [filteredTutorials, setFilteredTutorials] = useState<Tutorial[]>([]);

  // 分类定义
  const categories = [
    { key: 'all', label: '全部教程', icon: <BookOutlined /> },
    { key: 'getting-started', label: '入门指南', icon: <RocketOutlined /> },
    { key: 'sample', label: '样衣管理', icon: <FileTextOutlined /> },
    { key: 'production', label: '生产管理', icon: <RocketOutlined /> },
    { key: 'warehouse', label: '仓储管理', icon: <BulbOutlined /> },
    { key: 'mobile', label: '小程序操作', icon: <VideoCameraOutlined /> },
    { key: 'finance', label: '财务管理', icon: <FileTextOutlined /> },
    { key: 'system', label: '系统设置', icon: <ThunderboltOutlined /> },
  ];

  // 难度标签样式
  const getDifficultyTag = (difficulty: string) => {
    const configs = {
      beginner: { label: '入门', color: 'green' },
      intermediate: { label: '进阶', color: 'orange' },
      advanced: { label: '高级', color: 'red' },
    };
    const config = configs[difficulty as keyof typeof configs] || configs.beginner;
    return <Tag color={config.color}>{config.label}</Tag>;
  };

  // 搜索和筛选
  useEffect(() => {
    let result = tutorials;

    // 分类筛选
    if (activeCategory !== 'all') {
      result = result.filter((t) => t.category === activeCategory);
    }

    // 搜索筛选
    if (searchText.trim()) {
      const search = searchText.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(search) ||
          t.tags.some((tag) => tag.toLowerCase().includes(search)) ||
          t.steps.some((step) => step.title.toLowerCase().includes(search))
      );
    }

    setFilteredTutorials(result);
  }, [activeCategory, searchText]);

  return (
    <>
      <div className="system-tutorial-container">
        {/* 页面头部 */}
        <div className="tutorial-page-header">
          <div className="header-content">
            <div className="tutorial-title-section">
              <BookOutlined className="tutorial-header-icon" />
              <div>
                <h2 className="tutorial-page-title">系统教学中心</h2>
                <Text type="secondary">从入门到精通，快速掌握服装供应链管理系统</Text>
              </div>
            </div>
          </div>
      </div>

      {/* 快速指引 */}
      <Alert
        title=" 新手指引"
        description={
          <div>
            <p style={{ marginBottom: 8 }}>
              <strong>建议学习路径：</strong>
            </p>
            <Timeline
              items={[
                { content: '1⃣ 先学习「生产订单创建」和「人员与权限管理」了解系统基础' },
                { content: '2⃣ 掌握「裁剪单生成」和「小程序扫码工序」进行实操练习' },
                { content: '3⃣ 学习「质检入库」和「面辅料管理」完善生产流程' },
                { content: '4⃣ 最后学习「对账与财务结算」掌握完整业务闭环' },
              ]}
            />
          </div>
        }
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      {/* 搜索和分类 */}
      <Card style={{ marginBottom: 24 }}>
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          <StandardSearchBar
            searchValue={searchText}
            onSearchChange={setSearchText}
            searchPlaceholder="搜索教程标题、标签或步骤"
            dateValue={dateRange}
            onDateChange={setDateRange}
            statusValue={activeCategory}
            onStatusChange={setActiveCategory}
            statusOptions={categories.map((cat) => ({
              label: cat.label,
              value: cat.key,
            }))}
          />
          <Space wrap size={[12, 12]}>
            {categories.map((cat) => (
              <Button
                key={cat.key}
                type={activeCategory === cat.key ? 'primary' : 'default'}
                icon={cat.icon}
                onClick={() => setActiveCategory(cat.key)}
              >
                {cat.label}
              </Button>
            ))}
          </Space>
        </Space>
      </Card>

      {/* 教程列表 */}
      {filteredTutorials.length === 0 ? (
        <Card>
          <Empty description="未找到相关教程，请尝试其他关键词" />
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {filteredTutorials.map((tutorial) => (
            <Col xs={24} key={tutorial.id}>
              <Card
                className="tutorial-card"
                title={
                  <Space>
                    <FileTextOutlined />
                    <span>{tutorial.title}</span>
                    {getDifficultyTag(tutorial.difficulty)}
                    <Tag>{tutorial.duration}</Tag>
                  </Space>
                }
                extra={
                  <Space>
                    {tutorial.tags.map((tag) => (
                      <Tag key={tag} color="blue">
                        {tag}
                      </Tag>
                    ))}
                  </Space>
                }
              >
                <Tabs
                  defaultActiveKey="steps"
                  items={[
                    {
                      key: 'steps',
                      label: ' 操作步骤',
                      children: (
                        <Steps
                          orientation="vertical"
                          current={-1}
                          items={tutorial.steps.map((step, index) => ({
                            title: (
                              <Space>
                                <Badge count={index + 1} style={{ backgroundColor: 'var(--color-success)' }} />
                                <strong>{step.title}</strong>
                              </Space>
                            ),
                            content: (
                              <div style={{ paddingLeft: 30 }}>
                                <Paragraph>{step.description}</Paragraph>
                                {step.tips && step.tips.length > 0 && (
                                  <Alert
                                    title=" 温馨提示"
                                    description={
                                      <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
                                        {step.tips.map((tip, i) => (
                                          <li key={i}>{tip}</li>
                                        ))}
                                      </ul>
                                    }
                                    type="success"
                                    showIcon
                                    style={{ marginTop: 12 }}
                                  />
                                )}
                                {step.image && (
                                  <Image
                                    src={step.image}
                                    alt={step.title}
                                    style={{ marginTop: 12, maxWidth: 600 }}
                                    preview
                                  />
                                )}
                              </div>
                            ),
                            status: 'finish',
                          }))}
                        />
                      ),
                    },
                    ...(tutorial.faqs && tutorial.faqs.length > 0 ? [{
                      key: 'faqs',
                      label: ' 常见问题',
                      children: (
                        <Collapse
                          accordion
                          items={tutorial.faqs.map((faq, index) => ({
                            key: index,
                            label: (
                              <Space>
                                <QuestionCircleOutlined style={{ color: 'var(--color-warning)' }} />
                                <strong>{faq.question}</strong>
                              </Space>
                            ),
                            children: <Alert title={faq.answer} type="info" showIcon />
                          }))}
                        />
                      ),
                    }] : []),
                    ...(tutorial.videoUrl ? [{
                      key: 'video',
                      label: ' 视频教程',
                      children: <VideoPlayerBlock url={tutorial.videoUrl} />,
                    }] : []),
                  ]}
                />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {/* 底部帮助 */}
      <Card style={{ marginTop: 24 }}>
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          <Title level={4}>
            <QuestionCircleOutlined /> 需要更多帮助？
          </Title>
          <Paragraph>
            • <strong>在线客服：</strong>点击右下角客服图标，实时咨询技术支持
            <br />
            • <strong>用户手册：</strong>下载完整PDF用户手册，离线查阅
            <br />
            • <strong>培训预约：</strong>联系管理员预约一对一系统培训
            <br />• <strong>反馈建议：</strong>
            发现问题或有改进建议？点击「意见反馈」告诉我们
          </Paragraph>
          <Space>
            <Button type="primary">
              下载用户手册
            </Button>
            <Button>意见反馈</Button>
          </Space>
        </Space>
      </Card>
      </div>
    </>
  );
};

export default SystemTutorial;
