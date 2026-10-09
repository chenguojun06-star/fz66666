package com.fashion.supplychain.shop.orchestration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * D-770：C 端收货地址簿。
 *
 * <p><b>这是隐私数据，且页面免登录</b> —— 公开接口里存着「收货人 + 手机号 + 详细地址」。
 * 因此本类守护的重点不是「能不能存」，而是<b>会不会被别人读到</b>：
 * <ol>
 *   <li>所有读写必须按 {@code (tenantId, phone)} 双重归属隔离；</li>
 *   <li>手机号格式必须校验，不能拿任意字符串当身份标识；</li>
 *   <li>条数必须设上限，避免接口被当作批量抓取通道；</li>
 *   <li>删除只能删自己的（同租户 + 同手机号）；</li>
 *   <li>日志必须脱敏 —— 地址相关日志不落完整手机号。</li>
 * </ol>
 */
@DisplayName("C端地址簿的隐私隔离（D-770）")
class ShopAddressServiceTest {

    /** 通用读取：兼容 mvn 在 backend/ 下运行与从仓库根运行两种工作目录 */
    private static String read(String rel) throws Exception {
        for (String p : List.of(
                "src/main/java/com/fashion/supplychain/" + rel,
                "backend/src/main/java/com/fashion/supplychain/" + rel,
                "src/main/resources/" + rel,
                "backend/src/main/resources/" + rel)) {
            Path path = Path.of(p);
            if (Files.exists(path)) return Files.readString(path, StandardCharsets.UTF_8);
        }
        throw new AssertionError("找不到 " + rel);
    }

    private static String svc() throws Exception {
        for (String p : List.of(
                "src/main/java/com/fashion/supplychain/shop/orchestration/ShopAddressService.java",
                "backend/src/main/java/com/fashion/supplychain/shop/orchestration/ShopAddressService.java")) {
            Path path = Path.of(p);
            if (Files.exists(path)) return Files.readString(path, StandardCharsets.UTF_8);
        }
        throw new AssertionError("找不到 ShopAddressService.java");
    }

    @Test
    @DisplayName("① 读地址必须同时按租户与手机号过滤")
    void readMustScopeByTenantAndPhone() throws Exception {
        String s = svc();
        int m = s.indexOf("public List<ShopAddress> listByPhone");
        assertThat(m).isGreaterThan(0);
        String body = s.substring(m, Math.min(m + 600, s.length()));
        assertThat(body)
                .as("必须按租户隔离")
                .contains("ShopAddress::getTenantId, tenantId");
        assertThat(body)
                .as("必须按手机号隔离（手机号即 C 端身份）")
                .contains("ShopAddress::getPhone, phone");
    }

    @Test
    @DisplayName("② 删除必须带归属条件，否则可删他人地址")
    void deleteMustBeScoped() throws Exception {
        String s = svc();
        int m = s.indexOf("public void delete(");
        assertThat(m).isGreaterThan(0);
        String body = s.substring(m, Math.min(m + 700, s.length()));
        assertThat(body)
                .as("删除条件必须含租户+手机号+id")
                .contains("ShopAddress::getTenantId, tenantId")
                .contains("ShopAddress::getPhone, phone")
                .contains("ShopAddress::getId, id");
        assertThat(body)
                .as("删不到（0 行）必须报错，不能静默成功")
                .contains("地址不存在");
    }

    @Test
    @DisplayName("③ 手机号格式必须校验（不能拿任意字符串当身份）")
    void phoneMustBeValidated() throws Exception {
        String s = svc();
        assertThat(s).as("必须有手机号格式校验").contains("requirePhone");
        assertThat(s)
                .as("必须是大陆手机号格式")
                .contains("p.matches(");
        assertThat(s).as("格式非法必须报错").contains("手机号格式不正确");
    }

    @Test
    @DisplayName("④ 条数必须设上限，避免接口被当作批量抓取通道")
    void mustLimitPerPhone() throws Exception {
        String s = svc();
        assertThat(s).as("必须限制单手机号地址数").contains("MAX_PER_PHONE");
        assertThat(s).as("上限必须较小（正常用户 1~5 条）").contains("MAX_PER_PHONE = 10");
        assertThat(s).as("超限必须给出可读原因").contains("最多保存");
    }

    @Test
    @DisplayName("⑤ 收货人与详细地址必填且限长（防止超长内容撑爆订单表）")
    void consigneeAndAddressMustBeValidated() throws Exception {
        String s = svc();
        assertThat(s).as("收货人必填").contains("收货人不能为空");
        assertThat(s).as("详细地址必填").contains("详细地址不能为空");
        assertThat(s).as("必须有长度限制").contains("s.length() > maxLen");
    }

    @Test
    @DisplayName("⑥ 日志必须脱敏手机号")
    void logMustMaskPhone() throws Exception {
        String s = svc();
        assertThat(s).as("必须有脱敏方法").contains("maskPhone");
        assertThat(s)
                .as("保存日志不得直接打印完整手机号")
                .doesNotContain("log.info(\"[ShopAddress] 已保存地址 phone={}\", phone)");
        assertThat(s).as("应打印脱敏值").contains("maskPhone(phone)");
    }

    @Test
    @DisplayName("⑦ 默认地址唯一性：设默认时必须先清掉其它默认")
    void defaultMustBeUnique() throws Exception {
        String s = svc();
        assertThat(s).as("必须有清默认逻辑").contains("clearDefault");
        int m = s.indexOf("public void setDefault(");
        String body = s.substring(m, Math.min(m + 700, s.length()));
        assertThat(body).as("设默认前先清").contains("clearDefault");
        // 清理时必须排除自己，否则会把自己也清掉
        int cm = s.indexOf("private void clearDefault");
        String cbody = s.substring(cm, Math.min(cm + 700, s.length()));
        assertThat(cbody).as("清理必须排除当前记录").contains("ShopAddress::getId, keepId");
    }

    @Test
    @DisplayName("⑧ 第一条地址应自动设为默认（顾客不必多点一次）")
    void firstAddressAutoDefault() throws Exception {
        assertThat(svc()).contains("firstEver");
    }

    @Test
    @DisplayName("⑨ 同收货人+同地址视为同一条（重复提交不产生脏数据）")
    void saveMustBeIdempotent() throws Exception {
        String s = svc();
        int m = s.indexOf("public Long save(");
        String body = s.substring(m, Math.min(m + 2200, s.length()));
        assertThat(body)
                .as("先按 租户+手机号+收货人+详细地址 查已存在")
                .contains("ShopAddress::getConsignee")
                .contains("ShopAddress::getDetailAddr")
                .contains("addressMapper.selectOne");
        assertThat(body).as("已存在则更新而非新增").contains("addressMapper.updateById(row)");
    }

    @Test
    @DisplayName("⑩ 顾客端必须能回填与新增，且没有地址时不得阻塞下单")
    void customerSideMustNotBlockCheckout() throws Exception {
        String s = read("static/shop/index.html");
        // 前端：加载失败要静默降级，不能挡住结算
        assertThat(s).as("地址加载失败要降级而非报错").contains(".catch(function () { return []; })");
        assertThat(s).as("手机号不合法时直接返回空列表").contains("/^1[3-9]\\d{9}$/");
        assertThat(s).as("无地址时不渲染选择区").contains("if (!list.length) { box.innerHTML = ''; return; }");
        assertThat(s).as("选中地址需回填表单").contains("function fillAddress");
    }
}