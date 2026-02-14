package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.auth.AuthTokenService;
import com.fashion.supplychain.production.entity.PatternRevision;
import com.fashion.supplychain.production.mapper.PatternRevisionMapper;
import com.fashion.supplychain.production.service.PatternRevisionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 纸样修改记录服务实现

 */
@Service
public class PatternRevisionServiceImpl extends ServiceImpl<PatternRevisionMapper, PatternRevision>
        implements PatternRevisionService {

    @Autowired
    private AuthTokenService authTokenService;

    @Override
    @Transactional
    public boolean submitForApproval(String id) {
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException("记录ID不能为空");
        }

        PatternRevision revision = getById(id);
        if (revision == null) {
            throw new IllegalArgumentException("记录不存在");
        }

        if (!"DRAFT".equals(revision.getStatus())) {
            throw new IllegalStateException("只有草稿状态才能提交");
        }

        // 获取当前用户信息
        String userId = authTokenService.getCurrentUserId();
        String username = authTokenService.getCurrentUsername();

        revision.setStatus("SUBMITTED");
        revision.setSubmitterId(userId);
        revision.setSubmitterName(username);
        revision.setSubmitTime(LocalDateTime.now());

        return updateById(revision);
    }

    @Override
    @Transactional
    public boolean approve(String id, String comment) {
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException("记录ID不能为空");
        }

        PatternRevision revision = getById(id);
        if (revision == null) {
            throw new IllegalArgumentException("记录不存在");
        }

        if (!"SUBMITTED".equals(revision.getStatus())) {
            throw new IllegalStateException("只有已提交状态才能审核");
        }

        // 获取当前用户信息
        String userId = authTokenService.getCurrentUserId();
        String username = authTokenService.getCurrentUsername();

        revision.setStatus("APPROVED");
        revision.setApproverId(userId);
        revision.setApproverName(username);
        revision.setApprovalTime(LocalDateTime.now());
        revision.setApprovalComment(comment);

        return updateById(revision);
    }

    @Override
    @Transactional
    public boolean reject(String id, String comment) {
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException("记录ID不能为空");
        }

        PatternRevision revision = getById(id);
        if (revision == null) {
            throw new IllegalArgumentException("记录不存在");
        }

        if (!"SUBMITTED".equals(revision.getStatus())) {
            throw new IllegalStateException("只有已提交状态才能拒绝");
        }

        // 获取当前用户信息
        String userId = authTokenService.getCurrentUserId();
        String username = authTokenService.getCurrentUsername();

        revision.setStatus("REJECTED");
        revision.setApproverId(userId);
        revision.setApproverName(username);
        revision.setApprovalTime(LocalDateTime.now());
        revision.setApprovalComment(comment);

        return updateById(revision);
    }

    @Override
    @Transactional
    public boolean complete(String id) {
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException("记录ID不能为空");
        }

        PatternRevision revision = getById(id);
        if (revision == null) {
            throw new IllegalArgumentException("记录不存在");
        }

        if (!"APPROVED".equals(revision.getStatus())) {
            throw new IllegalStateException("只有已审核状态才能完成");
        }

        revision.setStatus("COMPLETED");
        revision.setActualCompleteDate(LocalDate.now());

        return updateById(revision);
    }

    @Override
    public String generateNextRevisionNo(String styleNo) {
        if (!StringUtils.hasText(styleNo)) {
            return "V1.0";
        }

        // 查询该款号的所有修改记录
        List<PatternRevision> revisions = lambdaQuery()
                .eq(PatternRevision::getStyleNo, styleNo)
                .orderByDesc(PatternRevision::getCreateTime)
                .list();

        if (revisions.isEmpty()) {
            return "V1.0";
        }

        // 解析最新的版本号
        String latestRevisionNo = revisions.stream()
                .map(PatternRevision::getRevisionNo)
                .filter(StringUtils::hasText)
                .max(Comparator.comparing(this::parseVersionNumber))
                .orElse("V0.0");

        // 生成下一个版本号
        VersionNumber vn = parseVersionNumber(latestRevisionNo);
        return String.format("V%d.%d", vn.major, vn.minor + 1);
    }

    /**
     * 解析版本号
     *
     * @param versionString 版本字符串（如：V1.0, V2.3）
     * @return 版本号对象
     */
    private VersionNumber parseVersionNumber(String versionString) {
        if (!StringUtils.hasText(versionString)) {
            return new VersionNumber(0, 0);
        }

        // 匹配格式：V1.0 或 v1.0 或 1.0
        Pattern pattern = Pattern.compile("^[Vv]?(\\d+)\\.(\\d+)$");
        Matcher matcher = pattern.matcher(versionString.trim());

        if (matcher.find()) {
            int major = Integer.parseInt(matcher.group(1));
            int minor = Integer.parseInt(matcher.group(2));
            return new VersionNumber(major, minor);
        }

        return new VersionNumber(0, 0);
    }

    /**
     * 版本号内部类
     */
    private static class VersionNumber implements Comparable<VersionNumber> {
        final int major;
        final int minor;

        VersionNumber(int major, int minor) {
            this.major = major;
            this.minor = minor;
        }

        @Override
        public int compareTo(VersionNumber other) {
            if (this.major != other.major) {
                return Integer.compare(this.major, other.major);
            }
            return Integer.compare(this.minor, other.minor);
        }
    }
}
