import React from 'react';
import WarehousingList from './components/WarehousingList';
import { useProductWarehousing } from './hooks/useProductWarehousing';
import '../../../styles.css';

const ProductWarehousing: React.FC = () => {
  const hook = useProductWarehousing();

  return <WarehousingList hook={hook} />;
};

export default ProductWarehousing;
