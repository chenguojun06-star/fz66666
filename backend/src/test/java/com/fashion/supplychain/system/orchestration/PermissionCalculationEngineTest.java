package com.fashion.supplychain.system.orchestration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.service.RedisService;
import com.fashion.supplychain.system.entity.Permission;
import com.fashion.supplychain.system.service.PermissionService;
import com.fashion.supplychain.system.service.RolePermissionService;
import com.fashion.supplychain.system.service.TenantPermissionCeilingService;
import com.fashion.supplychain.system.service.UserPermissionOverrideService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PermissionCalculationEngineTest {

    @Mock
    private RolePermissionService rolePermissionService;

    @Mock
    private PermissionService permissionService;

    @Mock
    private TenantPermissionCeilingService ceilingService;

    @Mock
    private UserPermissionOverrideService overrideService;

    @Mock
    private RedisService redisService;

    @Mock
    private StringRedisTemplate stringRedisTemplate;

    @Mock
    private ValueOperations<String, String> valueOperations;

    @InjectMocks
    private PermissionCalculationEngine engine;

    @BeforeEach
    void setUp() {
        when(stringRedisTemplate.opsForValue()).thenReturn(valueOperations);
        ReflectionTestUtils.setField(engine, "objectMapper", new ObjectMapper());
    }

    @Test
    void getRolePermissionIds_shouldDeleteBrokenLegacyCacheAndRebuildAsPlainJson() {
        String cacheKey = "role:perms:1";
        // 完全损坏的值（无法被任何解析器处理），触发 safeDeleteKey + 回源DB 路径
        when(valueOperations.get(cacheKey)).thenReturn("CORRUPT::CACHE::NOT_JSON");
        when(rolePermissionService.getPermissionIdsByRoleId(1L)).thenReturn(List.of(1L, 2L));

        List<Long> result = engine.getRolePermissionIds(1L);

        assertEquals(List.of(1L, 2L), result);
        verify(stringRedisTemplate).delete(cacheKey);
        verify(valueOperations).set(eq(cacheKey), eq("[1,2]"), eq(30L), any());
    }

    @Test
    void calculatePermissions_shouldReadStableJsonCacheWithoutHittingDatabase() {
        String cacheKey = "user:perms:9";
        when(valueOperations.get(cacheKey)).thenReturn("[\"MENU_PRODUCTION\",\"STYLE_CREATE\"]");

        List<String> result = engine.calculatePermissions(9L, 3L, 100L, false);

        assertEquals(List.of("MENU_PRODUCTION", "STYLE_CREATE"), result);
        verify(rolePermissionService, never()).getPermissionIdsByRoleId(anyLong());
    }

    @Test
    void clearLegacyPermissionCache_shouldAlsoDeleteSuperAdminPermissionCache() {
        engine.clearLegacyPermissionCache();

        verify(stringRedisTemplate).delete("super:all:perms");
    }

    @Test
    void calculatePermissions_shouldRebuildUserCacheAsPlainJson() {
        String cacheKey = "user:perms:9";
        when(valueOperations.get(cacheKey)).thenReturn(null);
        when(rolePermissionService.getPermissionIdsByRoleId(3L)).thenReturn(List.of(1L, 2L));
        when(ceilingService.getGrantedPermissionIds(100L)).thenReturn(List.of(1L, 2L));
        when(overrideService.getGrantPermissionIds(9L)).thenReturn(List.of());
        when(overrideService.getRevokePermissionIds(9L)).thenReturn(List.of());

        Permission production = new Permission();
        production.setId(1L);
        production.setPermissionCode("MENU_PRODUCTION");
        Permission style = new Permission();
        style.setId(2L);
        style.setPermissionCode("STYLE_CREATE");
        when(permissionService.listByIds(any())).thenReturn(List.of(production, style));

        List<String> result = engine.calculatePermissions(9L, 3L, 100L, false);

        assertEquals(List.of("MENU_PRODUCTION", "STYLE_CREATE"), result);
        verify(valueOperations).set(eq(cacheKey), eq("[\"MENU_PRODUCTION\",\"STYLE_CREATE\"]"), eq(30L), any());
    }
}
