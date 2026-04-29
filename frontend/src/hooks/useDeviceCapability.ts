import { useMemo } from 'react';

export type DeviceTier = 'high' | 'medium' | 'low';

export interface DeviceCapability {
  tier: DeviceTier;
  cores: number;
  memory: number | null;
  isLowEnd: boolean;
  prefersReducedMotion: boolean;
  isSlowConnection: boolean;
  hardwareConcurrency: number;
  deviceMemory: number | null;
  gpuRenderer: string;
}

function detectGpuRenderer(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return 'none';
    const ext = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
    if (!ext) return 'unknown';
    return (gl as WebGLRenderingContext).getParameter(ext.UNMASKED_RENDERER_WEBGL) || 'unknown';
  } catch {
    return 'unknown';
  }
}

function detectConnection(): boolean {
  try {
    const nav = navigator as any;
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
    if (!conn) return false;
    if (conn.saveData) return true;
    const effectiveType = conn.effectiveType;
    return effectiveType === 'slow-2g' || effectiveType === '2g' || effectiveType === '3g';
  } catch {
    return false;
  }
}

function computeTier(cores: number, memory: number | null, prefersReducedMotion: boolean): DeviceTier {
  let score = 0;

  if (cores >= 8) score += 3;
  else if (cores >= 4) score += 2;
  else if (cores >= 2) score += 1;

  if (memory !== null) {
    if (memory >= 8) score += 3;
    else if (memory >= 4) score += 2;
    else if (memory >= 2) score += 1;
  } else {
    score += 2;
  }

  if (prefersReducedMotion) score -= 1;

  if (score >= 5) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}

let cachedCapability: DeviceCapability | null = null;

export function detectDeviceCapability(): DeviceCapability {
  if (cachedCapability) return cachedCapability;

  const cores = navigator.hardwareConcurrency || 2;
  const nav = navigator as any;
  const memory: number | null = nav.deviceMemory ?? null;
  const prefersReducedMotion = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
  const isSlowConnection = detectConnection();
  const gpuRenderer = detectGpuRenderer();
  const tier = computeTier(cores, memory, prefersReducedMotion);

  cachedCapability = {
    tier,
    cores,
    memory,
    isLowEnd: tier === 'low',
    prefersReducedMotion,
    isSlowConnection,
    hardwareConcurrency: cores,
    deviceMemory: memory,
    gpuRenderer,
  };

  return cachedCapability;
}

export function useDeviceCapability(): DeviceCapability {
  return useMemo(() => detectDeviceCapability(), []);
}

export function isLowEndDevice(): boolean {
  return detectDeviceCapability().isLowEnd;
}
