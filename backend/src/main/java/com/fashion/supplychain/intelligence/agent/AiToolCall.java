package com.fashion.supplychain.intelligence.agent;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AiToolCall {
    private String id;
    private String type = "function";
    private AiFunctionCall function;

    @Data
    public static class AiFunctionCall {
        private String name;
        private String arguments; // JSON string
    }
}
