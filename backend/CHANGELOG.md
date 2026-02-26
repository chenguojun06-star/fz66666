# Changelog

All notable changes to this project will be documented in this file.

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
