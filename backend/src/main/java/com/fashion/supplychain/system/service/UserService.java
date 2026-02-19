package com.fashion.supplychain.system.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.system.entity.User;

/**
 * 用户服务接口
 */
public interface UserService extends IService<User> {

    /**
     * 分页查询用户列表
     * @param page 当前页码
     * @param pageSize 每页条数
     * @param username 用户名
     * @param name 姓名
     * @param roleName 角色名称
     * @param status 状态
     * @return 分页结果
     */
    Page<User> getUserPage(Long page, Long pageSize, String username, String name, String roleName, String status);

    /**
     * 新增用户
     * @param user 用户信息
     * @return 是否成功
     */
    boolean saveUser(User user);

    /**
     * 更新用户
     * @param user 用户信息
     * @return 是否成功
     */
    boolean updateUser(User user);

    /**
     * 切换用户状态
     * @param id 用户ID
     * @param status 状态
     * @return 是否成功
     */
    boolean toggleUserStatus(Long id, String status);

    /**
     * 删除用户
     * @param id 用户ID
     * @return 是否成功
     */
    boolean deleteUser(Long id);

    /**
     * 用户登录
     * @param username 用户名
     * @param password 密码
     * @return 用户信息
     */
    User login(String username, String password);

    /**
     * 用户登录（带租户过滤）
     * @param username 用户名
     * @param password 密码
     * @param tenantId 租户ID（可选，null表示不过滤）
     * @return 用户信息
     */
    User login(String username, String password, Long tenantId);

    /**
     * 根据姓名查找用户（精确匹配，用于验证人员字段）
     * @param name 用户姓名
     * @return 用户信息，不存在则返回null
     */
    User findByName(String name);

    /**
     * 验证用户是否存在（根据姓名）
     * @param name 用户姓名
     * @return 是否存在
     */
    boolean existsByName(String name);
}
