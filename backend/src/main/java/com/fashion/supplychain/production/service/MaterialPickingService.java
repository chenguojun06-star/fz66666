package com.fashion.supplychain.production.service;
import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.production.entity.MaterialPicking;
import com.fashion.supplychain.production.entity.MaterialPickingItem;
import java.util.List;

public interface MaterialPickingService extends IService<MaterialPicking> {
    /**
     * 创建领料单
     * @param picking 领料单主表
     * @param items 领料明细
     * @return 领料单ID
     */
    String createPicking(MaterialPicking picking, List<MaterialPickingItem> items);
    
    /**
     * 获取领料单明细
     */
    List<MaterialPickingItem> getItemsByPickingId(String pickingId);
}
