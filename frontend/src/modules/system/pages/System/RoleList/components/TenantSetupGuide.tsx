import React, { useState, useEffect } from 'react';
import { Modal, Steps, Button, Card, Tag, Space, Typography, Alert, message } from 'antd';
import { CheckCircleOutlined, RocketOutlined, TeamOutlined } from '@ant-design/icons';
import { roleTemplateApi, RoleTemplate } from '@/services/system/roleTemplateApi';

const { Text } = Typography;

interface TenantSetupGuideProps {
  visible: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

const TenantSetupGuide: React.FC<TenantSetupGuideProps> = ({ visible, onComplete, onSkip }) => {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<RoleTemplate[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (visible) {
      checkAndLoadTemplates();
    }
  }, [visible]);

  const checkAndLoadTemplates = async () => {
    setChecking(true);
    try {
      const res = await roleTemplateApi.checkNewTenant();
      if (res.code === 200 && res.data?.isNewTenant) {
        setTemplates(res.data.recommendedTemplates || []);
      }
    } catch (e) {
      console.error('检查新租户失败', e);
    } finally {
      setChecking(false);
    }
  };

  const handleQuickSetup = async () => {
    if (selectedIds.length === 0) {
      message.warning('请选择至少一个模板');
      return;
    }

    setLoading(true);
    try {
      const res = await roleTemplateApi.quickSetup(selectedIds);

      if (res.code === 200) {
        setStep(1);
      } else {
        message.error(res.message || '创建失败');
      }
    } catch (e) {
      message.error('创建失败');
    } finally {
      setLoading(false);
    }
  };

  const toggleTemplate = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  return (
    <Modal
      title={
        <Space>
          <RocketOutlined style={{ color: 'var(--color-info)' }} />
          <span>新租户快速初始化</span>
        </Space>
      }
      open={visible}
      onCancel={onSkip}
      footer={null}
      width={600}
      maskClosable={false}
    >
      <Steps
        current={step}
        style={{ marginBottom: 24 }}
        items={[
          { title: '选择角色模板' },
          { title: '完成' },
        ]}
      />

      {step === 0 && (
        <div>
          <Alert
            type="info"
            showIcon
            icon={<TeamOutlined />}
            style={{ marginBottom: 16 }}
            message="选择您需要的角色模板，系统将自动为您创建对应的角色和权限"
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 }}>
            {templates.map((tpl) => (
              <Card
                key={tpl.id}
                hoverable
                onClick={() => toggleTemplate(tpl.id)}
                style={{
                  borderColor: selectedIds.includes(tpl.id) ? 'var(--color-info)' : 'var(--color-border-light)',
                  background: selectedIds.includes(tpl.id) ? '#e6f7ff' : 'var(--color-bg-base)',
                }}
                bodyStyle={{ padding: 12 }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <CheckCircleOutlined
                    style={{
                      color: selectedIds.includes(tpl.id) ? 'var(--color-info)' : 'var(--color-border-antd)',
                      fontSize: 16,
                      marginTop: 2,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{tpl.templateName}</div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {tpl.templateDesc || '暂无描述'}
                    </Text>
                    <div style={{ marginTop: 4 }}>
                      <Tag color="blue" style={{ fontSize: 11 }}>
                        {tpl.category}
                      </Tag>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div style={{ textAlign: 'right' }}>
            <Button onClick={onSkip} style={{ marginRight: 8 }}>
              跳过，稍后配置
            </Button>
            <Button
              type="primary"
              onClick={handleQuickSetup}
              loading={loading}
              disabled={selectedIds.length === 0}
            >
              一键创建（{selectedIds.length}个）
            </Button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <CheckCircleOutlined style={{ fontSize: 48, color: 'var(--color-success)', marginBottom: 16 }} />
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>初始化完成！</div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            已为您创建 {selectedIds.length} 个基础角色，现在可以开始使用了
          </Text>
          <Button type="primary" onClick={onComplete}>
            开始使用
          </Button>
        </div>
      )}
    </Modal>
  );
};

export default TenantSetupGuide;
