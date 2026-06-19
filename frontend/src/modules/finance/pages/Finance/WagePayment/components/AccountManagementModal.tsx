import React from 'react';
import { Button, Card, Form, Input, Popconfirm, Select, Space, Tag } from 'antd';
import type { FormInstance, UploadFile } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import { ACCOUNT_TYPE_OPTIONS, type PaymentAccount } from '@/services/finance/wagePaymentApi';
import { accountTypeIconMap } from '../hooks/usePaymentColumns';

interface AccountManagementModalProps {
  open: boolean;
  ownerName: string;
  ownerType: string;
  accounts: PaymentAccount[];
  accountsLoading: boolean;
  accountForm: FormInstance;
  accountDetailOpen: boolean;
  editingAccount: PaymentAccount | null;
  qrFileList: UploadFile[];
  accountSaving: boolean;
  onClose: () => void;
  setAccountDetailOpen: (open: boolean) => void;
  setEditingAccount: (account: PaymentAccount | null) => void;
  setQrFileList: React.Dispatch<React.SetStateAction<UploadFile[]>>;
  onEditAccount: (account: PaymentAccount) => void;
  onDeleteAccount: (id: string) => void;
  onSaveAccount: () => void;
  onUploadQrImage: (file: File) => Promise<string>;
}

const AccountManagementModal: React.FC<AccountManagementModalProps> = ({
  open, ownerName, ownerType, accounts, accountsLoading,
  accountForm, accountDetailOpen, editingAccount, qrFileList, accountSaving,
  onClose, setAccountDetailOpen, setEditingAccount, setQrFileList,
  onEditAccount, onDeleteAccount, onSaveAccount, onUploadQrImage,
}) => (
  <ResizableModal
    open={open}
    title={`收款账户管理 — ${ownerName}`}
    onCancel={onClose}
    width="40vw"
    centered
    footer={<Button onClick={onClose}>关闭</Button>}
  >
    <div style={{ padding: '0 8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ color: 'var(--color-text-tertiary)' }}>
          {ownerType === 'WORKER' ? '员工' : '工厂'}：{ownerName}
        </span>
        <Button
          type="primary"
         
          icon={<PlusOutlined />}
          onClick={() => {
            setEditingAccount(null);
            accountForm.resetFields();
            setQrFileList([]);
            setAccountDetailOpen(true);
          }}
        >
          添加账户
        </Button>
      </div>

      {accounts.map(acc => (
        <Card
          key={acc.id}
         
          style={{ marginBottom: 8, border: acc.isDefault === 1 ? '2px solid var(--primary-color, var(--color-primary))' : undefined }}
          extra={
            <Space>
              <Button type="link" onClick={() => onEditAccount(acc)}>编辑</Button>
              <Popconfirm title="确认删除该收款账户？" description="删除后不可恢复" onConfirm={() => acc.id != null && onDeleteAccount(String(acc.id))} okButtonProps={{ danger: true }} okText="删除" cancelText="取消">
                <Button type="link" danger><DeleteOutlined /></Button>
              </Popconfirm>
            </Space>
          }
        >
          <Space>
            <span style={{ fontSize: 15 }}>{accountTypeIconMap[acc.accountType]}</span>
            <div>
              <div style={{ fontWeight: 500 }}>
                {ACCOUNT_TYPE_OPTIONS.find(o => o.value === acc.accountType)?.label}
                {acc.isDefault === 1 && <Tag color="blue" style={{ marginLeft: 8 }}>默认</Tag>}
              </div>
              {acc.accountType === 'BANK' ? (
                <span style={{ color: 'var(--color-text-secondary)' }}>{acc.bankName} {acc.accountNo}</span>
              ) : (
                <span style={{ color: 'var(--color-text-secondary)' }}>{acc.accountName || '已上传二维码'}</span>
              )}
            </div>
          </Space>
        </Card>
      ))}
      {!accountsLoading && accounts.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', padding: 32 }}>暂无收款账户，请点击"添加账户"</div>
      )}

      <Card title={editingAccount ? '编辑账户' : '添加账户'} style={{ marginTop: 16, display: accountDetailOpen ? undefined : 'none' }}>
        <Form form={accountForm} layout="vertical" requiredMark="optional" onFinish={onSaveAccount}>
            <Form.Item label="账户类型" name="accountType" rules={[{ required: true, message: '请选择' }]}>
              <Select options={ACCOUNT_TYPE_OPTIONS} placeholder="选择账户类型" />
            </Form.Item>
            <Form.Item label="收款户名" name="accountName">
              <Input placeholder="收款人姓名" />
            </Form.Item>
            <Form.Item noStyle shouldUpdate={(prev, cur) => prev.accountType !== cur.accountType}>
              {({ getFieldValue }) =>
                getFieldValue('accountType') === 'BANK' ? (
                  <div>
                    <Form.Item label="银行卡号" name="accountNo" rules={[{ required: true, message: '请输入' }]}>
                      <Input placeholder="银行卡号" />
                    </Form.Item>
                    <Form.Item label="开户银行" name="bankName" rules={[{ required: true, message: '请选择' }]}>
                      <Input placeholder="如：中国工商银行" />
                    </Form.Item>
                    <Form.Item label="开户支行" name="bankBranch">
                      <Input placeholder="选填" />
                    </Form.Item>
                  </div>
                ) : getFieldValue('accountType') ? (
                  <div>
                    <Form.Item label="收款二维码" name="qrCodeUrl" rules={[{ required: true, message: '请上传二维码' }]}>
                      <Input placeholder="自动填充" disabled />
                    </Form.Item>
                    <ImageUploadBox
                      value={qrFileList.length > 0 ? (qrFileList[0] as any)?.url || null : null}
                      onChange={(url) => {
                        if (!url) {
                          accountForm.setFieldsValue({ qrCodeUrl: undefined });
                          setQrFileList([]);
                        }
                      }}
                      enableDrop
                      size={104}
                      label="二维码"
                      uploadFn={onUploadQrImage}
                    />
                  </div>
                ) : null
              }
            </Form.Item>
            <Form.Item name="isDefault">
              <Select
                options={[{ label: '是', value: true }, { label: '否', value: false }]}
                placeholder="设为默认账户"
              />
            </Form.Item>
            <Space>
              <Button type="primary" loading={accountSaving} htmlType="submit">保存</Button>
              <Button onClick={() => { setAccountDetailOpen(false); setEditingAccount(null); }}>取消</Button>
            </Space>
          </Form>
        </Card>
    </div>
  </ResizableModal>
);

export default AccountManagementModal;
