import { App, TFile } from 'obsidian'
import SyncReport from './sync_report'

const PATH = 'BookFusion Sync Log.md'

export default class SyncReportPrinter {
  app: App

  constructor (app: App) {
    this.app = app
  }

  async append (report: SyncReport): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(PATH)

    if (file == null) {
      await this.app.vault.create(PATH, '')
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
