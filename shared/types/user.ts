// 用户 AI 相关配置，前后端共享。
export interface AiSetting {
  geminiKey?: string
}

// 设置 AI 配置的请求体。
export class SetAiSettingDto {
  geminiKey?: string
}

// 读取 AI 配置的返回体。
export interface AiSettingResult {
  aiSetting: AiSetting
}
