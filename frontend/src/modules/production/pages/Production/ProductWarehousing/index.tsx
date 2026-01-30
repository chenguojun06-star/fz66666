import React from 'react';
import WarehousingList from './components/WarehousingList';
import WarehousingDetail from './components/WarehousingDetail';
import { useProductWarehousing } from './hooks/useProductWarehousing';
import './styles.css';

const ProductWarehousing: React.FC = () => {
  const hook = useProductWarehousing();
  const { isEntryPage } = hook;

  if (isEntryPage) {
    return <WarehousingDetail hook={hook} />;
  }

  return <WarehousingList hook={hook} />;
};

export default ProductWarehousing;
