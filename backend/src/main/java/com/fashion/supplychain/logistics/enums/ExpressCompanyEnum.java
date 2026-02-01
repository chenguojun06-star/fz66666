package com.fashion.supplychain.logistics.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.Getter;

/**
 * 快递公司枚举
 * 预留用于对接各大快递公司
 */
@Getter
public enum ExpressCompanyEnum {
    SF(1, "顺丰速运", "SF", "https://www.sf-express.com"),
    JD(2, "京东物流", "JD", "https://www.jdl.com"),
    EMS(3, "中国邮政", "EMS", "https://www.ems.com.cn"),
    ZTO(4, "中通快递", "ZTO", "https://www.zto.com"),
    YTO(5, "圆通速递", "YTO", "https://www.yto.net.cn"),
    STO(6, "申通快递", "STO", "https://www.sto.cn"),
    YUNDA(7, "韵达速递", "YUNDA", "https://www.yundaex.com"),
    DEBANG(8, "德邦快递", "DEBANG", "https://www.deppon.com"),
    JIULIU(9, "九曳供应链", "JIULIU", "https://www.jiuyi.com"),
    BEST(10, "百世快递", "BEST", "https://www.800best.com"),
    TTK(11, "天天快递", "TTK", "https://www.ttkdex.com"),
    UC(12, "优速快递", "UC", "https://www.uce.cn"),
    OTHER(99, "其他", "OTHER", "");

    @EnumValue
    @JsonValue
    private final Integer code;
    private final String name;
    private final String codeEn;
    private final String website;

    ExpressCompanyEnum(Integer code, String name, String codeEn, String website) {
        this.code = code;
        this.name = name;
        this.codeEn = codeEn;
        this.website = codeEn;
    }

    public static ExpressCompanyEnum getByCode(Integer code) {
        for (ExpressCompanyEnum company : values()) {
            if (company.getCode().equals(code)) {
                return company;
            }
        }
        return OTHER;
    }

    public static ExpressCompanyEnum getByCodeEn(String codeEn) {
        for (ExpressCompanyEnum company : values()) {
            if (company.getCodeEn().equalsIgnoreCase(codeEn)) {
                return company;
            }
        }
        return OTHER;
    }
}
