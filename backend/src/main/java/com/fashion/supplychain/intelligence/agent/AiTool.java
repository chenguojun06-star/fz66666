package com.fashion.supplychain.intelligence.agent;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;
import java.util.Map;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AiTool {
    private String type = "function";
    private AiFunction function;

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class AiFunction {
        private String name;
        private String description;
        private AiParameters parameters;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class AiParameters {
        private String type = "object";
        private Map<String, Object> properties; // <property_name, description/type>
        private java.util.List<String> required;
    }
}
