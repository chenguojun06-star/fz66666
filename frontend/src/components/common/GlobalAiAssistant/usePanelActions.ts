/**
 * usePanelActions — 面板导航 / 模态框 / 动作卡片回调
 *
 * 统一管理：
 * - openTraceCenter：打开 Agent 追踪中心
 * - jumpToIntelligenceCenter：跳转智能中枢
 * - onSafeNavigate：安全路由跳转（白名单校验）
 * - handleOpenModal：模态框开关（订单创建 / 样衣借出）
 * - handleActionCardAction：动作卡片点击处理
 * - onPurchaseDocAction：采购单据自动收货/入库
 */
import { useState, useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { ActionCard, Message } from './types';

type MessageApi = ReturnType<typeof import('antd').App.useApp>['message'];

interface UsePanelActionsParams {
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  setIsTaskPanelOpen: Dispatch<SetStateAction<boolean>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  handleSend: (text?: string) => void;
  messageApi: MessageApi;
  navigate: NavigateFunction;
}

export function usePanelActions({
  setIsOpen,
  setIsTaskPanelOpen,
  setMessages,
  handleSend,
  messageApi,
  navigate,
}: UsePanelActionsParams) {
  const [sampleLoanModalVisible, setSampleLoanModalVisible] = useState(false);
  const [sampleLoanPrefill, setSampleLoanPrefill] = useState<Record<string, unknown> | undefined>();

  const openTraceCenter = useCallback((commandId?: string) => {
    const path = commandId ? `/cockpit/agent-traces?commandId=${commandId}` : '/cockpit/agent-traces';
    window.open(path, '_blank');
  }, []);

  const jumpToIntelligenceCenter = (_query: string) => {
    setIsOpen(false);
    if (window.location.pathname !== '/cockpit') {
      navigate('/cockpit');
    }
  };

  const onSafeNavigate = useCallback((path: string) => {
    const knownPrefixes = ['/production', '/finance', '/warehouse', '/intelligence', '/system', '/dashboard', '/style', '/crm', '/procurement', '/basic', '/cockpit', '/style-info', '/order-management'];
    const safePath = path && knownPrefixes.some(p => path.startsWith(p)) ? path : '/production';
    setIsOpen(false);
    setIsTaskPanelOpen(false);
    navigate(safePath);
  }, [navigate]);

  const handleOpenModal = useCallback((modalType: string, prefillData?: Record<string, unknown>) => {
    if (modalType === 'open_order_create') {
      setIsOpen(false);
      setIsTaskPanelOpen(false);
      const params = new URLSearchParams();
      params.set('autoOpenCreate', '1');
      if (prefillData?.styleNo) {
        params.set('styleNo', String(prefillData.styleNo));
      }
      navigate(`/basic/order-management?${params.toString()}`);
    } else if (modalType === 'open_sample_loan') {
      setSampleLoanPrefill(prefillData);
      setSampleLoanModalVisible(true);
    }
  }, [navigate]);

  const handleActionCardAction = useCallback((card: ActionCard, actionType: string, path?: string, orderId?: string) => {
    const action = card.actions.find(a => a.type === actionType);
    if (actionType === 'open_modal' && action?.modalType) {
      handleOpenModal(action.modalType, action.prefillData || card.prefillData);
    } else if (actionType === 'navigate' && path) {
      onSafeNavigate(path);
    } else if (actionType === 'mark_urgent' && orderId) {
      void handleSend(`把订单 ${orderId} 标记为紧急`);
    } else {
      void handleSend(`执行操作：${card.title}`);
    }
  }, [handleOpenModal, onSafeNavigate, handleSend]);

  const onPurchaseDocAction = useCallback(async (msgId: string, mode: string, card: any) => {
    try {
      await intelligenceApi.autoExecutePurchaseDoc({ docId: card.docId, confirmInbound: mode === 'inbound', warehouseLocation: mode === 'inbound' ? '默认仓' : undefined });
      setMessages(prev => prev.map(m =>
        m.id === msgId
          ? { ...m, purchaseDocCard: m.purchaseDocCard ? { ...m.purchaseDocCard, autoStatus: mode === 'arrival' ? 'arrived' : 'inbound' } : m.purchaseDocCard }
          : m
      ));
    } catch {
      messageApi.error('操作失败，请稍后重试');
    }
  }, [messageApi, setMessages]);

  return {
    sampleLoanModalVisible,
    setSampleLoanModalVisible,
    sampleLoanPrefill,
    openTraceCenter,
    jumpToIntelligenceCenter,
    onSafeNavigate,
    handleOpenModal,
    handleActionCardAction,
    onPurchaseDocAction,
  };
}
