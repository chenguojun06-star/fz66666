package com.fashion.supplychain.system.helper;

import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.mapper.UserMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * D-721 员工工号生成器单测：零填充 4 位、租户分段隔离、水位续排、无水位从 0001 起、
 * 超 9999 退位自然数、空租户不编号。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class EmployeeNoGeneratorTest {

    @Mock
    private UserMapper userMapper;

    private EmployeeNoGenerator generator;

    @BeforeEach
    void setUp() {
        generator = new EmployeeNoGenerator(userMapper);
    }

    private void watermark(Object max) {
        when(userMapper.selectObjs(any())).thenReturn(max == null ? List.of() : List.of(max));
    }

    @Test
    @DisplayName("无历史工号：从 0001 开始按顺序递增")
    void sequenceFromZeroWatermark() {
        watermark(null);
        assertEquals("0001", generator.next(2L));
        assertEquals("0002", generator.next(2L));
        assertEquals("0003", generator.next(2L));
    }

    @Test
    @DisplayName("有历史水位：从现有最大纯数字工号之后继续排")
    void continueFromWatermark() {
        watermark(7L);
        assertEquals("0008", generator.next(2L));
        assertEquals("0009", generator.next(2L));
    }

    @Test
    @DisplayName("租户分段隔离：两租户各自从自己的水位起步互不影响")
    void tenantIsolation() {
        watermark(null);
        assertEquals("0001", generator.next(2L));
        assertEquals("0001", generator.next(112L));
        assertEquals("0002", generator.next(2L));
        assertEquals("0002", generator.next(112L));
    }

    @Test
    @DisplayName("超过 9999 自动退位为不补零自然数，不阻断注册")
    void overflowBeyondFourDigits() {
        watermark(9999L);
        assertEquals("10000", generator.next(2L));
        assertEquals("10001", generator.next(2L));
    }

    @Test
    @DisplayName("空租户不编号（返回 null，由调用方跳过）")
    void nullTenantReturnsNull() {
        assertNull(generator.next(null));
    }

    @Test
    @DisplayName("实体字段联动：新建用户留空工号时被 save 收口赋值（格式纯数字4位）")
    void formatIsPureFourDigits() {
        watermark(null);
        String no = generator.next(2L);
        assertEquals(4, no.length());
        assertEquals(1, Integer.parseInt(no));
        User u = new User();
        u.setTenantId(2L);
        u.setEmployeeNo(no);
        assertEquals("0001", u.getEmployeeNo());
    }
}
