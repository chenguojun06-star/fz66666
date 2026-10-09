package com.fashion.supplychain.shop.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 平台级 C 端消费者账号（P0）。
 *
 * <p>与 {@code t_customer_client_user}（租户级 B 端客户门户账号）不同：
 * 本表是**平台级**的 —— 不带 tenant_id，一个手机号在平台内唯一，
 * 在所有租户的店铺通用（这正是「平台级电商」与「每租户一个小店」的分界）。
 *
 * <p>密码只存 BCrypt 哈希，且用 {@code WRITE_ONLY} 保证永不出现在响应 JSON 里。
 */
@Data
@TableName("t_shop_consumer")
public class ShopConsumer {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /** 登录手机号（平台唯一） */
    private String phone;

    /** BCrypt 密码哈希；只写不读 */
    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    private String passwordHash;

    private String nickname;

    private String avatar;

    /** 1=正常 0=禁用 */
    private Integer status;

    private LocalDateTime lastLoginTime;

    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
