export interface BookFusionPluginSettings {
  token: string | null
  cursor: string | null
  syncInterval: number | null
  nextSyncAt: number | null
  syncLogEnabled: boolean | null
}

export const DEFAULT_SETTINGS: Partial<BookFusionPluginSettings> = {
  token: null,
  cursor: null,
  syncInterval: null,
  nextSyncAt: null,
  syncLogEnabled: false
}
