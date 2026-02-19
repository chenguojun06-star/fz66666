package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.MaterialRoll;
import com.fashion.supplychain.production.mapper.MaterialRollMapper;
import com.fashion.supplychain.production.service.MaterialRollService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * 面辅料料卷 Service 实现
 */
@Slf4j
@Service
public class MaterialRollServiceImpl extends ServiceImpl<MaterialRollMapper, MaterialRoll>
        implements MaterialRollService {

    @Override
    public String generateRollCode() {
        synchronized (this) {
            return doGenerate();
        }
    }

    private String doGenerate() {
        String dateStr = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        // 查当天最大序号
        LambdaQueryWrapper<MaterialRoll> qw = new LambdaQueryWrapper<>();
        qw.likeRight(MaterialRoll::getRollCode, "MR" + dateStr)
          .orderByDesc(MaterialRoll::getRollCode)
          .last("LIMIT 1");
        MaterialRoll last = this.getOne(qw);
        int seq = 1;
        if (last != null && last.getRollCode() != null) {
            try {
                // MR20260219NNNNN -> last 5 chars
                String suffix = last.getRollCode().substring(last.getRollCode().length() - 5);
                seq = Integer.parseInt(suffix) + 1;
            } catch (NumberFormatException ignored) {}
        }
        return String.format("MR%s%05d", dateStr, seq);
    }

    @Override
    public List<MaterialRoll> listByInboundId(String inboundId) {
        LambdaQueryWrapper<MaterialRoll> qw = new LambdaQueryWrapper<>();
        qw.eq(MaterialRoll::getInboundId, inboundId)
          .orderByAsc(MaterialRoll::getRollCode);
        return this.list(qw);
    }

    @Override
    public MaterialRoll findByRollCode(String rollCode) {
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<MaterialRoll> qw = new LambdaQueryWrapper<>();
        qw.eq(MaterialRoll::getRollCode, rollCode);
        if (tenantId != null) {
            qw.eq(MaterialRoll::getTenantId, tenantId);
        }
        return this.getOne(qw);
    }
}
