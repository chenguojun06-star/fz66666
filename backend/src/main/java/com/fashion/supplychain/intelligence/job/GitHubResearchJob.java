package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import com.fashion.supplychain.intelligence.service.SelfEvolutionEngine;
import com.fashion.supplychain.intelligence.service.SelfEvolutionEngine.EvolutionProposal;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.LocalDateTime;
import java.util.concurrent.TimeUnit;

@Slf4j
@Component
public class GitHubResearchJob {

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;
    @Autowired
    private SelfEvolutionEngine evolutionEngine;
    @Autowired
    private JdbcTemplate jdbc;

    @Value("${xiaoyun.evolution.github-research-enabled:false}")
    private boolean researchEnabled;

    @Value("${xiaoyun.evolution.auto-deploy-enabled:false}")
    private boolean autoDeployEnabled;

    private static final String[] RESEARCH_TOPICS = {
            "AI agent self-evolution autonomous improvement",
            "RAG corrective retrieval augmented generation 2025",
            "LLM fact-checking grounded generation",
            "multi-agent orchestration production system",
            "structured output JSON schema LLM"
    };

    private static final String GITHUB_API = "https://api.github.com/search/repositories";

    @Scheduled(cron = "0 0 4 ? * MON")
    public void researchAndEvolve() {
        if (!researchEnabled) {
            log.debug("[GitHubResearch] 未启用，跳过");
            return;
        }

        log.info("[GitHubResearch] ===== 开始周度技术调研 =====");

        for (String topic : RESEARCH_TOPICS) {
            try {
                String researchResult = researchTopic(topic);
                if (researchResult != null && !researchResult.isBlank()) {
                    EvolutionProposal proposal = evolutionEngine.proposeFromResearch(researchResult);
                    if (proposal != null && proposal.confidence() >= 70) {
                        if (autoDeployEnabled) {
                            boolean deployed = evolutionEngine.deployProposal(proposal);
                            log.info("[GitHubResearch] 提案{} 自动部署结果: {}", proposal.id(), deployed);
                        } else {
                            evolutionEngine.testProposal(proposal);
                            log.info("[GitHubResearch] 提案{} 已测试，等待人工审批", proposal.id());
                        }
                    }
                }
                TimeUnit.SECONDS.sleep(3);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            } catch (Exception e) {
                log.warn("[GitHubResearch] 调研主题[{}]失败: {}", topic, e.getMessage());
            }
        }

        log.info("[GitHubResearch] ===== 周度技术调研完成 =====");
    }

    @Scheduled(cron = "0 40 4 * * ?")
    public void evolveFromFeedback() {
        if (!researchEnabled) return;

        log.info("[GitHubResearch] ===== 开始基于反馈的自进化 =====");
        try {
            EvolutionProposal proposal = evolutionEngine.proposeFromFeedback();
            if (proposal != null) {
                evolutionEngine.testProposal(proposal);
                log.info("[GitHubResearch] 反馈进化提案: id={} category={}", proposal.id(), proposal.category());
            }
        } catch (Exception e) {
            log.warn("[GitHubResearch] 反馈进化失败: {}", e.getMessage());
        }
    }

    private String researchTopic(String topic) {
        try {
            String url = GITHUB_API + "?q=" + topic.replace(" ", "+")
                    + "&sort=stars&order=desc&per_page=5";
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Accept", "application/vnd.github.v3+json")
                    .header("User-Agent", "XiaoyunAI-EvolutionEngine")
                    .GET()
                    .build();

            HttpClient client = HttpClient.newHttpClient();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                return analyzeResearchResult(topic, response.body());
            } else {
                log.debug("[GitHubResearch] GitHub API返回{}: {}", response.statusCode(), topic);
                return null;
            }
        } catch (Exception e) {
            log.debug("[GitHubResearch] 调研[{}]异常: {}", topic, e.getMessage());
            return null;
        }
    }

    private String analyzeResearchResult(String topic, String githubJson) {
        String systemPrompt = "你是小云AI技术调研分析师。分析GitHub搜索结果，提取对服装供应链AI系统有用的技术方向。\n"
                + "要求：\n"
                + "1. 只关注可直接落地的技术（不要纯学术研究）\n"
                + "2. 重点关注：减少幻觉、提高数据准确性、自动化运维、智能推荐\n"
                + "3. 给出具体可实施的方案（不是泛泛而谈）\n"
                + "4. 控制在200字以内\n";

        String userPrompt = "调研主题: " + topic + "\n\nGitHub搜索结果:\n"
                + (githubJson.length() > 3000 ? githubJson.substring(0, 3000) : githubJson);

        try {
            IntelligenceInferenceResult result = inferenceOrchestrator.chat(
                    "github_research", systemPrompt, userPrompt);
            if (result != null && result.isSuccess() && result.getContent() != null) {
                String analysis = result.getContent().trim();
                saveResearchResult(topic, analysis);
                return analysis;
            }
        } catch (Exception e) {
            log.debug("[GitHubResearch] 分析失败: {}", e.getMessage());
        }
        return null;
    }

    private void saveResearchResult(String topic, String analysis) {
        try {
            jdbc.update(
                    "INSERT INTO t_xiaoyun_evolution_log "
                            + "(id, category, description, before_state, after_state, "
                            + "confidence, source, status, created_at) "
                            + "VALUES (?,?,?,?,?,?,?,?,?)",
                    "res_" + System.currentTimeMillis(), "github_research",
                    "技术调研: " + topic, "", analysis,
                    0, "github_api", "RESEARCH", LocalDateTime.now());
        } catch (Exception e) {
            log.debug("[GitHubResearch] 保存调研结果失败: {}", e.getMessage());
        }
    }
}
