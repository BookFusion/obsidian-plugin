import { Modal } from 'obsidian'
import SyncReport from './sync_report'

export default class ReportModal extends Modal {
  display (report: SyncReport): void {
    if (report.isEmpty()) return

    this.open()

    this.titleEl.setText('Sync Report')

    if (report.booksCreated.length > 0) {
      const details = this.contentEl.createEl('details')
      details.createEl('summary', { text: `${report.booksCreated.length} books added` })

      const list = details.createEl('ul')

      report.booksCreated.forEach(({ path }) => {
        list.createEl('li', { text: path })
      })
    }

    if (report.booksModified.length > 0) {
      const details = this.contentEl.createEl('details')
      details.createEl('summary', { text: `${report.booksModified.length} book(s) modified` })

      const list = details.createEl('ul')

      report.booksModified.forEach(({ path }) => {
        list.createEl('li', { text: path })
      })
    }

    if (report.booksFailed.length > 0) {
      const details = this.contentEl.createEl('details')
      details.createEl('summary', { text: `${report.booksFailed.length} book(s) failed. See logs in console` })

      const list = details.createEl('ul')

      report.booksFailed.forEach(({ path, error }) => {
        if (path != null) {
          const item = list.createEl('li')
          item.appendText(path)
          item.createEl('br')
          item.appendText(`${error.name}: ${error.message}`)
        }
      })
    }

    if (report.highlightsAdded.size > 0) {
      const list = this.contentEl.ownerDocument.createElement('ul')
      let total = 0

      for (const entry of report.highlightsAdded) {
        const [path, value] = entry
        list.createEl('li').appendText(`${value} — ${path}`)
        total += value
      }

      const details = this.contentEl.createEl('details')
      details.createEl('summary', { text: `${total} highlight(s) added` })
      details.appendChild(list)
    }
  }
}
