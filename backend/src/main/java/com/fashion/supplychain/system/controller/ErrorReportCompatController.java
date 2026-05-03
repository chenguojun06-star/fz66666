package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.dto.FrontendErrorDTO;
import com.fashion.supplychain.system.store.FrontendErrorStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/system")
@PreAuthorize("isAuthenticated()")
public class ErrorReportCompatController {

    private static final Logger log = LoggerFactory.getLogger(ErrorReportCompatController.class);

    @Autowired
    private FrontendErrorStore store;

    @PostMapping("/error-report")
    public Result<Void> errorReport(@RequestBody Map<String, Object> payload) {
        FrontendErrorDTO dto = new FrontendErrorDTO();

        Object typeVal = payload.get("type");
        dto.setType(typeVal != null ? typeVal.toString() : "unknown");

        Object msgVal = payload.get("message");
        if (msgVal == null) msgVal = payload.get("error");
        if (msgVal == null) msgVal = payload.get("detail");
        dto.setMessage(msgVal != null ? truncate(msgVal.toString(), 500) : null);

        Object stackVal = payload.get("stack");
        if (stackVal == null) stackVal = payload.get("stackTrace");
        dto.setStack(stackVal != null ? truncate(stackVal.toString(), 2000) : null);

        Object urlVal = payload.get("url");
        dto.setUrl(urlVal != null ? truncate(urlVal.toString(), 500) : null);

        Object tsVal = payload.get("occurredAt");
        if (tsVal == null) tsVal = payload.get("timestamp");
        dto.setOccurredAt(tsVal != null ? tsVal.toString() : null);

        store.add(dto);
        log.warn("[ErrorReport] type={} msg={}",
                dto.getType(),
                dto.getMessage() != null && dto.getMessage().length() > 80
                        ? dto.getMessage().substring(0, 80)
                        : dto.getMessage());
        return Result.success(null);
    }

    private static String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() > max ? s.substring(0, max) + "...(truncated)" : s;
    }
}
