import { App, TFile, TFolder } from 'obsidian'
import SyncReport from './sync_report'

const PATH = 'BookFusion Sync Log.md'

export default class SyncReportPrinter {
  app: App

  constructor (app: App) {
    this.app = app
  }

  async append (report: SyncReport): Promise<void> {
    let file = this.app.vault.getAbstractFileByPath(PATH)

    if (file == null) {
      file = await this.app.vault.create(PATH, '')
    } else if (file instanceof TFolder) {
      throw new Error('There is folder instead of file.')
    }

    await this.app.vault.append(file as TFile, this.format(report))
  }

  private format (report: SyncReport): string {
    if (!report.isPrintable()) {
      return ''
    }

    const groupedByPath = new Map<string, number>()

    report.booksCreated.forEach(({ path }) => groupedByPath.set(path, 0))
    report.booksModified.forEach(({ path }) => groupedByPath.set(path, 0))
    report.highlightsModified.forEach((highlightsNumber, bookPath) => groupedByPath.set(bookPath, highlightsNumber))

    let data = `## ${new Date().toLocaleString()}\n| Books | Highlights |\n| - | - |\n`

    groupedByPath.forEach((highlightsNumber, bookPath) => {
      data += `| ${bookPath} | ${highlightsNumber} |\n`
    })

    return data
  }
}
