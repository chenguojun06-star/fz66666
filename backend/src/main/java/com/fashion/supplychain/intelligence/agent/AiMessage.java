package com.fashion.supplychain.intelligence.agent;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;

@Data
@NoArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
public class AiMessage {
    private String role; // system, user, assistant, tool
    private String content;
    private String name;
    private String tool_call_id;
    private List<AiToolCall> tool_calls;
    private String reasoning_content;

    public static AiMessage system(String txt) {
        AiMessage m = new AiMessage();
        m.role = "system";
        m.content = txt != null ? txt : "";
        return m;
    }

    public static AiMessage user(String txt) {
        AiMessage m = new AiMessage();
        m.role = "user";
        m.content = txt != null ? txt : "";
        return m;
    }

    public static AiMessage assistant(String txt) {
        AiMessage m = new AiMessage();
        m.role = "assistant";
        m.content = txt != null ? txt : "";
        return m;
    }

    public static AiMessage tool(String txt, String toolCallId, String name) {
        AiMessage m = new AiMessage();
        m.role = "tool";
        m.content = txt != null ? txt : "";
        m.tool_call_id = toolCallId;
        m.name = name;
        return m;
    }
}
