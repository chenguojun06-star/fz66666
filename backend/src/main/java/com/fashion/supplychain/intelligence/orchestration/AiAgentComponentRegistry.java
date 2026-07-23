package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.agent.router.SemanticDomainRouter;
import com.fashion.supplychain.intelligence.agent.dag.SwarmExecutionEngine;
import com.fashion.supplychain.intelligence.mapper.AiLongMemoryMapper;
import com.fashion.supplychain.intelligence.service.*;
import com.fashion.supplychain.intelligence.upgrade.phase3.IntentDrivenDagService;
import com.fashion.supplychain.intelligence.upgrade.phase3.TreeOfThoughtsEngine;
import com.fashion.supplychain.intelligence.upgrade.phase4.DagVisualizationService;
import com.fashion.supplychain.intelligence.upgrade.phase4.GraphOfThoughtsEngine;
import com.fashion.supplychain.intelligence.helper.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

import java.util.function.Supplier;

@Slf4j
@Component
@Lazy
public class AiAgentComponentRegistry {

    @Autowired(required = false)
    private ConversationReflectionOrchestrator reflectionOrchestrator;
    @Autowired(required = false)
    private SessionSearchService sessionSearchService;
    @Autowired(required = false)
    private SkillEvolutionOrchestrator skillEvolutionOrchestrator;
    @Autowired(required = false)
    private MemoryNudgeOrchestrator memoryNudgeOrchestrator;
    @Autowired(required = false)
    private UserProfileEvolutionOrchestrator userProfileEvolutionOrchestrator;
    @Autowired(required = false)
    private AgentContextFileService agentContextFileService;
    @Autowired(required = false)
    private KnowledgeBaseService knowledgeBaseService;
    @Autowired(required = false)
    private PromptTemplateLoader promptTemplateLoader;
    @Autowired(required = false)
    private AiAgentPromptHelper aiAgentPromptHelper;
    @Autowired(required = false)
    private ModelSelectionRouter modelSelectionRouter;
    @Autowired(required = false)
    private CostExplosionGuard costExplosionGuard;
    @Autowired(required = false)
    private SelfCriticService selfCriticService;
    @Autowired(required = false)
    private RealTimeLearningLoop realTimeLearningLoop;
    @Autowired(required = false)
    private QuickPathQualityGate quickPathQualityGate;
    @Autowired(required = false)
    private GoldenEvalService goldenEvalService;
    @Autowired(required = false)
    private GuardrailsConfigService guardrailsConfigService;
    @Autowired(required = false)
    private StructuredOutputEnforcer structuredOutputEnforcer;
    @Autowired(required = false)
    private QuickAnswerCacheService quickAnswerCacheService;
    @Autowired(required = false)
    private MemoryBankService memoryBankService;
    @Autowired(required = false)
    private SkillAutoCreationService skillAutoCreationService;
    @Autowired(required = false)
    private EntityMemoryContextService entityMemoryContextService;
    @Autowired(required = false)
    private AiLongMemoryMapper longMemoryMapper;
    @Autowired(required = false)
    private TreeOfThoughtsEngine treeOfThoughtsEngine;
    @Autowired(required = false)
    private GraphOfThoughtsEngine graphOfThoughtsEngine;
    @Autowired(required = false)
    private IntentDrivenDagService intentDrivenDagService;
    @Autowired(required = false)
    private DagVisualizationService dagVisualizationService;
    @Autowired(required = false)
    private SemanticDomainRouter semanticDomainRouter;
    @Autowired(required = false)
    private MultiAgentGraphOrchestrator multiAgentGraphOrchestrator;
    @Autowired(required = false)
    private SwarmExecutionEngine swarmExecutionEngine;
    @Autowired(required = false)
    private IntentCompositionService intentCompositionService;

    public ConversationReflectionOrchestrator getReflectionOrchestrator() {
        return reflectionOrchestrator;
    }

    public SessionSearchService getSessionSearchService() {
        return sessionSearchService;
    }

    public SkillEvolutionOrchestrator getSkillEvolutionOrchestrator() {
        return skillEvolutionOrchestrator;
    }

    public MemoryNudgeOrchestrator getMemoryNudgeOrchestrator() {
        return memoryNudgeOrchestrator;
    }

    public UserProfileEvolutionOrchestrator getUserProfileEvolutionOrchestrator() {
        return userProfileEvolutionOrchestrator;
    }

    public AgentContextFileService getAgentContextFileService() {
        return agentContextFileService;
    }

    public KnowledgeBaseService getKnowledgeBaseService() {
        return knowledgeBaseService;
    }

    public PromptTemplateLoader getPromptTemplateLoader() {
        return promptTemplateLoader;
    }

    public AiAgentPromptHelper getAiAgentPromptHelper() {
        return aiAgentPromptHelper;
    }

    public ModelSelectionRouter getModelSelectionRouter() {
        return modelSelectionRouter;
    }

    public CostExplosionGuard getCostExplosionGuard() {
        return costExplosionGuard;
    }

    public SelfCriticService getSelfCriticService() {
        return selfCriticService;
    }

    public RealTimeLearningLoop getRealTimeLearningLoop() {
        return realTimeLearningLoop;
    }

    public QuickPathQualityGate getQuickPathQualityGate() {
        return quickPathQualityGate;
    }

    public GoldenEvalService getGoldenEvalService() {
        return goldenEvalService;
    }

    public GuardrailsConfigService getGuardrailsConfigService() {
        return guardrailsConfigService;
    }

    public StructuredOutputEnforcer getStructuredOutputEnforcer() {
        return structuredOutputEnforcer;
    }

    public QuickAnswerCacheService getQuickAnswerCacheService() {
        return quickAnswerCacheService;
    }

    public MemoryBankService getMemoryBankService() {
        return memoryBankService;
    }

    public SkillAutoCreationService getSkillAutoCreationService() {
        return skillAutoCreationService;
    }

    public EntityMemoryContextService getEntityMemoryContextService() {
        return entityMemoryContextService;
    }

    public AiLongMemoryMapper getLongMemoryMapper() {
        return longMemoryMapper;
    }

    public TreeOfThoughtsEngine getTreeOfThoughtsEngine() {
        return treeOfThoughtsEngine;
    }

    public GraphOfThoughtsEngine getGraphOfThoughtsEngine() {
        return graphOfThoughtsEngine;
    }

    public IntentDrivenDagService getIntentDrivenDagService() {
        return intentDrivenDagService;
    }

    public DagVisualizationService getDagVisualizationService() {
        return dagVisualizationService;
    }

    public SemanticDomainRouter getSemanticDomainRouter() {
        return semanticDomainRouter;
    }

    public MultiAgentGraphOrchestrator getMultiAgentGraphOrchestrator() {
        return multiAgentGraphOrchestrator;
    }

    public SwarmExecutionEngine getSwarmExecutionEngine() {
        return swarmExecutionEngine;
    }

    public IntentCompositionService getIntentCompositionService() {
        return intentCompositionService;
    }

    public <T> T safeGet(Supplier<T> provider, String componentName) {
        try {
            T result = provider.get();
            if (result == null) {
                log.debug("[ComponentRegistry] {} 未配置", componentName);
            }
            return result;
        } catch (Exception e) {
            log.debug("[ComponentRegistry] 获取 {} 失败: {}", componentName, e.getMessage());
            return null;
        }
    }
}