import { useState, useEffect, useCallback } from 'react';
import { App, Form } from 'antd';
import { inventoryCheckApi } from '../../../../services/warehouse/inventoryCheckApi';

export function useInventoryCheck() {
  const { message } = App.useApp();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<any>({});
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [currentCheck, setCurrentCheck] = useState<any>(null);
  const [currentItems, setCurrentItems] = useState<any[]>([]);
  const [fillModalVisible, setFillModalVisible] = useState(false);
  const [createForm] = Form.useForm();
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [fillSubmitting, setFillSubmitting] = useState(false);
  const [filterType, setFilterType] = useState<string | undefined>();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventoryCheckApi.list({
        page, pageSize,
        checkType: filterType,
        status: filterStatus,
      });
      const data = res.data?.data || res.data;
      if (data?.records) {
        setList(data.records);
        setTotal(data.total || 0);
      } else if (Array.isArray(data)) {
        setList(data);
        setTotal(data.length);
      }
    } catch (e: any) {
      message.error(e.message || '查询失败');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, filterType, filterStatus]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await inventoryCheckApi.summary();
      setSummary(res.data?.data || res.data || {});
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const handleCreate = async () => {
    setCreateSubmitting(true);
    try {
      const values = await createForm.validateFields();
      await inventoryCheckApi.create(values);
      message.success('盘点单创建成功');
      setCreateModalVisible(false);
      createForm.resetFields();
      fetchList();
      fetchSummary();
    } catch (e: any) {
      if (e.message) message.error(e.message);
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleViewDetail = async (record: any) => {
    try {
      const res = await inventoryCheckApi.detail(record.id);
      const data = res.data?.data || res.data;
      setCurrentCheck(data);
      setCurrentItems(data?.items || []);
      setDetailModalVisible(true);
    } catch (e: any) {
      message.error(e.message || '查询详情失败');
    }
  };

  const handleOpenFill = async (record: any) => {
    try {
      const res = await inventoryCheckApi.detail(record.id);
      const data = res.data?.data || res.data;
      setCurrentCheck(data);
      setCurrentItems((data?.items || []).map((it: any) => ({ ...it })));
      setFillModalVisible(true);
    } catch (e: any) {
      message.error(e.message || '查询盘点明细失败');
    }
  };

  const handleFillActual = async () => {
    setFillSubmitting(true);
    try {
      const items = currentItems
        .filter(it => it.actualQuantity !== undefined && it.actualQuantity !== null)
        .map(it => ({ itemId: it.id, actualQuantity: it.actualQuantity }));
      if (items.length === 0) {
        message.warning('请至少填写一项实盘数量');
        return;
      }
      await inventoryCheckApi.fillActual({ checkId: currentCheck.id, items });
      message.success('实盘数量已保存');
      setFillModalVisible(false);
      fetchList();
    } catch (e: any) {
      message.error(e.message || '保存失败');
    } finally {
      setFillSubmitting(false);
    }
  };

  const handleConfirm = async (checkId: string) => {
    try {
      await inventoryCheckApi.confirm(checkId);
      message.success('盘点已确认，库存已调整');
      fetchList();
      fetchSummary();
    } catch (e: any) {
      message.error(e.message || '确认失败');
    }
  };

  const handleCancel = async (checkId: string) => {
    try {
      await inventoryCheckApi.cancel(checkId);
      message.success('盘点已取消');
      fetchList();
      fetchSummary();
    } catch (e: any) {
      message.error(e.message || '取消失败');
    }
  };

  return {
    list,
    loading,
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    summary,
    createModalVisible,
    setCreateModalVisible,
    detailModalVisible,
    setDetailModalVisible,
    currentCheck,
    currentItems,
    setCurrentItems,
    fillModalVisible,
    setFillModalVisible,
    createForm,
    createSubmitting,
    fillSubmitting,
    filterType,
    setFilterType,
    filterStatus,
    setFilterStatus,
    fetchList,
    fetchSummary,
    handleCreate,
    handleViewDetail,
    handleOpenFill,
    handleFillActual,
    handleConfirm,
    handleCancel,
  };
}
