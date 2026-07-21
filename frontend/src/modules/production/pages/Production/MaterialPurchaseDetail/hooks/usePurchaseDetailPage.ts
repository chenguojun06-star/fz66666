import { Form } from 'antd';
import { useUser } from '@/utils/AuthContext';
import { usePurchaseDetailData } from './usePurchaseDetailData';
import { usePurchaseDetailEdit } from './usePurchaseDetailEdit';
import { usePurchaseDetailActions } from './usePurchaseDetailActions';

export function usePurchaseDetailPage(styleNoParam: string, orderNoParam: string) {
  // form 字段保留与原文件一致：未使用但作为返回值暴露
  const [form] = Form.useForm();
  const { user } = useUser();

  const dataState = usePurchaseDetailData(styleNoParam, orderNoParam);

  const editState = usePurchaseDetailEdit({
    styleNoParam,
    orderNoParam,
    order: dataState.order,
    purchaseList: dataState.purchaseList,
    isMultiColor: dataState.isMultiColor,
    colorList: dataState.colorList,
    loadData: dataState.loadData,
  });

  const actionsState = usePurchaseDetailActions({
    purchaseList: dataState.purchaseList,
    canProcure: dataState.canProcure,
    styleNoParam,
    loadData: dataState.loadData,
  });

  return {
    // 数据状态
    loading: dataState.loading,
    order: dataState.order,
    purchaseList: dataState.purchaseList,
    materialArrivalRate: dataState.materialArrivalRate,
    colorList: dataState.colorList,
    isMultiColor: dataState.isMultiColor,
    canProcure: dataState.canProcure,
    bomIncomplete: dataState.bomIncomplete,
    missingColors: dataState.missingColors,
    loadData: dataState.loadData,
    headerOrderNo: dataState.headerOrderNo,
    headerStyleNo: dataState.headerStyleNo,
    headerStyleName: dataState.headerStyleName,
    headerStyleId: dataState.headerStyleId,
    headerStyleCover: dataState.headerStyleCover,
    headerColor: dataState.headerColor,

    // 表单实例
    form,
    receiveForm: actionsState.receiveForm,
    returnConfirmForm: actionsState.returnConfirmForm,
    inboundForm: actionsState.inboundForm,

    // Modal 状态：领取
    receiveVisible: actionsState.receiveVisible,
    setReceiveVisible: actionsState.setReceiveVisible,
    receiveRecord: actionsState.receiveRecord,
    receiveLoading: actionsState.receiveLoading,

    // Modal 状态：入库
    inboundVisible: actionsState.inboundVisible,
    setInboundVisible: actionsState.setInboundVisible,
    inboundRecord: actionsState.inboundRecord,

    // Modal 状态：回料确认
    returnConfirmVisible: actionsState.returnConfirmVisible,
    setReturnConfirmVisible: actionsState.setReturnConfirmVisible,
    returnConfirmRecord: actionsState.returnConfirmRecord,
    returnConfirmLoading: actionsState.returnConfirmLoading,

    // Modal 状态：质量问题
    qualityIssueVisible: actionsState.qualityIssueVisible,
    setQualityIssueVisible: actionsState.setQualityIssueVisible,
    qualityIssueRecord: actionsState.qualityIssueRecord,
    setQualityIssueRecord: actionsState.setQualityIssueRecord,

    // 提交中状态
    confirmCompleteSubmitting: actionsState.confirmCompleteSubmitting,

    // 业务 actions
    openReceive: actionsState.openReceive,
    handleReceive: actionsState.handleReceive,
    openInbound: actionsState.openInbound,
    doInbound: actionsState.doInbound,
    handleReturnConfirm: actionsState.handleReturnConfirm,
    doReturnConfirm: actionsState.doReturnConfirm,
    handleCancelReceive: actionsState.handleCancelReceive,
    handleBatchReceive: actionsState.handleBatchReceive,
    handleBatchReturnConfirm: actionsState.handleBatchReturnConfirm,
    handleConfirmComplete: actionsState.handleConfirmComplete,
    handleReturnReset: actionsState.handleReturnReset,
    handleWarehousePick: actionsState.handleWarehousePick,
    handleExport: actionsState.handleExport,

    // 编辑相关
    editing: editState.editing,
    editableData: editState.editableData,
    saving: editState.saving,
    handleStartEdit: editState.handleStartEdit,
    handleCancelEdit: editState.handleCancelEdit,
    handleAddRow: editState.handleAddRow,
    handleUpdateRow: editState.handleUpdateRow,
    handleRemoveRow: editState.handleRemoveRow,
    handleSaveAll: editState.handleSaveAll,
    handleDelete: editState.handleDelete,

    // 物料选择
    materialModalOpen: editState.materialModalOpen,
    setMaterialModalOpen: editState.setMaterialModalOpen,
    materialTargetRowId: editState.materialTargetRowId,
    handleOpenMaterialModal: editState.handleOpenMaterialModal,
    handleUseMaterial: editState.handleUseMaterial,
    handleCreateMaterial: editState.handleCreateMaterial,

    // 当前用户
    user,
  };
}
