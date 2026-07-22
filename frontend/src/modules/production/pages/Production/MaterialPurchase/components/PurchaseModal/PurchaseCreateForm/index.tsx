import React, { useCallback, useEffect, useMemo } from 'react';
import { Form } from 'antd';
import { useMaterialDbSearch, fillFormFromMaterialDb } from './useMaterialDbSearch';
import { useStockCheck } from './useStockCheck';
import {
  StyleInfoSection,
  MaterialInfoSection,
  MaterialDetailSection,
  SupplierSection,
  QuantitySection,
  DocumentSection,
  RemarkSection,
} from './FormSections';

interface PurchaseCreateFormProps {
  form: any;
  orderColors?: string[];
}

const PurchaseCreateForm: React.FC<PurchaseCreateFormProps> = ({ form, orderColors }) => {
  const colorOptions = useMemo(() => {
    if (!orderColors || orderColors.length <= 1) return null;
    return orderColors.filter(Boolean).map(c => ({ label: c, value: c }));
  }, [orderColors]);

  const watchedUnitPrice = Form.useWatch('unitPrice', form);
  const watchedArrivedQuantity = Form.useWatch('arrivedQuantity', form);
  const watchedStyleCover = Form.useWatch('styleCover', form);
  const watchedPurchaseQuantity = Form.useWatch('purchaseQuantity', form);
  const watchedConversionRate = Form.useWatch('conversionRate', form);
  const watchedUnit = Form.useWatch('unit', form);
  const watchedMaterialCode = Form.useWatch('materialCode', form);
  const watchedColor = Form.useWatch('color', form);
  const watchedSize = Form.useWatch('size', form);

  const { materialDbOptions, materialDbLoading, searchMaterialDb } = useMaterialDbSearch();
  const stockInfo = useStockCheck(watchedMaterialCode, watchedColor, watchedSize);

  const handleMaterialDbSelect = useCallback((_value: string, option: any) => {
    fillFormFromMaterialDb(form, option?.record);
  }, [form]);

  useEffect(() => {
    const qty = Number(watchedArrivedQuantity || 0);
    const price = Number(watchedUnitPrice || 0);
    if (!Number.isFinite(qty) || !Number.isFinite(price)) return;
    const next = Number((qty * price).toFixed(2));
    form.setFieldsValue({ totalAmount: next });
  }, [form, watchedArrivedQuantity, watchedUnitPrice]);

  return (
    <>
      <Form
        form={form}
        layout="horizontal"
        labelCol={{ span: 6 }}
        wrapperCol={{ span: 18 }}
      >
        <StyleInfoSection form={form} styleCover={watchedStyleCover} />
        <MaterialInfoSection
          form={form}
          materialDbOptions={materialDbOptions}
          materialDbLoading={materialDbLoading}
          onSearchMaterialDb={searchMaterialDb}
          onMaterialDbSelect={handleMaterialDbSelect}
        />
        <MaterialDetailSection
          form={form}
          colorOptions={colorOptions}
          materialCode={watchedMaterialCode}
          stockInfo={stockInfo}
          unit={watchedUnit}
        />
        <SupplierSection form={form} />
        <QuantitySection
          form={form}
          purchaseQuantity={watchedPurchaseQuantity}
          conversionRate={watchedConversionRate}
          unit={watchedUnit}
        />
        <DocumentSection form={form} />
        <RemarkSection />
      </Form>
    </>
  );
};

export default PurchaseCreateForm;
