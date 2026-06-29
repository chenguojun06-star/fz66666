package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.PurchaseCart;
import com.fashion.supplychain.production.mapper.PurchaseCartMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

@Slf4j
@Component
public class PurchaseCartLogAppendHelper {

    @Autowired
    private PurchaseCartMapper purchaseCartMapper;

    public void appendOperation(String cartId, String action, String detail) {
        if (cartId == null) return;
        PurchaseCart cart = purchaseCartMapper.selectById(cartId);
        if (cart == null) return;
        String remark = cart.getRemark();
        String newRemark = buildRemark(remark, action, detail);
        cart.setRemark(newRemark);
        purchaseCartMapper.updateById(cart);
    }

    private String buildRemark(String existing, String action, String detail) {
        StringBuilder sb = new StringBuilder();
        if (existing != null && !existing.isEmpty()) {
            sb.append(existing).append("\n");
        }
        sb.append(LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")))
          .append(" [").append(action).append("]");
        if (detail != null) {
            sb.append("：").append(detail);
        }
        return sb.toString();
    }

    public void appendAddItem(String cartId, String materialName) {
        appendOperation(cartId, "添加物料", "物料：" + materialName);
    }

    public void appendRemoveItem(String cartId, String materialName) {
        appendOperation(cartId, "移除物料", "物料：" + materialName);
    }

    public void appendSubmit(String cartId) {
        appendOperation(cartId, "提交采购", null);
    }

    public void appendUpdateQuantity(String cartId, Integer quantity) {
        appendOperation(cartId, "修改数量", "数量：" + quantity);
    }

    public void appendClear(String cartId) {
        appendOperation(cartId, "清空采购车", null);
    }
}
