package com.fashion.supplychain.style.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleSize;
import com.fashion.supplychain.style.orchestration.StyleSizeOrchestrator;
import com.fashion.supplychain.style.service.StyleInfoService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import java.util.Collections;
import java.util.List;

@RestController
@RequestMapping("/api/style/size")
@PreAuthorize("isAuthenticated()")
public class StyleSizeController {

  @Autowired
  private StyleSizeOrchestrator styleSizeOrchestrator;

  @Autowired
  private StyleInfoService styleInfoService;

  @GetMapping("/list")
  @PreAuthorize("isAuthenticated()")
  public Result<List<StyleSize>> listByStyleId(
          @RequestParam(required = false) String styleId,
          @RequestParam(required = false) String styleNo) {
    Long resolvedStyleId = null;
    if (StringUtils.hasText(styleId)) {
      try {
        resolvedStyleId = Long.parseLong(styleId.trim());
      } catch (NumberFormatException e) {
        styleNo = styleId.trim();
      }
    }
    if (resolvedStyleId == null && StringUtils.hasText(styleNo)) {
      Long currentTenantId = UserContext.tenantId();
      StyleInfo style = styleInfoService.lambdaQuery()
              .eq(StyleInfo::getStyleNo, styleNo.trim())
              .eq(currentTenantId != null, StyleInfo::getTenantId, currentTenantId)
              .orderByDesc(StyleInfo::getId)
              .last("limit 1")
              .one();
      if (style == null || style.getId() == null) {
        return Result.success(Collections.emptyList());
      }
      resolvedStyleId = style.getId();
    }
    if (resolvedStyleId == null) {
      return Result.fail("缺少参数 styleId 或 styleNo");
    }
    return Result.success(styleSizeOrchestrator.listByStyleId(resolvedStyleId));
  }

  @PostMapping
  @PreAuthorize("isAuthenticated()")
  public Result<Boolean> save(@RequestBody StyleSize styleSize) {
    return Result.success(styleSizeOrchestrator.save(styleSize));
  }

  @PutMapping
  @PreAuthorize("isAuthenticated()")
  public Result<Boolean> update(@RequestBody StyleSize styleSize) {
    return Result.success(styleSizeOrchestrator.update(styleSize));
  }

  @DeleteMapping("/{id}")
  @PreAuthorize("isAuthenticated()")
  public Result<Boolean> delete(@PathVariable String id) {
    return Result.success(styleSizeOrchestrator.delete(id));
  }
}
