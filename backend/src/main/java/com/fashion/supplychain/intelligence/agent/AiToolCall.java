package com.fashion.supplychain.intelligence.agent;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
public class AiToolCall {
    private String id;
    private String type = "function";
    private AiFunctionCall function;

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class AiFunctionCall {
        private String name;
        private String arguments; // JSON string
    }

    /**
     * 便捷方法：获取工具名称
     */
    public String getFunctionName() {
        return function != null ? function.getName() : null;
    }

    /**
     * 便捷方法：获取参数
     */
    public String getArguments() {
        return function != null ? function.getArguments() : null;
    }
}
