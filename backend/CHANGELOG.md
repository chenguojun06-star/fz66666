# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2026-03-07

### 🧭 Action Center Enabled
- Added `ActionCenterOrchestrator` to aggregate production, factory, anomaly, notification, and finance-audit signals into one unified action queue.
- Added `FollowupTaskOrchestrator` to convert domain risks into normalized follow-up tasks and brain actions.
- Added `SmartEscalationOrchestrator` to centralize escalation level and due-hint rules.
- Added `GET /api/intelligence/action-center` to expose the current action-center snapshot.
- Updated `IntelligenceBrainOrchestrator` so business actions are delegated to the action-center layer instead of being assembled inline.
- Extended the action pipeline with `FinanceAuditOrchestrator` findings so finance review tasks join the same intelligent execution surface.

### 📈 Why This Helps
- Moves the intelligence module from signal reporting toward concrete next-step generation.
- Keeps action building, escalation policy, and brain aggregation isolated in separate orchestrators.
- Creates a stable backend boundary for future persistent tasks, approval loops, and durable execution.

### 🧠 Intelligence Brain Skeleton
- Added `IntelligenceBrainOrchestrator` to aggregate health, pulse, delivery risk, anomaly, notification, and learning signals into one unified snapshot.
- Added `IntelligenceBrainSnapshotResponse` as the backend DTO for a single AI brain view.
- Added `GET /api/intelligence/brain/snapshot` to expose the current tenant brain snapshot.

### ✨ Improvements
- Promoted tenant smart feature flags into the unified intelligence control surface.
- Established the backend foundation for future action center, signal center, and learning loop work.

### 📈 Impact
- The intelligence module now has a central entry instead of only scattered point capabilities.
- Future frontend cockpit and mini-program guidance can consume a single source of intelligent system state.

### 🧩 Independent Orchestration Hardening
- Added `IntelligenceModelGatewayOrchestrator` as an isolated orchestration boundary for future LiteLLM / unified model routing integration.
- Added `IntelligenceObservabilityOrchestrator` as an isolated orchestration boundary for AI observability providers such as OpenLIT / Langfuse / OTel.
- Extended `IntelligenceBrainSnapshotResponse` with `modelGateway` and `observability` summaries.
- Updated `IntelligenceBrainOrchestrator` to expose gateway/observability readiness as low-priority signals and setup actions.
- Added default-off `ai.gateway.*` and `ai.observability.*` settings to keep current production behavior unchanged until explicitly enabled.

### 📈 Why It Helps
- Keeps future AI infrastructure concerns out of core business orchestrators.
- Preserves the current Java orchestration architecture while preparing safe integration points.
- Makes the next phase of AI rollout feature-flagged and low-risk.

### 🧠 Real Inference Path Enabled
- Added `IntelligenceInferenceOrchestrator` to centralize AI inference routing.
- Added `IntelligenceInferenceResult` to carry provider, model, fallback, latency, and error metadata.
- Refactored `AiAdvisorService` to delegate real inference calls to the orchestration layer instead of direct point-to-point HTTP logic.
- Extended `IntelligenceObservabilityOrchestrator` with unified invocation logging via `recordInvocation()`.
- Enhanced `/api/intelligence/ai-advisor/status` to surface current gateway and observability state.
- Added `ai.gateway.litellm.api-key` support for real LiteLLM virtual-key based routing.

### 📈 Why This Helps
- Establishes a real AI nerve path instead of only a configuration skeleton.
- Makes future AI use cases reusable across the intelligence module through one orchestrated inference path.
- Keeps model routing, fallback, and observability isolated from business controllers and services.

## [1.0.0] - 2026-02-26

### 🚀 Release
- **Version 1.0.0**: Initial stable release for cloud deployment.

### ✨ Features
- **Orchestrator Pattern**: Implemented 37 orchestrators to decouple business logic from controllers.
- **Consistency Job**: Added `ProductionDataConsistencyJob` to auto-repair production progress every 30 mins.
- **Security**: Removed unused dependencies and optimized logging configurations.

### 🐛 Fixes
- Fixed potential null pointer warnings in `CacheAspect` and `CommonController`.
- Removed dead code in `DashboardOrchestrator`.
