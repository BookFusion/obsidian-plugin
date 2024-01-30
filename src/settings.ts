export interface BookFusionPluginSettings {
  token: string | null
  cursor: string | null
}

export const DEFAULT_SETTINGS: Partial<BookFusionPluginSettings> = {
  token: null,
  cursor: null
}
