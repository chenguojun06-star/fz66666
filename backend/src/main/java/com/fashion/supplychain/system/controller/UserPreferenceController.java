package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.dto.UserPreferenceSaveRequest;
import com.fashion.supplychain.system.entity.UserPreference;
import com.fashion.supplychain.system.orchestration.UserPreferenceOrchestrator;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 用户偏好 API
 * - GET  /api/system/user-preference?pageKey=style-list          查询当前用户在某页面的所有偏好
 * - PUT  /api/system/user-preference                              保存/更新单条偏好
 * - DEL  /api/system/user-preference?pageKey=xxx&type=visible_columns  删除单条偏好
 */
@RestController
@RequestMapping("/api/system/user-preference")
@PreAuthorize("isAuthenticated()")
public class UserPreferenceController {

    @Autowired
    private UserPreferenceOrchestrator userPreferenceOrchestrator;

    @GetMapping
    public Result<List<UserPreference>> list(@RequestParam String pageKey) {
        return Result.success(userPreferenceOrchestrator.listByPage(pageKey));
    }

    @PutMapping
    public Result<UserPreference> save(@RequestBody UserPreferenceSaveRequest request) {
        return Result.success(userPreferenceOrchestrator.save(request));
    }

    @DeleteMapping
    public Result<Void> delete(
            @RequestParam String pageKey,
            @RequestParam String preferenceType) {
        userPreferenceOrchestrator.delete(pageKey, preferenceType);
        return Result.success();
    }
}
