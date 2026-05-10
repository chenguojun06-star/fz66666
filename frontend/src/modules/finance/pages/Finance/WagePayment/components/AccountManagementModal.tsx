import React from 'react';
import { Button, Card, Form, Input, Select, Space, Tag, Upload } from 'antd';
import type { FormInstance, UploadFile } from 'antd';
import { PlusOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
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
  onUploadQrImage: (file: File) => void;
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
        <span style={{ color: '#999' }}>
          {ownerType === 'WORKER' ? '员工' : '工厂'}：{ownerName}
        </span>
        <Button
          type="primary"
          size="small"
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
          size="small"
          style={{ marginBottom: 8, border: acc.isDefault === 1 ? '2px solid var(--primary-color, #1677ff)' : undefined }}
          extra={
            <Space>
              <Button type="link" size="small" onClick={() => onEditAccount(acc)}>编辑</Button>
              <Button type="link" size="small" danger onClick={() => acc.id != null && onDeleteAccount(String(acc.id))}>
                <DeleteOutlined />
              </Button>
            </Space>
          }
        >
          <Space>
            <span style={{ fontSize: 20 }}>{accountTypeIconMap[acc.accountType]}</span>
            <div>
              <div style={{ fontWeight: 500 }}>
                {ACCOUNT_TYPE_OPTIONS.find(o => o.value === acc.accountType)?.label}
                {acc.isDefault === 1 && <Tag color="blue" style={{ marginLeft: 8 }}>默认</Tag>}
              </div>
              {acc.accountType === 'BANK' ? (
                <span style={{ color: '#666' }}>{acc.bankName} {acc.accountNo}</span>
              ) : (
                <span style={{ color: '#666' }}>{acc.accountName || '已上传二维码'}</span>
              )}
            </div>
          </Space>
        </Card>
      ))}
      {!accountsLoading && accounts.length === 0 && (
        <div style={{ textAlign: 'center', color: '#999', padding: 32 }}>暂无收款账户，请点击"添加账户"</div>
      )}

      <Card title={editingAccount ? '编辑账户' : '添加账户'} size="small" style={{ marginTop: 16, display: accountDetailOpen ? undefined : 'none' }}>
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
                    <Upload
                      accept="image/*"
                      listType="picture-card"
                      maxCount={1}
                      fileList={qrFileList}
                      onRemove={() => { accountForm.setFieldsValue({ qrCodeUrl: undefined }); setQrFileList([]); return true; }}
                      beforeUpload={(file) => { void onUploadQrImage(file as File); return Upload.LIST_IGNORE; }}
                    >
                      {qrFileList.length === 0 && (
                        <div><UploadOutlined /><div style={{ marginTop: 8 }}>上传二维码</div></div>
                      )}
                    </Upload>
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
