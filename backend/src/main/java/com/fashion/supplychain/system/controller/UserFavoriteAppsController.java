package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.system.service.UserFavoriteAppsService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/system/user/favorite-apps")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class UserFavoriteAppsController {

    private final UserFavoriteAppsService userFavoriteAppsService;

    /**
     * 获取我的收藏应用
     */
    @GetMapping
    public Map<String, Object> getMyFavorites() {
        String favoriteData = userFavoriteAppsService.getMyFavorites();
        return Map.of("favoriteData", favoriteData);
    }

    /**
     * 保存我的收藏应用
     */
    @PutMapping
    public Map<String, Object> saveMyFavorites(@RequestBody Map<String, String> body) {
        String favoriteData = body.get("favoriteData");
        if (favoriteData == null || favoriteData.isEmpty()) {
            favoriteData = "[]";
        }
        userFavoriteAppsService.saveMyFavorites(favoriteData);
        return Map.of("success", true);
    }
}
