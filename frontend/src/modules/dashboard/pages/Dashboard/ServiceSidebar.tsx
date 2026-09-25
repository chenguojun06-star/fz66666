import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Input, Modal, Radio, Select, Tooltip } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import {
  BookOutlined,
  NotificationOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { paths } from '@/routeConfig';
import { useLayoutAuth } from '@/components/Layout/useLayoutAuth';
import { useUser } from '@/utils/AuthContext';
import feedbackService from '@/services/feedbackService';
import { announcementApi, PlatformAnnouncement } from '@/services/system/announcementApi';
import { HOME_CHANGELOG } from './homeChangelog';

/**
 * D-527 首页右栏服务栏（对齐参考稿「产品更新 → 意见反馈 → 新手入门」一列服务）。
 * 反馈走系统现成的 UserFeedback 链路（/system/feedback/submit，个人中心看进展，
 * 客户管理-反馈Tab 管理端查看）；不放假客服电话/假二维码。
 */

const FEEDBACK_CATEGORY_OPTIONS = [
  { value: 'SUGGESTION', label: '意见建议' },
  { value: 'BUG', label: '问题缺陷' },
  { value: 'QUESTION', label: '使用提问' },
  { value: 'OTHER', label: '其他' },
];

/** 公告类型文案（与后端 type: info/warning/important 对应） */
const ANNOUNCEMENT_TYPE_TEXT: Record<string, string> = {
  info: '通知',
  warning: '提醒',
  important: '重要',
};

const ServiceSidebar: React.FC = () => {
  const { message } = App.useApp();
  const { user } = useUser();
  const { hasPermissionForPath, isFactoryAccount, factoryVisiblePaths, isTenantModuleEnabled } = useLayoutAuth();

  const [category, setCategory] = useState<string>('SUGGESTION');
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);

  /*
   * D-513 平台更新通知（常驻小模块）
   * 原「产品更新」是 homeChangelog.ts 的纯前端静态配置，需要人工加条目且容易忘记同步；
   * 现接系统公告链路（t_platform_announcement）：
   *   - 展示：未读公告优先，无公告时回退到静态产品更新列表（保证不空）
   *   - 发布：管理员可在卡片右上角直接发布，发布后全系统顶栏 AnnouncementBanner 同步可见
   * 说明：顶栏常驻通知栏（AnnouncementBanner）早已存在，之前不显示是因为
   *       公告表为空 + 创建接口权限写错（hasRole('ADMIN') 与本项目 SUPER_ADMIN/TENANT_OWNER
   *       角色体系不匹配）导致没人能发。后端权限已一并修正。
   */
  const [announcements, setAnnouncements] = useState<PlatformAnnouncement[]>([]);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [pubTitle, setPubTitle] = useState('');
  const [pubContent, setPubContent] = useState('');
  const [pubType, setPubType] = useState<'info' | 'warning' | 'important'>('info');

  /*
   * 仅平台超管（云裳智链）可发布平台通知 ——
   * 这是平台方面向所有租户发布的更新通知，租户侧只能查看，不提供发布入口。
   * （user.isSuperAdmin 由 AuthContext 依据登录返回的 superAdmin 标志得出）
   */
  const canPublish = user?.isSuperAdmin === true;

  const loadAnnouncements = useCallback(async () => {
    try {
      const res = await announcementApi.getActive();
      const data = (res as any)?.data;
      if (Array.isArray(data)) setAnnouncements(data);
    } catch { /* 拉取失败时保持静态更新列表，不影响页面 */ }
  }, []);

  useEffect(() => { void loadAnnouncements(); }, [loadAnnouncements]);

  const submitAnnouncement = async () => {
    if (!pubTitle.trim()) {
      message.warning('请填写通知标题');
      return;
    }
    setPublishing(true);
    try {
      await announcementApi.create({
        title: pubTitle.trim(),
        content: pubContent.trim() || undefined,
        type: pubType,
      });
      message.success('已发布，全系统用户都会收到这条通知');
      setPublishOpen(false);
      setPubTitle(''); setPubContent(''); setPubType('info');
      void loadAnnouncements();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '发布失败');
    } finally {
      setPublishing(false);
    }
  };

  const canGo = (path: string) => {
    if (isFactoryAccount && !factoryVisiblePaths.has(path)) return false;
    return hasPermissionForPath(path) && isTenantModuleEnabled(path);
  };

  const showTutorial = canGo(paths.tutorial);

  const submitFeedback = async () => {
    const text = content.trim();
    if (!text) {
      message.warning('请先填写反馈内容');
      return;
    }
    setSubmitting(true);
    try {
      const res: any = await feedbackService.submit({
        title: text.slice(0, 30),
        content: text,
        category,
        contact: contact.trim(),
        userName: (user as any)?.name || (user as any)?.username || '',
      } as any);
      if (res?.code === 200) {
        message.success('反馈已提交，感谢！可在「个人中心」查看进展');
        setContent('');
        setContact('');
      } else {
        message.error(res?.message || '提交失败，请稍后再试');
      }
    } catch {
      message.error('提交失败，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
    <div className="home-side-stack">
      <div className="dashboard-card">
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 className="card-title">
            <NotificationOutlined style={{ marginRight: 6 }} />
            平台通知
          </h3>
          {canPublish && (
            <Tooltip title="发布后全系统用户都会在顶部通知栏看到">
              <Button
                type="link"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => setPublishOpen(true)}
                style={{ padding: 0 }}
              >
                发布
              </Button>
            </Tooltip>
          )}
        </div>
        <div className="card-content home-changelog">
          {announcements.length > 0 ? (
            announcements.map((a) => (
              <div key={a.id} className="home-changelog-item">
                <span className="home-changelog-date">{ANNOUNCEMENT_TYPE_TEXT[a.type] || '通知'}</span>
                <span className="home-changelog-text" title={a.content || a.title}>{a.title}</span>
              </div>
            ))
          ) : (
            // 无未读公告时回退到静态产品更新，保证这一栏不空
            HOME_CHANGELOG.map((item) => (
              <div key={`${item.date}-${item.text}`} className="home-changelog-item">
                <span className="home-changelog-date">{item.date}</span>
                <span className="home-changelog-text">{item.text}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="dashboard-card">
        <div className="card-header">
          <h3 className="card-title">意见反馈</h3>
        </div>
        <div className="card-content home-feedback">
          <Select
            size="small"
            value={category}
            onChange={setCategory}
            options={FEEDBACK_CATEGORY_OPTIONS}
            style={{ width: '100%' }}
          />
          <Input.TextArea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="写下你想说的：功能不够用、哪里不顺手、想要什么新功能"
            rows={4}
            maxLength={500}
            showCount
            style={{ marginTop: 8 }}
          />
          <Input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="联系方式（选填，方便回访）"
            maxLength={100}
            style={{ marginTop: 8 }}
          />
          <Button
            type="primary"
            size="small"
            block
            loading={submitting}
            onClick={() => void submitFeedback()}
            style={{ marginTop: 8 }}
          >
            提交反馈
          </Button>
        </div>
      </div>

      {showTutorial && (
        <div className="dashboard-card">
          <div className="card-content home-side-entry">
            <span className="home-side-entry-icon"><BookOutlined /></span>
            <div className="home-side-entry-body">
              <div className="home-side-entry-title">新手入门</div>
              <div className="home-side-entry-desc">功能引导与常见操作教程</div>
            </div>
            <Button type="link" size="small" href={paths.tutorial} style={{ padding: 0 }}>
              去看看<RightOutlined style={{ fontSize: 10, marginLeft: 2 }} />
            </Button>
          </div>
        </div>
      )}

      {/*
       * D-513：原「快捷入口」卡片已删除。
       * 原因：① 与主栏「流程引导」面板功能重复（用户明确：流程引导已有这些入口）；
       *      ② 名称与实际目标页不符，点开容易困惑——
       *         「扫码录入」实为裁剪管理页、「电商订单」实为平台总览页、
       *         「库存盘点」实为商品仓储页（均已与 routeConfig 菜单名核对确认）。
       */}
    </div>

    {/* D-513 发布平台通知：发布后顶栏 AnnouncementBanner（60s 轮询）全系统可见 */}
    <Modal
      title="发布平台通知"
      open={publishOpen}
      onCancel={() => setPublishOpen(false)}
      onOk={() => void submitAnnouncement()}
      confirmLoading={publishing}
      okText="发布"
      cancelText="取消"
      destroyOnHidden
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
        <Input
          placeholder="通知标题（必填）"
          value={pubTitle}
          onChange={(e) => setPubTitle(e.target.value)}
          maxLength={60}
          showCount
        />
        <Input.TextArea
          placeholder="通知内容（选填，顶部通知栏展开后可见）"
          value={pubContent}
          onChange={(e) => setPubContent(e.target.value)}
          rows={4}
          maxLength={500}
          showCount
        />
        <div>
          <div style={{ marginBottom: 6, fontSize: 13, color: 'var(--color-text-secondary)' }}>通知类型</div>
          <Radio.Group
            value={pubType}
            onChange={(e) => setPubType(e.target.value)}
            optionType="button"
            buttonStyle="solid"
            size="small"
            options={[
              { label: '普通通知', value: 'info' },
              { label: '提醒', value: 'warning' },
              { label: '重要', value: 'important' },
            ]}
          />
        </div>
      </div>
    </Modal>
    </>
  );
};

export default ServiceSidebar;
