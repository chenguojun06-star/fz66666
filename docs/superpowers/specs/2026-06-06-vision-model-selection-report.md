# 视觉模型选型报告 — 2026-06-06

> 调研日期：2026-06-06
> 调研范围：视觉模型 + 服装质检专用模型 + 多模态RAG + 部署方案
> 推荐方案：Doubao-Vision + Qdrant + 轻量级YOLOv8补充

---

## 一、视觉模型前沿趋势调研

### 1.1 通用视觉大模型对比

| 模型 | 发布方 | 优势 | 劣势 | 成本 | 国内访问 | 推荐度 |
|------|--------|------|------|------|---------|--------|
| **Doubao-Vision** | 字节跳动 | 中文优化、成本低、国内访问快、服装相关能力强 | 定制能力有限 | 低 | ✅ | ⭐⭐⭐⭐⭐ |
| **Qwen-VL-Max** | 阿里云 | 开源、可微调、服装领域相关数据多 | 部署成本高、需要GPU | 中 | ✅ | ⭐⭐⭐⭐ |
| **GPT-4V / GPT-4o** | OpenAI | 能力最强、通用场景表现最佳 | 成本高、国内访问慢、合规问题 | 高 | ❌ | ⭐⭐⭐ |
| **LLaVA-1.6** | 开源社区 | 开源、可部署、灵活度高 | 中文能力弱、需要自行优化 | 低 | ✅ | ⭐⭐⭐ |

### 1.2 服装质检专用模型调研

- **YOLOv8 / YOLOv9**：最流行的目标检测算法，已有多个纺织缺陷检测落地案例
- **YOLO-NAS**：Neural Architecture Search优化版本，速度更快精度更高
- **专用检测任务**：
  - 破洞、污渍、色差、线头、跳针、漏针、起毛、褶皱
  - 尺寸偏差、印花偏移、对齐度检查

**选型建议**：
- **阶段1**：先用 Doubao-Vision 快速落地（无需训练数据）
- **阶段2**：积累1000+标注数据后，训练专用 YOLOv8 模型
- **阶段3**：混合方案（通用视觉+专用检测）

### 1.3 多模态RAG方案

- **向量数据库**：Qdrant 是 2025-2026 增长最快的向量数据库（28K+ Stars）
  - v1.15 版本新增 BM25 全文检索支持
  - 支持多模态向量存储（图片+文本联合检索）
  - 单机可处理 10 亿向量，轻量稳定
- **多模态检索架构**：
  - 图片 → CLIP 向量 → Qdrant
  - 文本 → Embedding → Qdrant
  - 联合检索 → 相关结果增强提示

### 1.4 视觉模型部署方案

| 部署方案 | 优势 | 劣势 | 适用场景 |
|---------|------|------|---------|
| **云API** | 简单、无需GPU、自动扩缩容 | 依赖网络、成本随用量增长 | 初期快速落地 |
| **ONNX Runtime** | 跨平台、性能优化 | 需要转换模型 | 边缘设备/本地部署 |
| **TensorRT** | NVIDIA GPU极致优化 | 只支持NVIDIA | 高性能服务器部署 |
| **OpenVINO** | Intel硬件优化 | 硬件限制 | Intel服务器/PC部署 |

**推荐**：云API（Doubao-Vision）优先，数据积累后考虑本地部署。

---

## 二、技术实现方案

### 2.1 整体架构

```
用户上传图片
    ↓
图片预处理（压缩/EXIF修复）
    ↓
Redis缓存检查（图片hash）
    ↓
[缓存命中] → 直接返回
    ↓
[缓存未命中] → Doubao-Vision API调用
    ↓
结果解析 → 结构化VisionResult
    ↓
写入Redis缓存（ttl=7天）
    ↓
写入t_vision_result表（持久化）
    ↓
返回用户
```

### 2.2 数据库表设计

```sql
-- t_vision_result (视觉结果缓存)
CREATE TABLE IF NOT EXISTS t_vision_result (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    image_hash VARCHAR(64) NOT NULL COMMENT '图片MD5/SHA256',
    image_url VARCHAR(512),
    task_type VARCHAR(32) NOT NULL COMMENT 'DEFECT_DETECT/STYLE_IDENTIFY/COLOR_CHECK',
    severity VARCHAR(16),
    confidence INT,
    report TEXT,
    recommendation TEXT,
    defects JSON,
    raw_response TEXT,
    cost DECIMAL(10,4) COMMENT '调用成本',
    tokens INT COMMENT 'token消耗',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_vr_tenant_hash (tenant_id, image_hash),
    INDEX idx_vr_tenant_created (tenant_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- t_vision_feedback (视觉结果反馈)
CREATE TABLE IF NOT EXISTS t_vision_feedback (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    vision_result_id BIGINT NOT NULL,
    user_id VARCHAR(64),
    is_correct BOOLEAN COMMENT '用户标注结果正确',
    correct_severity VARCHAR(16),
    correction_note TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_vf_tenant_result (tenant_id, vision_result_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 2.3 功能开关

```yaml
smart.vision.real-model.enabled: false  # 初期关闭，验证后开启
smart.vision.cache.enabled: true       # 缓存默认开启
smart.vision.confidence-threshold: 70  # 低于70%建议人工复核
```

---

## 三、实施路线图

### Sprint 1 (第1周)
- [x] 调研GitHub前沿技术
- [ ] 升级 VisionAnalysisService
- [ ] 接入 Doubao-Vision API
- [ ] 实现图片预处理

### Sprint 2 (第2周)
- [ ] Redis缓存实现
- [ ] 成本追踪功能
- [ ] 置信度阈值配置

### Sprint 3 (第3-4周)
- [ ] 用户反馈闭环
- [ ] 服装缺陷测试集构建
- [ ] 准确率评估

### Future (数据积累后)
- [ ] 训练专用 YOLOv8 模型
- [ ] 混合方案实现
- [ ] 多模态RAG增强

---

## 四、风险与应对

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|---------|
| API限流 | 高 | 中 | 缓存+降级（提示用户稍后重试） |
| 成本超支 | 中 | 中 | 成本监控+租户级配额 |
| 准确率不足 | 高 | 高 | 置信度阈值+人工复核入口 |
| 网络不稳定 | 中 | 低 | 重试机制+降级（提示用户上传图片） |

---

## 五、结论

**推荐方案**：
1. **立即执行**：Doubao-Vision + Redis缓存
2. **短期优化**：置信度控制+用户反馈闭环
3. **长期规划**：专用YOLO模型+混合方案+多模态RAG

**预期收益**：
- 视觉检测准确率从 ~20% 提升至 ≥70%
- 用户满意度提升
- 质检效率提升
