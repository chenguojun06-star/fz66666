package com.fashion.supplychain.style.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.style.entity.StyleSize;
import com.fashion.supplychain.style.orchestration.StyleSizeOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/style/size")
@PreAuthorize("isAuthenticated()")
public class StyleSizeController {

  @Autowired
  private StyleSizeOrchestrator styleSizeOrchestrator;

  @GetMapping("/list")
  @PreAuthorize("hasAuthority('STYLE_VIEW')")
  public Result<List<StyleSize>> listByStyleId(@RequestParam Long styleId) {
    return Result.success(styleSizeOrchestrator.listByStyleId(styleId));
  }

  @PostMapping
  @PreAuthorize("hasAuthority('STYLE_UPDATE')")
  public Result<Boolean> save(@RequestBody StyleSize styleSize) {
    return Result.success(styleSizeOrchestrator.save(styleSize));
  }

  @PutMapping
  @PreAuthorize("hasAuthority('STYLE_UPDATE')")
  public Result<Boolean> update(@RequestBody StyleSize styleSize) {
    return Result.success(styleSizeOrchestrator.update(styleSize));
  }

  @DeleteMapping("/{id}")
  @PreAuthorize("hasAuthority('STYLE_UPDATE')")
  public Result<Boolean> delete(@PathVariable String id) {
    return Result.success(styleSizeOrchestrator.delete(id));
  }
}
