package com.fashion.supplychain.common;

import com.baomidou.mybatisplus.extension.service.IService;
import java.io.Serializable;
import java.util.function.BiConsumer;
import java.util.function.Function;
import lombok.extern.slf4j.Slf4j;
import org.springframework.util.StringUtils;

/**
 * 操作日志追加 Helper 泛型基类
 *
 * <p>消除 24 个 *LogAppendHelper 子类的重复样板代码：
 * 每个子类只需声明 Service、实体名、备注字段的 getter/setter 引用，
 * 基类提供通用的 appendOperation 和常用便捷方法。
 *
 * <p>使用方式：
 * <pre>
 * &#64;Component
 * public class ProductionOrderLogAppendHelper
 *     extends AbstractOperationLogAppendHelper&#60;ProductionOrder, String&#62; {
 *
 *     &#64;Autowired
 *     private ProductionOrderService productionOrderService;
 *
 *     &#64;Override protected IService&#60;ProductionOrder&#62; getService() { return productionOrderService; }
 *     &#64;Override protected String getEntityName() { return "生产订单"; }
 *     &#64;Override protected Function&#60;ProductionOrder, String&#62; getRemarkGetter() { return ProductionOrder::getRemarks; }
 *     &#64;Override protected BiConsumer&#60;ProductionOrder, String&#62; getRemarkSetter() { return ProductionOrder::setRemarks; }
 *
 *     // 特有便捷方法...
 * }
 * </pre>
 *
 * @param <T>  实体类型
 * @param <ID> 主键类型（String / Long 等）
 */
@Slf4j
public abstract class AbstractOperationLogAppendHelper<T, ID extends Serializable> {

    protected abstract IService<T> getService();

    protected abstract String getEntityName();

    protected abstract Function<T, String> getRemarkGetter();

    protected abstract BiConsumer<T, String> getRemarkSetter();

    protected void appendOperation(ID id, String action, String detail) {
        if (id == null) {
            return;
        }
        OperationLogAppendUtil.appendOperation(
                id,
                getService(),
                getRemarkGetter(),
                getRemarkSetter(),
                action,
                detail,
                getEntityName()
        );
    }

    protected void appendOperation(ID id, String action, String detail, String remarkFieldName) {
        String enrichedDetail = detail;
        if (StringUtils.hasText(detail) && StringUtils.hasText(remarkFieldName)) {
            enrichedDetail = remarkFieldName + "：" + detail;
        }
        appendOperation(id, action, enrichedDetail);
    }

    public void appendCreate(ID id, String detail) {
        appendOperation(id, "创建", detail);
    }

    public void appendCreate(ID id) {
        appendCreate(id, null);
    }

    public void appendUpdate(ID id, String detail) {
        appendOperation(id, "修改", detail);
    }

    public void appendUpdate(ID id) {
        appendUpdate(id, null);
    }

    public void appendDelete(ID id) {
        appendOperation(id, "删除", null);
    }

    public void appendClose(ID id, String reason) {
        appendOperation(id, "关闭", StringUtils.hasText(reason) ? "原因：" + reason : null);
    }

    public void appendComplete(ID id) {
        appendOperation(id, "完成", null);
    }

    public void appendCancel(ID id, String reason) {
        appendOperation(id, "取消", StringUtils.hasText(reason) ? "原因：" + reason : null);
    }

    public void appendSubmit(ID id) {
        appendOperation(id, "提交", null);
    }

    public void appendApprove(ID id, String approver) {
        appendOperation(id, "审核通过", StringUtils.hasText(approver) ? "审核人：" + approver : null);
    }

    public void appendReject(ID id, String reason) {
        appendOperation(id, "审核拒绝", StringUtils.hasText(reason) ? "原因：" + reason : null);
    }
}
