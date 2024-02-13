import { TFile, normalizePath } from 'obsidian'
import { BookPage, HighlightBlock } from 'src/bookfusion_api'
import UpdateStrategy from './update_strategy'
import { wrapWithMagicComment } from 'src/utils'

export default class MagicStrategy extends UpdateStrategy {
  async modifyBookPage (page: BookPage, file: TFile): Promise<TFile> {
    await this.replaceBook(page, file)

    const { highlights } = page
    const isAtomic = highlights[0]?.directory != null && highlights[0]?.filename != null

    if (isAtomic) {
      await this.replaceAtomicHighlights(highlights, file)
    } else {
      await this.replaceHighlights(highlights, file)
    }

    return file
  }

  private replaceBlock (content: string, id: string, fragment: string): string {
    const regexp = new RegExp(`%%begin-${id}%%[\\s\\S]*?%%end-${id}%%\\n{0,2}`)
    return content.replace(regexp, () => wrapWithMagicComment(id, fragment))
  }

  private async replaceBook (page: BookPage, file: TFile): Promise<void> {
    let content = await this.app.vault.read(file)

    if (content !== page.content) {
      content = this.replaceBlock(content, page.id, String(page.content))
      this.plugin.events.emit('bookModified', { filePath: file.path })
    }

    await this.app.vault.modify(file, content)
  }

  private async replaceAtomicHighlights (highlights: HighlightBlock[], file: TFile): Promise<void> {
    for (const highlight of highlights) {
      const dirPath = normalizePath(String(highlight.directory))
      const filePath = normalizePath(dirPath + '/' + String(highlight.filename))

      if (this.app.vault.getAbstractFileByPath(dirPath) == null) {
        await this.plugin.tryCreateFolder(dirPath)
      }

      const highlightFile = this.app.vault.getAbstractFileByPath(filePath)

      if (highlightFile instanceof TFile) {
        await this.app.vault.modify(highlightFile, highlight.content)
        this.plugin.events.emit('highlightModified', { filePath: file.path })
      } else if (highlightFile == null) {
        await this.app.vault.create(filePath, highlight.content)
        this.plugin.events.emit('highlightModified', { filePath: file.path })
      }
    }
  }

  private async replaceHighlights (highlights: HighlightBlock[], file: TFile): Promise<void> {
    if (highlights.length === 0) {
      return
    }

    let content = await this.app.vault.read(file)
    const magicRegexp = /%%begin-(highlight-.+)%%/g
    const magicIds = new Set()
    let match

    while ((match = magicRegexp.exec(content)) != null) {
      magicIds.add(match[1])
    }

    for (const highlight of highlights) {
      if (magicIds.has(highlight.id)) {
        content = this.replaceBlock(content, highlight.id, highlight.content)
      } else {
        content += wrapWithMagicComment(highlight.id, highlight.content)
      }
    }

    await this.app.vault.modify(file, content)

    this.plugin.events.emit('highlightModified', { filePath: file.path })
  }
}
