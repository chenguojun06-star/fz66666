import React, { useMemo } from 'react';
import { Alert, Button, Card, Space } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import DictFormModal from './components/DictFormModal';
import DictTypeSelector from './components/DictTypeSelector';
import { getDictColumns } from './columns';
import { useDictManageData } from './useDictManageData';

const DictManage: React.FC = () => {
  const {
    loading,
    dataSource,
    dictPageSize,
    setDictPageSize,
    smartError,
    showSmartErrorNotice,
    showDictAutocollect,
    dictModal,
    form,
    selectedType,
    setSelectedType,
    fetchData,
    handleAdd,
    handleEdit,
    handleDelete,
    handleSave,
    handleImportPreset,
  } = useDictManageData();

  const columns = useMemo(
    () => getDictColumns({ handleEdit, handleDelete }),
    [handleEdit, handleDelete]
  );

  return (
    <>
      <Card
        title="字典管理"
        extra={
          <Space>
            <Button type="primary" onClick={handleAdd}>
              新建字典项
            </Button>
            <Button onClick={handleImportPreset}>
              导入预设数据
            </Button>
          </Space>
        }
      >
        {showSmartErrorNotice && smartError ? (
          <Card style={{ marginBottom: 12 }}>
            <SmartErrorNotice error={smartError} onFix={() => { void fetchData(selectedType); }} />
          </Card>
        ) : null}
        {showDictAutocollect && (
          <Alert
            style={{ marginBottom: 12 }}
            type="info"
            showIcon
            icon={<span></span>}
            title="词典自动收录已开启"
            description="AI 正在监听业务中新出现的词汇，自动放入待审池。请结合此页定期审核并拣优字典条目，确保业务词汇准确。如需关闭，可在“智能功能设置”中关闭。"
            banner={false}
          />
        )}
        <DictTypeSelector selectedType={selectedType} onSelect={setSelectedType} />

        <ResizableTable
          storageKey="dict-manage"
          columns={columns}
          dataSource={dataSource}
          loading={loading}
          rowKey={(record) => record.id || `${record.dictType}-${record.dictCode}`}
          emptyDescription="暂无数据"
          pagination={{
            pageSize: dictPageSize,
            onChange: (_, ps) => setDictPageSize(ps),
            showTotal: (total) => `共 ${total} 条`,
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
        />

        <DictFormModal
          visible={dictModal.visible}
          data={dictModal.data}
          form={form}
          onCancel={dictModal.close}
          onOk={handleSave}
        />
      </Card>
    </>
  );
};

export default DictManage;
