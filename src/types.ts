export interface ModelOptions {
  name?: string
  context?: number
  output?: number
  reasoning?: boolean
  toolCall?: boolean
  compatibility?: Record<string, unknown>
}

export interface PluginOptions {
  settingsPath?: string
  providerId?: string
  defaultModel?: string
  smallModel?: string
  models?: Record<string, ModelOptions>
}

export interface NormalizedModel {
  name: string
  context: number
  output: number
  reasoning: boolean
  toolCall: boolean
  compatibility?: Record<string, unknown>
}

export interface NormalizedOptions {
  settingsPath?: string
  providerId: string
  defaultModel: string
  smallModel: string
  models: Record<string, NormalizedModel>
}
