import { TFile, normalizePath } from 'obsidian'
import { BookPage, HighlightBlock } from 'src/bookfusion_api'
import UpdateStrategy from './update_strategy'
import { DoublyLinkedList, ListNode, replaceBlock, wrapWithMagicComment } from 'src/utils'

interface ExtractedHighlight {
  id: string
  index: number
  text: string
}

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

  private async replaceBook (page: BookPage, file: TFile): Promise<void> {
    const content = await this.app.vault.read(file)
    const newContent = replaceBlock(content, page.id, String(page.content))

    if (content.trim() !== newContent.trim()) {
      await this.app.vault.modify(file, newContent)
      this.plugin.events.emit('bookModified', { filePath: file.path })
    }
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
        const content = await this.app.vault.read(highlightFile)
        const newContent = replaceBlock(content, highlight.id, highlight.content)

        if (content.trim() !== newContent.trim()) {
          await this.app.vault.modify(highlightFile, newContent)
          this.plugin.events.emit('highlightModified', { filePath: file.path })
        }
      } else if (highlightFile == null) {
        await this.app.vault.create(filePath, wrapWithMagicComment(highlight.id, highlight.content))
        this.plugin.events.emit('highlightModified', { filePath: file.path })
      }
    }
  }

  private async replaceHighlights (highlights: HighlightBlock[], file: TFile): Promise<void> {
    if (highlights.length === 0) {
      return
    }

    const content = await this.app.vault.read(file)
    const slices = this.extractHighlightFragments(content)
    const nodesMap = new Map<string, ListNode<ExtractedHighlight>>()
    const nodesDLL = new DoublyLinkedList<ExtractedHighlight>()

    slices.forEach((value) => {
      nodesMap.set(value.id, nodesDLL.append(value))
    })

    for (const highlight of highlights.reverse()) {
      let highlightContent
      if (highlight.chapter_heading != null) {
        highlightContent = `${highlight.chapter_heading}\n${highlight.content}`
      } else {
        highlightContent = highlight.content
      }

      let target = nodesMap.get(highlight.id)

      if (target != null) {
        target.value.text = replaceBlock(target.value.text, highlight.id, highlightContent)
        continue
      }

      const value = { id: highlight.id, index: -1, text: wrapWithMagicComment(highlight.id, highlightContent) }

      if (highlight.next != null) {
        target = nodesMap.get(highlight.next)
      }
      if (target != null) {
        nodesMap.set(highlight.id, nodesDLL.insertBefore(target, value))
        continue
      }

      if (highlight.previous != null) {
        target = nodesMap.get(highlight.previous)
      }
      if (target != null) {
        nodesMap.set(highlight.id, nodesDLL.insertAfter(target, value))
        continue
      }

      nodesMap.set(highlight.id, nodesDLL.append(value))
    }

    let modifiedContent = content.slice(0, slices[0]?.index)

    for (const value of nodesDLL) {
      modifiedContent += value.text

      if (!modifiedContent.endsWith('\n')) {
        modifiedContent += '\n'
      }
    }

    await this.app.vault.modify(file, modifiedContent)

    this.plugin.events.emit('highlightModified', { filePath: file.path })
  }

  private extractHighlightFragments (text: string): ExtractedHighlight[] {
    const matches = Array.from(text.matchAll(/%%begin-(?<id>highlight-.+)%%/g))
    const result = []

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i]

      result.push({
        id: String(match.groups?.id),
        index: Number(match.index),
        text: text.slice(match.index, matches[i + 1]?.index)
      })
    }

    return result
  }
}
