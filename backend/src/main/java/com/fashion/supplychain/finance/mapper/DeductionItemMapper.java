package com.fashion.supplychain.finance.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.finance.entity.DeductionItem;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface DeductionItemMapper extends BaseMapper<DeductionItem> {

    List<DeductionItem> selectByReconciliationId(@Param("reconciliationId") String reconciliationId, @Param("tenantId") Long tenantId);
}
