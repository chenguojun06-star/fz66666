import React from 'react';

export const IntelligenceCenter = React.lazy(() => import('./pages/IntelligenceCenter'));
export const PatrolActionCenter = React.lazy(() => import('./pages/PatrolActionCenter'));
export const AiAgentTraceCenter = React.lazy(() => import('./pages/AiAgentTraceCenter/index'));
export const CockpitPage = React.lazy(() => import('./pages/Cockpit'));
export const PlatformDashboard = React.lazy(() => import('./pages/PlatformDashboard'));
