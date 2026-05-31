package com.fashion.supplychain.production.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.production.entity.PurchaseCartItem;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface PurchaseCartItemMapper extends BaseMapper<PurchaseCartItem> {
    
    List<PurchaseCartItem> selectByCartId(@Param("cartId") String cartId);
    
    void deleteByIds(@Param("ids") List<String> ids);
}
