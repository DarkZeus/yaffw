export type RuntimeCapabilitySnapshot = {
  fileApi: boolean
  mediaSource: boolean
  objectUrl: boolean
  videoDecoder: boolean
  videoEncoder: boolean
}

export type RuntimeCapabilityName = keyof RuntimeCapabilitySnapshot

export type RuntimeCapabilitySource = {
  File?: unknown
  MediaSource?: unknown
  URL?: {
    createObjectURL?: unknown
    revokeObjectURL?: unknown
  }
  VideoDecoder?: unknown
  VideoEncoder?: unknown
}

export type SupportedRuntime = {
  capabilities: RuntimeCapabilitySnapshot
  missing: []
  supported: true
}

export type UnsupportedRuntime = {
  capabilities: RuntimeCapabilitySnapshot
  missing: RuntimeCapabilityName[]
  reason: string
  supported: false
}

export type RuntimeSupport = SupportedRuntime | UnsupportedRuntime

const capabilityLabels: Record<RuntimeCapabilityName, string> = {
  fileApi: 'File API',
  mediaSource: 'MediaSource',
  objectUrl: 'object URL support',
  videoDecoder: 'WebCodecs VideoDecoder',
  videoEncoder: 'WebCodecs VideoEncoder',
}

export function readRuntimeCapabilities(
  source: RuntimeCapabilitySource = globalThis as RuntimeCapabilitySource,
): RuntimeCapabilitySnapshot {
  return {
    fileApi: typeof source.File === 'function',
    mediaSource: typeof source.MediaSource === 'function',
    objectUrl:
      typeof source.URL?.createObjectURL === 'function' &&
      typeof source.URL.revokeObjectURL === 'function',
    videoDecoder: typeof source.VideoDecoder === 'function',
    videoEncoder: typeof source.VideoEncoder === 'function',
  }
}

export function detectRuntimeSupport(
  source?: RuntimeCapabilitySource,
): RuntimeSupport {
  return evaluateRuntimeSupport(readRuntimeCapabilities(source))
}

export function evaluateRuntimeSupport(
  capabilities: RuntimeCapabilitySnapshot,
): RuntimeSupport {
  const missing = Object.entries(capabilities)
    .filter(([, available]) => !available)
    .map(([name]) => name as RuntimeCapabilityName)

  if (missing.length === 0) {
    return {
      capabilities,
      missing: [],
      supported: true,
    }
  }

  return {
    capabilities,
    missing,
    reason: `Editor-next requires a browser with WebCodecs and local media APIs. Missing: ${missing
      .map((name) => capabilityLabels[name])
      .join(', ')}.`,
    supported: false,
  }
}
