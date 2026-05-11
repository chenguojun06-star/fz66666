package com.fashion.supplychain.warehouse.orchestration;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.warehouse.entity.WarehouseArea;
import com.fashion.supplychain.warehouse.service.WarehouseAreaService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("WarehouseAreaOrchestrator - 仓库区域管理")
class WarehouseAreaOrchestratorTest {

    @Mock
    private WarehouseAreaService areaService;

    @Mock
    private com.fashion.supplychain.warehouse.service.WarehouseLocationService locationService;

    private WarehouseAreaOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        UserContext.clear();
        UserContext ctx = new UserContext();
        ctx.setUserId("user-001");
        ctx.setUsername("仓库管理员");
        ctx.setRole("admin");
        ctx.setTenantId(1L);
        ctx.setPermissionRange("all");
        UserContext.set(ctx);
        orchestrator = new WarehouseAreaOrchestrator(areaService, locationService);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    private WarehouseArea buildArea(String areaCode, String areaName, String warehouseType) {
        WarehouseArea area = new WarehouseArea();
        area.setId("area-" + System.nanoTime());
        area.setAreaCode(areaCode);
        area.setAreaName(areaName);
        area.setWarehouseType(warehouseType);
        area.setStatus("ACTIVE");
        area.setTenantId(1L);
        area.setDeleteFlag(0);
        area.setCreateTime(LocalDateTime.now());
        return area;
    }

    @Nested
    @DisplayName("create - 创建仓库区域")
    class Create {

        @Test
        @DisplayName("正常创建-成功")
        void normalCreate_success() {
            WarehouseArea area = buildArea("CP-001", "成品仓A区", "FINISHED");
            when(areaService.count(any())).thenReturn(0L);
            when(areaService.save(any(WarehouseArea.class))).thenReturn(true);

            Result<WarehouseArea> result = orchestrator.create(area);

            assertThat(result.getCode()).isEqualTo(200);
            assertThat(result.getData()).isNotNull();
        }

        @Test
        @DisplayName("区域编码为空-失败")
        void emptyAreaCode_fail() {
            WarehouseArea area = buildArea("", "成品仓A区", "FINISHED");

            Result<WarehouseArea> result = orchestrator.create(area);

            assertThat(result.getCode()).isNotEqualTo(200);
            assertThat(result.getMessage()).contains("区域编码不能为空");
        }

        @Test
        @DisplayName("区域名称为空-失败")
        void emptyAreaName_fail() {
            WarehouseArea area = buildArea("CP-001", "", "FINISHED");

            Result<WarehouseArea> result = orchestrator.create(area);

            assertThat(result.getCode()).isNotEqualTo(200);
            assertThat(result.getMessage()).contains("区域名称不能为空");
        }

        @Test
        @DisplayName("仓库类型为空-失败")
        void emptyWarehouseType_fail() {
            WarehouseArea area = buildArea("CP-001", "成品仓A区", "");

            Result<WarehouseArea> result = orchestrator.create(area);

            assertThat(result.getCode()).isNotEqualTo(200);
            assertThat(result.getMessage()).contains("仓库类型不能为空");
        }

        @Test
        @DisplayName("不支持的仓库类型-失败")
        void invalidWarehouseType_fail() {
            WarehouseArea area = buildArea("XX-001", "未知仓库", "INVALID_TYPE");

            Result<WarehouseArea> result = orchestrator.create(area);

            assertThat(result.getCode()).isNotEqualTo(200);
            assertThat(result.getMessage()).contains("不支持的仓库类型");
        }

        @Test
        @DisplayName("区域编码已存在-失败")
        void duplicateAreaCode_fail() {
            WarehouseArea area = buildArea("CP-001", "成品仓A区", "FINISHED");
            when(areaService.count(any())).thenReturn(1L);

            Result<WarehouseArea> result = orchestrator.create(area);

            assertThat(result.getCode()).isNotEqualTo(200);
            assertThat(result.getMessage()).contains("区域编码已存在");
        }

        @Test
        @DisplayName("默认status为ACTIVE")
        void defaultStatus_active() {
            WarehouseArea area = buildArea("CP-002", "成品仓B区", "MATERIAL");
            area.setStatus(null);
            when(areaService.count(any())).thenReturn(0L);
            when(areaService.save(any(WarehouseArea.class))).thenAnswer(inv -> {
                WarehouseArea saved = inv.getArgument(0);
                assertThat(saved.getStatus()).isEqualTo("ACTIVE");
                return true;
            });

            orchestrator.create(area);
        }

        @Test
        @DisplayName("所有合法仓库类型均成功")
        void allValidWarehouseTypes_success() {
            String[] validTypes = {"FINISHED", "MATERIAL", "SAMPLE"};

            for (String type : validTypes) {
                WarehouseArea area = new WarehouseArea();
                area.setAreaCode(type + "-" + System.nanoTime());
                area.setAreaName(type + "-测试仓");
                area.setWarehouseType(type);

                when(areaService.count(any())).thenReturn(0L);
                when(areaService.save(any(WarehouseArea.class))).thenReturn(true);

                Result<WarehouseArea> result = orchestrator.create(area);
                assertThat(result.getCode()).isEqualTo(200);
            }
        }
    }

    @Nested
    @DisplayName("quickCreate - 快速创建")
    class QuickCreate {

        @Test
        @DisplayName("正常快速创建-成功")
        void normalQuickCreate_success() {
            when(areaService.count(any())).thenReturn(0L);
            when(areaService.save(any(WarehouseArea.class))).thenReturn(true);

            Result<WarehouseArea> result = orchestrator.quickCreate("新区域", "FINISHED");

            assertThat(result.getCode()).isEqualTo(200);
            assertThat(result.getData().getAreaCode()).isEqualTo("CP-001");
            assertThat(result.getData().getAreaName()).isEqualTo("新区域");
        }

        @Test
        @DisplayName("自动递增编码")
        void autoIncrementCode() {
            when(areaService.count(any())).thenReturn(2L);
            when(areaService.save(any(WarehouseArea.class))).thenReturn(true);

            Result<WarehouseArea> result = orchestrator.quickCreate("新区域", "FINISHED");

            assertThat(result.getData().getAreaCode()).isEqualTo("CP-003");
        }

        @Test
        @DisplayName("成品仓类型前缀CP")
        void finishedTypePrefix() {
            when(areaService.count(any())).thenReturn(0L);
            when(areaService.save(any(WarehouseArea.class))).thenReturn(true);

            Result<WarehouseArea> result = orchestrator.quickCreate("成品区", "FINISHED");

            assertThat(result.getData().getAreaCode()).startsWith("CP-");
        }

        @Test
        @DisplayName("物料仓类型前缀WL")
        void materialTypePrefix() {
            when(areaService.count(any())).thenReturn(0L);
            when(areaService.save(any(WarehouseArea.class))).thenReturn(true);

            Result<WarehouseArea> result = orchestrator.quickCreate("物料区", "MATERIAL");

            assertThat(result.getData().getAreaCode()).startsWith("WL-");
        }

        @Test
        @DisplayName("样衣仓类型前缀YY")
        void sampleTypePrefix() {
            when(areaService.count(any())).thenReturn(0L);
            when(areaService.save(any(WarehouseArea.class))).thenReturn(true);

            Result<WarehouseArea> result = orchestrator.quickCreate("样衣区", "SAMPLE");

            assertThat(result.getData().getAreaCode()).startsWith("YY-");
        }

        @Test
        @DisplayName("区域名称为空-失败")
        void emptyAreaName_fail() {
            Result<WarehouseArea> result = orchestrator.quickCreate("", "FINISHED");

            assertThat(result.getCode()).isNotEqualTo(200);
            assertThat(result.getMessage()).contains("区域名称不能为空");
        }

        @Test
        @DisplayName("无效仓库类型-失败")
        void invalidWarehouseType_fail() {
            Result<WarehouseArea> result = orchestrator.quickCreate("测试区", "INVALID");

            assertThat(result.getCode()).isNotEqualTo(200);
            assertThat(result.getMessage()).contains("仓库类型无效");
        }
    }
}
