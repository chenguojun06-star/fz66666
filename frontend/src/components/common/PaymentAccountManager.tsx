/**
 * 收款账户管理组件（通用）
 * 可嵌入工厂管理、员工管理、付款中心等任意页面
 *
 * 用法：
 *   <PaymentAccountManager
 *     open={visible}
 *     ownerType="FACTORY"   // 'WORKER' | 'FACTORY'
 *     ownerId={factory.id}
 *     ownerName={factory.factoryName}
 *     onClose={() => setVisible(false)}
 *   />
 */
import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Form, Input, Select, Space, Tag, Upload } from 'antd';
import {
  CreditCardOutlined,
  DeleteOutlined,
  PlusOutlined,
  UploadOutlined,
  WechatOutlined,
} from '@ant-design/icons';
import { AlipayCircleOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import { wagePaymentApi, ACCOUNT_TYPE_OPTIONS } from '@/services/finance/wagePaymentApi';
import type { PaymentAccount } from '@/services/finance/wagePaymentApi';
import api from '@/utils/api';

// ---------- 图标映射 ----------
const accountTypeIconMap: Record<string, React.ReactNode> = {
  BANK: <CreditCardOutlined />,
  WECHAT: <WechatOutlined style={{ color: '#07C160' }} />,
  ALIPAY: <AlipayCircleOutlined style={{ color: '#1677FF' }} />,
};

// ---------- Props ----------
interface PaymentAccountManagerProps {
  /** 弹窗是否打开 */
  open: boolean;
  /** 所有者类型 */
  ownerType: 'WORKER' | 'FACTORY';
  /** 所有者 ID */
  ownerId: string;
  /** 所有者名称（显示用） */
  ownerName: string;
  /** 关闭回调 */
  onClose: () => void;
}

const PaymentAccountManager: React.FC<PaymentAccountManagerProps> = ({
  open,
  ownerType,
  ownerId,
  ownerName,
  onClose,
}) => {
  const { message: msg } = App.useApp();
  const [form] = Form.useForm();

  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<PaymentAccount | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [qrFileList, setQrFileList] = useState<any[]>([]);

  // ---------- 加载账户 ----------
  const loadAccounts = useCallback(async () => {
    if (!ownerType || !ownerId) return;
    setLoading(true);
    try {
      const res: any = await wagePaymentApi.listAccounts(ownerType, ownerId);
      setAccounts(res?.data ?? res ?? []);
    } catch (err: any) {
      msg.error(`加载收款账户失败: ${err?.message || '请检查网络连接'}`);
    } finally {
      setLoading(false);
    }
  }, [ownerType, ownerId, msg]);

  useEffect(() => {
    if (open) {
      loadAccounts();
      setFormOpen(false);
      setEditing(null);
      form.resetFields();
      setQrFileList([]);
    }
  }, [open, loadAccounts, form]);

  // ---------- 上传二维码 ----------
  const uploadQrImage = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res: any = await api.post('/common/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const url = res?.data ?? res;
      if (url) {
        form.setFieldsValue({ qrCodeUrl: url });
        setQrFileList([{ uid: '-1', name: file.name, status: 'done', url }]);
        msg.success('上传成功');
      }
    } catch (err: any) {
      msg.error(`上传二维码失败: ${err?.message || '请检查文件格式'}`);
    }
  };

  // ---------- 保存 ----------
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const payload: PaymentAccount = {
        ...editing,
        ownerType,
        ownerId,
        ownerName,
        accountType: values.accountType,
        accountName: values.accountName,
        accountNo: values.accountNo,
        bankName: values.bankName,
        bankBranch: values.bankBranch,
        qrCodeUrl: values.qrCodeUrl,
        isDefault: values.isDefault ? 1 : 0,
      };
      await wagePaymentApi.saveAccount(payload);
      msg.success('保存成功');
      setFormOpen(false);
      setEditing(null);
      form.resetFields();
      setQrFileList([]);
      loadAccounts();
    } catch (err: any) {
      if (err?.message) msg.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ---------- 删除 ----------
  const handleDelete = async (id: string) => {
    try {
      await wagePaymentApi.removeAccount(id);
      msg.success('已删除');
      loadAccounts();
    } catch (err: any) {
      msg.error(`删除账户失败: ${err?.message || '未知错误'}`);
    }
  };

  // ---------- 编辑 ----------
  const handleEdit = (account: PaymentAccount) => {
    setEditing(account);
    form.setFieldsValue({
      accountType: account.accountType,
      accountName: account.accountName,
      accountNo: account.accountNo,
      bankName: account.bankName,
      bankBranch: account.bankBranch,
      qrCodeUrl: account.qrCodeUrl,
      isDefault: account.isDefault === 1,
    });
    if (account.qrCodeUrl) {
      setQrFileList([{ uid: '-1', name: '收款码', status: 'done', url: account.qrCodeUrl }]);
    } else {
      setQrFileList([]);
    }
    setFormOpen(true);
  };

  // ---------- 打开添加 ----------
  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    setQrFileList([]);
    setFormOpen(true);
  };

  const ownerLabel = ownerType === 'WORKER' ? '员工' : '工厂/供应商';

  return (
    <ResizableModal
      open={open}
      title={`收款账户管理 — ${ownerName}`}
      onCancel={onClose}
      width="40vw"
      centered
      footer={<Button onClick={onClose}>关闭</Button>}
    >
      <div style={{ padding: '0 8px' }}>
        {/* 头部 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ color: 'var(--neutral-text-secondary, #999)' }}>
            {ownerLabel}：{ownerName}
          </span>
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAdd}>
            添加账户
          </Button>
        </div>

        {/* 账户列表 */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--neutral-text-secondary, #999)' }}>
            加载中...
          </div>
        ) : accounts.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--neutral-text-secondary, #999)', padding: 32 }}>
            暂无收款账户，请点击「添加账户」
          </div>
        ) : (
          accounts.map((acc) => (
            <Card
              key={acc.id}
              size="small"
              style={{
                marginBottom: 8,
                border: acc.isDefault === 1 ? '2px solid var(--primary-color, #1677ff)' : undefined,
              }}
              extra={
                <Space>
                  <Button type="link" size="small" onClick={() => handleEdit(acc)}>
                    编辑
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    danger
                    onClick={() => acc.id && handleDelete(acc.id)}
                  >
                    <DeleteOutlined />
                  </Button>
                </Space>
              }
            >
              <Space>
                <span style={{ fontSize: 20 }}>{accountTypeIconMap[acc.accountType]}</span>
                <div>
                  <div style={{ fontWeight: 500 }}>
                    {ACCOUNT_TYPE_OPTIONS.find((o) => o.value === acc.accountType)?.label}
                    {acc.isDefault === 1 && (
                      <Tag color="blue" style={{ marginLeft: 8 }}>
                        默认
                      </Tag>
                    )}
                  </div>
                  {acc.accountType === 'BANK' ? (
                    <span style={{ color: 'var(--neutral-text-secondary, #666)' }}>
                      {acc.bankName} {acc.accountNo}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--neutral-text-secondary, #666)' }}>
                      {acc.accountName || '已上传二维码'}
                    </span>
                  )}
                </div>
              </Space>
            </Card>
          ))
        )}

        {/* 添加 / 编辑表单 */}
        {formOpen && (
          <Card
            title={editing ? '编辑账户' : '添加账户'}
            size="small"
            style={{ marginTop: 16 }}
          >
            <Form form={form} layout="vertical" requiredMark="optional">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <Form.Item
                  label="账户类型"
                  name="accountType"
                  rules={[{ required: true, message: '请选择账户类型' }]}
                >
                  <Select options={ACCOUNT_TYPE_OPTIONS} placeholder="选择账户类型" />
                </Form.Item>

                <Form.Item label="收款户名" name="accountName">
                  <Input placeholder="收款人姓名" />
                </Form.Item>
              </div>

              <Form.Item
                noStyle
                shouldUpdate={(prev, cur) => prev.accountType !== cur.accountType}
              >
                {({ getFieldValue }) =>
                  getFieldValue('accountType') === 'BANK' ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                        <Form.Item
                          label="银行卡号"
                          name="accountNo"
                          rules={[{ required: true, message: '请输入银行卡号' }]}
                        >
                          <Input placeholder="银行卡号" />
                        </Form.Item>
                        <Form.Item
                          label="开户银行"
                          name="bankName"
                          rules={[{ required: true, message: '请输入开户银行' }]}
                        >
                          <Input placeholder="如：中国工商银行" />
                        </Form.Item>
                      </div>
                      <Form.Item label="开户支行" name="bankBranch">
                        <Input placeholder="选填" />
                      </Form.Item>
                    </>
                  ) : getFieldValue('accountType') ? (
                    <>
                      <Form.Item
                        label="收款二维码"
                        name="qrCodeUrl"
                        rules={[{ required: true, message: '请上传收款二维码' }]}
                      >
                        <Input placeholder="自动填充" disabled />
                      </Form.Item>
                      <Upload
                        accept="image/*"
                        listType="picture-card"
                        maxCount={1}
                        fileList={qrFileList}
                        onRemove={() => {
                          form.setFieldsValue({ qrCodeUrl: undefined });
                          setQrFileList([]);
                          return true;
                        }}
                        beforeUpload={(file) => {
                          void uploadQrImage(file as File);
                          return Upload.LIST_IGNORE;
                        }}
                      >
                        {qrFileList.length === 0 && (
                          <div>
                            <UploadOutlined />
                            <div style={{ marginTop: 8 }}>上传二维码</div>
                          </div>
                        )}
                      </Upload>
                    </>
                  ) : null
                }
              </Form.Item>

              <Form.Item name="isDefault" valuePropName="checked">
                <Select
                  options={[
                    { label: '是', value: true },
                    { label: '否', value: false },
                  ]}
                  placeholder="设为默认账户"
                />
              </Form.Item>

              <Space>
                <Button type="primary" loading={saving} onClick={handleSave}>
                  保存
                </Button>
                <Button
                  onClick={() => {
                    setFormOpen(false);
                    setEditing(null);
                  }}
                >
                  取消
                </Button>
              </Space>
            </Form>
          </Card>
        )}
      </div>
    </ResizableModal>
  );
};

export default PaymentAccountManager;
