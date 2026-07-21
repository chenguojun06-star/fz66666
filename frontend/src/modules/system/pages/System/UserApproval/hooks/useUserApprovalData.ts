import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '@/types/system';
import api from '@/utils/api';
import tenantService from '@/services/tenantService';
import { useUser, isSupervisorOrAbove } from '@/utils/AuthContext';
import { paths } from '@/routeConfig';
import { message } from '@/utils/antdStatic';
import { readPageSize } from '@/utils/pageSizeStore';

interface UseUserApprovalDataOptions {
  isTenantOwner: boolean;
}

export function useUserApprovalData({ isTenantOwner }: UseUserApprovalDataOptions) {
  const { user } = useUser();
  const navigate = useNavigate();
  const canApproveFactory = isTenantOwner || isSupervisorOrAbove(user);

  const [activeTab, setActiveTab] = useState('tenant');
  const [loading, setLoading] = useState(false);
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(readPageSize(10));
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [approveModalVisible, setApproveModalVisible] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approveReason, setApproveReason] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [roleOptions, setRoleOptions] = useState<any[]>([]);
  const [roleLoading, setRoleLoading] = useState(false);

  const [factoryLoading, setFactoryLoading] = useState(false);
  const [factoryPending, setFactoryPending] = useState<User[]>([]);
  const [factoryTotal, setFactoryTotal] = useState(0);

  const fetchRoleOptions = useCallback(async () => {
    setRoleLoading(true);
    try {
      const response = await api.get('/system/role/list', {
        params: { page: 1, pageSize: 100 }
      });
      const result = response as any;
      if (result.code === 200) {
        setRoleOptions(Array.isArray(result.data?.records) ? result.data.records : []);
      }
    } catch (error) {
      console.error('获取角色选项失败', error);
      message.error('获取角色选项失败');
    } finally {
      setRoleLoading(false);
    }
  }, []);

  const fetchPendingUsers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/system/user/pending', {
        params: { page, pageSize }
      });
      const result = response as any;
      if (result.code === 200) {
        setPendingUsers(result.data?.records || []);
        setTotal(result.data?.total || 0);
      } else {
        message.error(result.message || '获取待审批用户失败');
      }
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '获取待审批用户失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  const [factoryApproveLoading, setFactoryApproveLoading] = useState(false);
  const [approveSubmitting, setApproveSubmitting] = useState(false);
  const [rejectSubmitting, _setRejectSubmitting] = useState(false);
  const [factoryRejectReason, setFactoryRejectReason] = useState('');
  const [factoryRejectModalVisible, setFactoryRejectModalVisible] = useState(false);
  const [factoryApproveModalVisible, setFactoryApproveModalVisible] = useState(false);
  const [factorySelectedRole, setFactorySelectedRole] = useState<string>('');

  const fetchFactoryPending = useCallback(async () => {
    setFactoryLoading(true);
    try {
      const response = await tenantService.listPendingRegistrations({ page: 1, pageSize: 100 });
      const result = response as any;
      if (result.code === 200) {
        setFactoryPending(result.data?.records || []);
        setFactoryTotal(result.data?.total || 0);
      } else {
        message.error(result.message || '获取外发工厂待审批员工失败');
      }
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '获取外发工厂待审批员工失败');
    } finally {
      setFactoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPendingUsers();
    fetchRoleOptions();
    if (isTenantOwner) {
      fetchFactoryPending();
    }
  }, [fetchPendingUsers, fetchRoleOptions, fetchFactoryPending, isTenantOwner]);

  const handleApprove = (userRow: User) => {
    setCurrentUser(userRow);
    setSelectedRoleId(userRow.roleId ? String(userRow.roleId) : '');
    setApproveReason('');
    setApproveModalVisible(true);
  };

  const confirmApprove = async () => {
    if (!currentUser) return;

    if (!selectedRoleId) {
      message.warning('请选择角色');
      return;
    }

    if (!approveReason.trim()) {
      message.warning('请输入批准原因');
      return;
    }

    setApproveSubmitting(true);
    try {
      const approveResponse = await api.post(`/system/user/${currentUser.id}/approval-action`, {
        operationRemark: approveReason
      }, { params: { action: 'approve' } });
      const approveResult = approveResponse as any;

      if (approveResult.code === 200) {
        const updateResponse = await api.put(`/system/user`, {
          id: currentUser.id,
          roleId: Number(selectedRoleId),
          status: 'active',
          approvalStatus: 'approved',
          operationRemark: approveReason
        });
        const updateResult = updateResponse as any;

        if (updateResult.code === 200) {
          message.success('用户已批准并分配角色');
          setApproveModalVisible(false);
          setCurrentUser(null);
          setSelectedRoleId('');
          setApproveReason('');
          fetchPendingUsers();
        } else {
          message.error(updateResult.message || '分配角色失败');
        }
      } else {
        message.error(approveResult.message || '批准失败');
      }
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '操作失败');
    } finally {
      setApproveSubmitting(false);
    }
  };

  const handleReject = (userRow: User) => {
    setCurrentUser(userRow);
    setRejectReason('');
    setRejectModalVisible(true);
  };

  const confirmReject = async () => {
    if (!currentUser) return;

    if (!rejectReason.trim()) {
      message.warning('请输入拒绝原因');
      return;
    }

    try {
      const response = await api.post(`/system/user/${currentUser.id}/approval-action`, {
        approvalRemark: rejectReason
      }, { params: { action: 'reject' } });
      const result = response as any;
      if (result.code === 200) {
        message.success('用户已拒绝');
        setRejectModalVisible(false);
        setCurrentUser(null);
        setRejectReason('');
        fetchPendingUsers();
      } else {
        message.error(result.message || '拒绝失败');
      }
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '拒绝失败');
    }
  };

  const handleFactoryApprove = (factoryUser: User) => {
    setCurrentUser(factoryUser);
    setFactorySelectedRole(factoryUser.roleId ? String(factoryUser.roleId) : '');
    setFactoryApproveModalVisible(true);
  };

  const confirmFactoryApprove = async () => {
    if (!currentUser) return;
    if (!factorySelectedRole) {
      message.warning('请选择角色');
      return;
    }
    setFactoryApproveLoading(true);
    try {
      const approveResponse = await tenantService.approveRegistration(Number(currentUser.id), Number(factorySelectedRole));
      const approveResult = approveResponse as any;
      if (approveResult.code === 200 || approveResult.data) {
        message.success('外发工厂员工已批准');
        setFactoryApproveModalVisible(false);
        setCurrentUser(null);
        setFactorySelectedRole('');
        fetchFactoryPending();
      } else {
        message.error(approveResult.message || '批准失败');
      }
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '操作失败');
    } finally {
      setFactoryApproveLoading(false);
    }
  };

  const handleFactoryReject = (factoryUser: User) => {
    setCurrentUser(factoryUser);
    setFactoryRejectReason('');
    setFactoryRejectModalVisible(true);
  };

  const confirmFactoryReject = async () => {
    if (!currentUser) return;
    if (!factoryRejectReason.trim()) {
      message.warning('请输入拒绝原因');
      return;
    }
    setFactoryApproveLoading(true);
    try {
      const response = await tenantService.rejectRegistration(Number(currentUser.id), factoryRejectReason.trim());
      const result = response as any;
      if (result.code === 200 || result.data) {
        message.success('已拒绝该外发工厂员工');
        setFactoryRejectModalVisible(false);
        setCurrentUser(null);
        setFactoryRejectReason('');
        fetchFactoryPending();
      } else {
        message.error(result.message || '拒绝失败');
      }
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '操作失败');
    } finally {
      setFactoryApproveLoading(false);
    }
  };

  const navigateToFactoryWorkers = (factoryId: string, factoryName: string) => {
    const params = new URLSearchParams();
    if (factoryId) params.set('factoryId', factoryId);
    if (factoryName) params.set('factoryName', factoryName);
    navigate(`${paths.factoryWorkers}?${params.toString()}`);
  };

  const handleRefresh = () => {
    fetchPendingUsers();
    if (isTenantOwner) fetchFactoryPending();
  };

  const closeApproveModal = () => {
    setApproveModalVisible(false);
    setCurrentUser(null);
    setSelectedRoleId('');
    setApproveReason('');
  };

  const closeRejectModal = () => {
    setRejectModalVisible(false);
    setCurrentUser(null);
    setRejectReason('');
  };

  const closeFactoryApproveModal = () => {
    setFactoryApproveModalVisible(false);
    setCurrentUser(null);
    setFactorySelectedRole('');
  };

  const closeFactoryRejectModal = () => {
    setFactoryRejectModalVisible(false);
    setCurrentUser(null);
    setFactoryRejectReason('');
  };

  return {
    // 派生
    canApproveFactory,
    // 列表与分页
    activeTab, setActiveTab,
    loading, pendingUsers, total, page, pageSize,
    setPage, setPageSize,
    factoryLoading, factoryPending, factoryTotal,
    // 弹窗显隐
    approveModalVisible,
    rejectModalVisible,
    factoryApproveModalVisible,
    factoryRejectModalVisible,
    // 当前操作用户与表单值
    currentUser,
    rejectReason, setRejectReason,
    approveReason, setApproveReason,
    selectedRoleId, setSelectedRoleId,
    factoryRejectReason, setFactoryRejectReason,
    factorySelectedRole, setFactorySelectedRole,
    // 角色选项
    roleOptions, roleLoading,
    // 提交中
    approveSubmitting,
    rejectSubmitting,
    factoryApproveLoading,
    // 操作
    handleApprove, confirmApprove,
    handleReject, confirmReject,
    handleFactoryApprove, confirmFactoryApprove,
    handleFactoryReject, confirmFactoryReject,
    navigateToFactoryWorkers,
    handleRefresh,
    closeApproveModal,
    closeRejectModal,
    closeFactoryApproveModal,
    closeFactoryRejectModal,
  };
}

export type UseUserApprovalDataReturn = ReturnType<typeof useUserApprovalData>;
