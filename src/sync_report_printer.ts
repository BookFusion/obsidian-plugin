import { App, TFile, TFolder, normalizePath } from 'obsidian'
import SyncReport from './sync_report'
import { BookFusionPlugin } from './plugin'

export default class SyncReportPrinter {
  plugin: BookFusionPlugin
  app: App

  constructor (plugin: BookFusionPlugin) {
    this.plugin = plugin
    this.app = plugin.app
  }

  async append (report: SyncReport): Promise<void> {
    const path = normalizePath(this.plugin.settings.syncLogPath)
    const file = this.app.vault.getAbstractFileByPath(path)

    if (file == null) {
      const [folderName, fileName] = path.split('/')

      if (fileName !== '') {
        const folder = this.app.vault.getAbstractFileByPath(folderName)

        if (!(folder instanceof TFolder)) {
          await this.app.vault.createFolder(folderName)
        }
      }

      await this.app.vault.create(path, this.format(report))
    } else if (file instanceof TFile) {
      await this.app.vault.append(file, this.format(report))
    } else {
      throw new Error('Not a file')
    }
  }

  private format (report: SyncReport): string {
    if (!report.isPrintable()) {
      return ''
    }

    const groupedByPath = new Map<string, number>()

    report.booksCreated.forEach(({ path }) => groupedByPath.set(path, 0))
    report.booksModified.forEach(({ path }) => groupedByPath.set(path, 0))
    report.highlightsModified.forEach((highlightsNumber, bookPath) => groupedByPath.set(bookPath, highlightsNumber))

    let data = `## ${new Date().toLocaleString()}\n`

    groupedByPath.forEach((highlightsNumber, bookPath) => {
      let link = '-'
      const file = this.app.vault.getAbstractFileByPath(bookPath)

      if (file instanceof TFile) {
        link = `[Open](obsidian://open?file=${encodeURIComponent(file.path)})`
        data += `- ${file.basename} ${link} ${highlightsNumber}\n`
      } else {
        data += `- ${bookPath} ${highlightsNumber}\n`
      }
    })

    return data
  }
}
