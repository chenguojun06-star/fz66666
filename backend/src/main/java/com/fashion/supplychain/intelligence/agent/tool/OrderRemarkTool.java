package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.system.entity.OrderRemark;
import com.fashion.supplychain.system.service.OrderRemarkService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.*;

@Slf4j
@Component
public class OrderRemarkTool extends AbstractAgentTool {

    @Autowired
    private OrderRemarkService orderRemarkService;

    @Override
    public String getName() {
        return "tool_query_order_remarks";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("orderNo", stringProp("订单号，必填"));
        props.put("limit", intProp("返回条数，默认20，最多50"));
        return buildToolDef(
                "查询指定订单的备注历史，包含系统自动备注（采购入库/裁剪领取/质检入库）和人工手动备注。" +
                "当用户问'这单有什么问题''备注里说了什么''这单的历史记录'时调用。",
                props,
                List.of("orderNo")
        );
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String orderNo = requireString(args, "orderNo");
        int limit = Optional.ofNullable(optionalInt(args, "limit")).orElse(20);
        limit = Math.min(limit, 50);

        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        List<OrderRemark> remarks = orderRemarkService.lambdaQuery()
                .eq(OrderRemark::getTargetNo, orderNo)
                .eq(OrderRemark::getTenantId, tenantId)
                .eq(OrderRemark::getDeleteFlag, 0)
                .orderByDesc(OrderRemark::getCreateTime)
                .last("LIMIT " + limit)
                .list();

        List<Map<String, Object>> list = new ArrayList<>();
        for (OrderRemark r : remarks) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("time", r.getCreateTime() != null ? r.getCreateTime().toString() : "");
            item.put("author", r.getAuthorName());
            item.put("role", r.getAuthorRole());
            item.put("content", r.getContent());
            list.add(item);
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("orderNo", orderNo);
        data.put("total", list.size());
        data.put("remarks", list);
        return successJson("查询成功", data);
    }
}
