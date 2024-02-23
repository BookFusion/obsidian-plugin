import BookFusionPlugin from 'main'
import { App, TFile } from 'obsidian'
import { BookPage } from 'src/bookfusion_api'

export type UpdateStrategyId = 'append' | 'replace' | 'magic' | 'insert'

export default abstract class UpdateStrategy {
  plugin: BookFusionPlugin
  app: App

  constructor (plugin: BookFusionPlugin, app: App) {
    this.plugin = plugin
    this.app = app
  }

  async modifyBookPage (page: BookPage, file: TFile): Promise<TFile> {
    throw new Error('Method not implemented.')
  }
}
