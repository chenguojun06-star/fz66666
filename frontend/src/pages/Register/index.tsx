import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Form, Input, Button, Card, Typography, App, Segmented, Alert, AutoComplete } from 'antd';
import { UserOutlined, LockOutlined, PhoneOutlined, ShopOutlined, IdcardOutlined, BankOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import tenantService from '../../services/tenantService';
import api from '../../utils/api';
import '../Login/styles.css';

const { Title } = Typography;

type RegisterMode = '工厂员工注册' | '工厂入驻申请';

const Register: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const { message } = App.useApp();

  // 从 URL 参数获取 tenantCode（扫码注册链接带入）
  const urlTenantCode = searchParams.get('tenantCode') || '';
  const urlTenantName = searchParams.get('tenantName') || '';

  const [mode, setMode] = useState<RegisterMode>('工厂员工注册');
  const isApplyMode = mode === '工厂入驻申请';
  // 工厂列表（用于员工注册时搜索）
  const [tenantOptions, setTenantOptions] = useState<{ value: string; label: string; tenantCode: string }[]>([]);
  const [filteredOptions, setFilteredOptions] = useState<{ value: string; label: string }[]>([]);

  const year = useMemo(() => new Date().getFullYear(), []);

  // URL 带 tenantCode 时自动填入
  useEffect(() => {
    if (urlTenantCode) {
      form.setFieldsValue({ tenantCode: urlTenantCode });
    }
  }, [urlTenantCode, form]);

  // 加载工厂列表（公开接口，无需登录）
  useEffect(() => {
    if (isApplyMode || urlTenantCode) return;
    api.get('/system/tenant/public-list').then((res: any) => {
      const list: any[] = res?.data || res || [];
      setTenantOptions(
        list
          .filter((t: any) => t.tenantCode)
          .map((t: any) => ({ value: t.tenantName, label: t.tenantName, tenantCode: t.tenantCode }))
      );
    }).catch(() => {});
  }, [isApplyMode, urlTenantCode]);

  // 搜索工厂名
  const handleTenantSearch = useCallback((keyword: string) => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) {
      setFilteredOptions(tenantOptions.map(o => ({ value: o.value, label: o.label })));
      return;
    }
    setFilteredOptions(
      tenantOptions
        .filter(o => o.label.toLowerCase().includes(kw))
        .map(o => ({ value: o.value, label: o.label }))
    );
  }, [tenantOptions]);

  // 选中工厂名后自动回填租户码
  const handleTenantSelect = useCallback((tenantName: string) => {
    const found = tenantOptions.find(o => o.value === tenantName);
    if (found) {
      form.setFieldsValue({ tenantCode: found.tenantCode });
    }
  }, [tenantOptions, form]);

  // 工厂员工注册
  const handleFactoryRegister = async (values: any) => {
    const res: any = await tenantService.workerRegister({
      username: values.username,
      password: values.password,
      name: values.name,
      phone: values.phone,
      tenantCode: values.tenantCode,
    });
    const data = res?.data || res;
    if (data?.status === 'PENDING' || res?.code === 200) {
      message.success(data?.message || '注册申请已提交，请等待工厂管理员审批');
      setTimeout(() => navigate('/login'), 2000);
    } else {
      message.error(data?.message || '注册失败');
    }
  };

  // 工厂入驻申请
  const handleApplyTenant = async (values: any) => {
    const res: any = await tenantService.applyForTenant({
      tenantName: values.tenantName,
      contactName: values.contactName,
      contactPhone: values.contactPhone,
      applyUsername: values.username,
      applyPassword: values.password,
    });
    if (res?.code === 200 || res?.data) {
      message.success('入驻申请已提交，请等待平台审核，审核通过后可登录使用');
      setTimeout(() => navigate('/login'), 2500);
    } else {
      message.error(res?.message || '申请失败');
    }
  };

  const handleSubmit = async (values: any) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (isApplyMode) {
        await handleApplyTenant(values);
      } else {
        await handleFactoryRegister(values);
      }
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || '操作失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg" aria-hidden="true" />
      <div className="login-constellation" aria-hidden="true" />
      <Card className="login-card" variant="borderless">
        <div className="login-header">
          <Title level={2} className="login-title">
            云裳智链
          </Title>
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>
            {isApplyMode ? '工厂入驻申请' : '工厂员工注册'}
          </p>
        </div>

        {/* 注册模式切换 */}
        {!urlTenantCode && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <Segmented
              options={['工厂员工注册', '工厂入驻申请']}
              value={mode}
              onChange={(v) => { setMode(v as RegisterMode); form.resetFields(); }}
              style={{ background: 'rgba(255,255,255,0.12)' }}
            />
          </div>
        )}

        {/* 扫码注册提示 */}
        {urlTenantCode && (
          <Alert
            message={`正在注册到工厂：${urlTenantName || urlTenantCode}`}
            type="info"
            showIcon
            style={{ marginBottom: 16, borderRadius: 8 }}
          />
        )}

        <Form
          form={form}
          name="register"
          onFinish={handleSubmit}
          onFinishFailed={({ errorFields }) => {
            const first = errorFields?.[0]?.errors?.[0];
            if (first) message.error(first);
          }}
          className="login-form"
          layout="vertical"
        >
          {/* 入驻申请字段（始终渲染，hidden 控制显隐，彻底避免 preserve 时序问题） */}
          <Form.Item
            name="tenantName"
            rules={isApplyMode ? [{ required: true, message: '请输入工厂名称' }] : []}
            label="工厂名称"
            hidden={!isApplyMode}
          >
            <Input
              prefix={<BankOutlined className="site-form-item-icon" />}
              placeholder="请输入工厂 / 公司名称"
              size="large"
              allowClear
              disabled={submitting}
            />
          </Form.Item>
          <Form.Item
            name="contactName"
            rules={isApplyMode ? [{ required: true, message: '请输入联系人姓名' }] : []}
            label="联系人"
            hidden={!isApplyMode}
          >
            <Input
              prefix={<IdcardOutlined className="site-form-item-icon" />}
              placeholder="请输入联系人姓名"
              size="large"
              allowClear
              disabled={submitting}
            />
          </Form.Item>
          <Form.Item
            name="contactPhone"
            rules={isApplyMode
              ? [{ required: true, message: '请输入联系电话' }, { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' }]
              : []
            }
            label="联系电话"
            hidden={!isApplyMode}
          >
            <Input
              prefix={<PhoneOutlined className="site-form-item-icon" />}
              placeholder="请输入手机号"
              size="large"
              allowClear
              disabled={submitting}
            />
          </Form.Item>
          {isApplyMode && (
            <Alert
              message="以下账号信息用于审批通过后登录系统"
              type="info"
              showIcon
              style={{ marginBottom: 16, borderRadius: 8 }}
            />
          )}

          {/* 工厂搜索（员工注册且非URL自动填入时显示，纯UI无表单绑定） */}
          {!isApplyMode && !urlTenantCode && (
            <Form.Item
              label="所属工厂"
              required
              style={{ marginBottom: 8 }}
            >
              <AutoComplete
                options={filteredOptions.length ? filteredOptions : tenantOptions.map(o => ({ value: o.value, label: o.label }))}
                onSearch={handleTenantSearch}
                onSelect={handleTenantSelect}
                placeholder="输入工厂名称搜索"
                size="large"
                disabled={submitting}
                allowClear
                filterOption={false}
                style={{ width: '100%' }}
              />
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
                选择工厂后工厂编码自动填入
              </div>
            </Form.Item>
          )}
          {/* 工厂编码（始终渲染，入驻模式或URL扫码时隐藏） */}
          <Form.Item
            name="tenantCode"
            rules={!isApplyMode ? [{ required: true, message: '请输入或选择工厂编码' }] : []}
            label="工厂编码"
            hidden={isApplyMode || !!urlTenantCode}
          >
            <Input
              prefix={<ShopOutlined className="site-form-item-icon" />}
              placeholder="选择工厂后自动填入，或手动输入编码"
              size="large"
              allowClear
              disabled={submitting}
            />
          </Form.Item>

          <Form.Item
            name="username"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名至少3个字符' },
              { max: 20, message: '用户名最多20个字符' },
              { pattern: /^[a-zA-Z0-9_]+$/, message: '用户名只能包含字母、数字和下划线' },
            ]}
            label="用户名"
          >
            <Input
              prefix={<UserOutlined className="site-form-item-icon" />}
              placeholder="请输入用户名"
              size="large"
              autoFocus
              allowClear
              disabled={submitting}
              autoComplete="username"
            />
          </Form.Item>

          {/* 员工注册需要填真实姓名（用 hidden 而非条件渲染，避免 Ant Design preserve 规则残留） */}
          <Form.Item
            name="name"
            rules={!isApplyMode ? [{ required: true, message: '请输入真实姓名' }] : []}
            label="真实姓名"
            hidden={isApplyMode}
          >
            <Input
              prefix={<IdcardOutlined className="site-form-item-icon" />}
              placeholder="请输入真实姓名"
              size="large"
              allowClear
              disabled={submitting}
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少6个字符' },
            ]}
            label="密码"
          >
            <Input.Password
              prefix={<LockOutlined className="site-form-item-icon" />}
              placeholder="请输入密码"
              size="large"
              disabled={submitting}
              autoComplete="new-password"
            />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            dependencies={['password']}
            rules={[
              { required: true, message: '请确认密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) return Promise.resolve();
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
            label="确认密码"
          >
            <Input.Password
              prefix={<LockOutlined className="site-form-item-icon" />}
              placeholder="请再次输入密码"
              size="large"
              disabled={submitting}
              autoComplete="new-password"
            />
          </Form.Item>
          <Form.Item
            name="phone"
            rules={!isApplyMode
              ? [{ required: true, message: '请输入手机号' }, { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' }]
              : []
            }
            label="手机号"
            hidden={isApplyMode}
          >
            <Input
              prefix={<PhoneOutlined className="site-form-item-icon" />}
              placeholder="请输入手机号"
              size="large"
              allowClear
              disabled={submitting}
              autoComplete="tel"
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              className="login-button"
              size="large"
              loading={submitting}
            >
              {isApplyMode ? '提交入驻申请' : '提交注册申请'}
            </Button>
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="link"
              onClick={() => navigate('/login')}
              style={{ width: '100%', padding: 0 }}
              disabled={submitting}
            >
              已有账号？返回登录
            </Button>
          </Form.Item>
        </Form>
        <div className="login-footer">© {year} 云裳智链</div>
      </Card>
    </div>
  );
};

export default Register;
