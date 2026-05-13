package com.fashion.supplychain.system.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.system.entity.OrganizationUnit;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface OrganizationUnitMapper extends BaseMapper<OrganizationUnit> {

    @Select("SELECT * FROM t_organization_unit WHERE factory_id = #{factoryId} AND node_type = 'FACTORY' ORDER BY id DESC LIMIT 1")
    OrganizationUnit selectOneByFactoryIdIgnoreDelete(@Param("factoryId") String factoryId);

    @Select("SELECT * FROM t_organization_unit WHERE factory_id = #{factoryId} AND node_type = 'FACTORY' AND delete_flag = 0")
    List<OrganizationUnit> selectActiveByFactoryId(@Param("factoryId") String factoryId);

    @Select("SELECT * FROM t_organization_unit WHERE factory_id = #{factoryId} AND node_type = 'FACTORY' AND delete_flag = 1")
    List<OrganizationUnit> selectDeletedByFactoryId(@Param("factoryId") String factoryId);
}
