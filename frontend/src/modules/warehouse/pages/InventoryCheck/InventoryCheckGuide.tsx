import React from 'react';
import { Modal, Button, Steps, Alert } from 'antd';

interface InventoryCheckGuideProps {
  visible: boolean;
  onClose: () => void;
}

const InventoryCheckGuide: React.FC<InventoryCheckGuideProps> = ({ visible, onClose }) => {
  return (
    <Modal
      title="盘点操作流程说明"
      open={visible}
      onCancel={onClose}
      footer={<Button onClick={onClose}>知道了</Button>}
      width="40vw"
    >
      <Steps orientation="vertical" current={-1} items={[
        {
          title: '第一步：新建盘点单',
          content: '选择盘点类型（物料盘点/成品盘点/样衣盘点），可选指定款号或仓位。系统会自动加载对应库存快照作为账面数据，生成盘点明细。',
        },
        {
          title: '第二步：填写实盘数量',
          content: '在盘点单中逐项填写实际盘点数量。系统自动计算差异（实盘-账面），标记盘盈/盘亏/持平。',
        },
        {
          title: '第三步：确认盘点',
          content: '确认后系统自动调整库存：盘盈增加库存，盘亏扣减库存。确认后不可撤销，请确保实盘数据准确。',
        },
      ]} />
      <Alert
        type="warning"
        showIcon
        title="注意事项"
        description={
          <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
            <li>盘点确认后库存会自动调整，请确保实盘数据准确</li>
            <li>填写款号/物料编码可只盘点指定款号，不填则盘点全部库存</li>
            <li>物料盘点基于 t_material_stock 表，成品盘点基于 t_product_sku 表，样衣盘点基于 t_sample_stock 表</li>
            <li>未填写实盘数量的项目不会参与差异计算</li>
          </ul>
        }
        style={{ marginTop: 16 }}
      />
    </Modal>
  );
};

export default InventoryCheckGuide;
