import { useState, useEffect } from 'react';
import { Form } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import api from '@/utils/api';
import {
  wagePaymentApi,
  type PaymentAccount,
} from '@/services/finance/wagePaymentApi';
import type { SmartErrorInfo } from '@/smart/core/types';

interface UseAccountModalOptions {
  msg: { success: (text: string) => void; error: (text: string) => void };
  reportSmartError: (title: string, reason?: string, code?: string) => void;
  showSmartErrorNotice: boolean;
  setSmartError: (v: SmartErrorInfo | null) => void;
}

export function useAccountModal({ msg, reportSmartError, showSmartErrorNotice, setSmartError }: UseAccountModalOptions) {
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountForm] = Form.useForm();
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountOwnerType, setAccountOwnerType] = useState('');
  const [accountOwnerId, setAccountOwnerId] = useState('');
  const [accountOwnerName, setAccountOwnerName] = useState('');
  const [accountSaving, setAccountSaving] = useState(false);
  const [editingAccount, setEditingAccount] = useState<PaymentAccount | null>(null);
  const [accountDetailOpen, setAccountDetailOpen] = useState(false);
  const [qrFileList, setQrFileList] = useState<UploadFile[]>([]);

  useEffect(() => {
    if (!accountDetailOpen) {
      if (accountModalOpen) {
        accountForm.resetFields();
      }
      setQrFileList([]);
      return;
    }

    if (!editingAccount) {
      return;
    }

    accountForm.setFieldsValue({
      accountType: editingAccount.accountType,
      accountName: editingAccount.accountName,
      accountNo: editingAccount.accountNo,
      bankName: editingAccount.bankName,
      bankBranch: editingAccount.bankBranch,
      qrCodeUrl: editingAccount.qrCodeUrl,
      isDefault: editingAccount.isDefault === 1,
    });
    if (editingAccount.qrCodeUrl) {
      setQrFileList([{ uid: '-1', name: '二维码', status: 'done', url: editingAccount.qrCodeUrl }]);
    } else {
      setQrFileList([]);
    }
  }, [accountDetailOpen, accountForm, editingAccount]);

  const loadAccounts = async (ownerType: string, ownerId: string) => {
    setAccountsLoading(true);
    try {
      const res: any = await wagePaymentApi.listAccounts(ownerType, ownerId);
      setAccounts(res?.data ?? res ?? []);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '网络异常或服务不可用，请稍后重试';
      reportSmartError('收款账户加载失败', errMsg, 'WAGE_ACCOUNT_LOAD_FAILED');
      msg.error(`加载收款账户失败: ${err instanceof Error ? err.message : '请检查网络连接'}`);
    } finally {
      setAccountsLoading(false);
    }
  };

  const openAccountModal = (ownerType: string, ownerId: string, ownerName: string) => {
    setAccountOwnerType(ownerType);
    setAccountOwnerId(ownerId);
    setAccountOwnerName(ownerName);
    setEditingAccount(null);
    setAccountDetailOpen(false);
    accountForm.resetFields();
    setQrFileList([]);
    setAccountModalOpen(true);
    loadAccounts(ownerType, ownerId);
  };

  const handleSaveAccount = async () => {
    try {
      const values = await accountForm.validateFields();
      setAccountSaving(true);
      const payload: PaymentAccount = {
        ...editingAccount,
        ownerType: accountOwnerType as 'WORKER' | 'FACTORY',
        ownerId: accountOwnerId,
        ownerName: accountOwnerName,
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
      setAccountDetailOpen(false);
      setEditingAccount(null);
      accountForm.resetFields();
      setQrFileList([]);
      if (showSmartErrorNotice) setSmartError(null);
      loadAccounts(accountOwnerType, accountOwnerId);
    } catch (err: unknown) {
      reportSmartError('收款账户保存失败', err instanceof Error ? err.message : '请检查输入后重试', 'WAGE_ACCOUNT_SAVE_FAILED');
      if (err instanceof Error) msg.error(err.message);
    } finally {
      setAccountSaving(false);
    }
  };

  const handleDeleteAccount = async (id: string) => {
    try {
      await wagePaymentApi.removeAccount(id);
      msg.success('已删除');
      loadAccounts(accountOwnerType, accountOwnerId);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '网络异常或服务不可用，请稍后重试';
      reportSmartError('收款账户删除失败', errMsg, 'WAGE_ACCOUNT_DELETE_FAILED');
      msg.error(`删除账户失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const handleEditAccount = (account: PaymentAccount) => {
    setEditingAccount(account);
    setAccountDetailOpen(true);
  };

  const uploadQrImage = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res: any = await api.post('/common/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = res?.data ?? res;
      if (url) {
        accountForm.setFieldsValue({ qrCodeUrl: url });
        setQrFileList([{ uid: '-1', name: file.name, status: 'done', url }]);
        msg.success('上传成功');
      }
    } catch (err: unknown) {
      reportSmartError('账户二维码上传失败', err instanceof Error ? err.message : '请检查文件格式后重试', 'WAGE_ACCOUNT_QR_UPLOAD_FAILED');
      msg.error(`上传二维码失败: ${err instanceof Error ? err.message : '请检查文件格式'}`);
    }
  };

  return {
    accountModalOpen, setAccountModalOpen,
    accountForm,
    accounts,
    accountsLoading,
    accountOwnerType,
    accountOwnerId,
    accountOwnerName,
    accountSaving,
    editingAccount, setEditingAccount,
    accountDetailOpen, setAccountDetailOpen,
    qrFileList, setQrFileList,
    openAccountModal,
    handleSaveAccount,
    handleDeleteAccount,
    handleEditAccount,
    uploadQrImage,
  };
}
