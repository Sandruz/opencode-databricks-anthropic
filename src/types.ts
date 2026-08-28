export interface ModelOptions {
  name?: string
  context?: number
  output?: number
  reasoning?: boolean
  toolCall?: boolean
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
}

export interface NormalizedOptions {
  settingsPath?: string
  providerId: string
  defaultModel: string
  smallModel: string
  models: Record<string, NormalizedModel>
}
