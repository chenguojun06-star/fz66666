import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Card, Empty, Radio, Spin, Tag, Typography } from 'antd';
import type { RadioChangeEvent } from 'antd';
import { CrownOutlined, UserOutlined, SettingOutlined, AuditOutlined, AppstoreOutlined, BuildOutlined } from '@ant-design/icons';
import api from '@/utils/api';
import './RoleTemplateSelector.css';

const { Text } = Typography;

export interface RoleTemplate {
  id: number;
  templateCode: string;
  templateName: string;
  templateDesc: string;
  category: string;
  isDefault: boolean;
  permissionsJson: string;
  permissionRange: string;
  sortOrder: number;
}

interface RoleTemplateSelectorProps {
  value?: number;
  onChange?: (templateId: number | undefined, template?: RoleTemplate) => void;
}

const CATEGORY_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  SYSTEM: { label: '系统预设', color: 'red', icon: <CrownOutlined /> },
  INDUSTRY: { label: '行业模板', color: 'blue', icon: <AppstoreOutlined /> },
  CUSTOM: { label: '自定义', color: 'green', icon: <UserOutlined /> },
};

const PERMISSION_RANGE_LABEL: Record<string, string> = {
  all: '全部数据',
  team: '团队数据',
  own: '个人数据',
};

const getPermissionCount = (permissionsJson: string): number => {
  try {
    const arr = JSON.parse(permissionsJson);
    return Array.isArray(arr) ? arr.length : 0;
  } catch {
    return 0;
  }
};

const RoleTemplateSelector: React.FC<RoleTemplateSelectorProps> = ({ value, onChange }) => {
  const [templates, setTemplates] = useState<RoleTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/role-template/list');
      const result = res as { code?: number; data?: RoleTemplate[]; message?: unknown };
      if (result.code === 200 && Array.isArray(result.data)) {
        setTemplates(result.data);
      } else {
        setError(String(result.message || '加载失败'));
      }
    } catch (e) {
      setError('网络异常');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleSelect = (e: RadioChangeEvent) => {
    const templateId = e.target.value as number | undefined;
    const selected = templateId != null ? templates.find(t => t.id === templateId) : undefined;
    onChange?.(templateId, selected);
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <Spin tip="加载模板中..." />
      </div>
    );
  }

  if (error) {
    return (
      <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />
    );
  }

  if (templates.length === 0) {
    return <Empty description="暂无可用模板" style={{ padding: '40px 0' }} />;
  }

  return (
    <div className="role-template-selector">
      <Radio.Group value={value} onChange={handleSelect} style={{ width: '100%' }}>
        <div className="template-grid">
          {templates.map(template => {
            const categoryConfig = CATEGORY_CONFIG[template.category] || CATEGORY_CONFIG.CUSTOM;
            const permCount = getPermissionCount(template.permissionsJson);
            const isSelected = value === template.id;

            return (
              <Card
                key={template.id}
                className={`template-card ${isSelected ? 'template-card-selected' : ''}`}
                hoverable
                styles={{ body: { padding: 16 } }}
              >
                <Radio value={template.id} className="template-radio">
                  <div className="template-content">
                    <div className="template-header">
                      <div className="template-title-row">
                        <Text strong style={{ fontSize: 14 }}>{template.templateName}</Text>
                        {template.isDefault && (
                          <Tag color="gold" style={{ fontSize: 10, marginLeft: 8 }}>默认</Tag>
                        )}
                      </div>
                      <Tag color={categoryConfig.color} icon={categoryConfig.icon} style={{ fontSize: 11 }}>
                        {categoryConfig.label}
                      </Tag>
                    </div>

                    <Text type="secondary" className="template-desc" style={{ fontSize: 12 }}>
                      {template.templateDesc || '暂无描述'}
                    </Text>

                    <div className="template-footer">
                      <Badge count={permCount} showZero={false} style={{ fontSize: 11 }}>
                        <Tag style={{ fontSize: 11 }}>权限</Tag>
                      </Badge>
                      <Tag style={{ fontSize: 11 }}>
                        {PERMISSION_RANGE_LABEL[template.permissionRange] || template.permissionRange}
                      </Tag>
                    </div>
                  </div>
                </Radio>
              </Card>
            );
          })}
        </div>
      </Radio.Group>
    </div>
  );
};

export default RoleTemplateSelector;
