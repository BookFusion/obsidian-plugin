import { App, TFile, normalizePath, parseYaml } from 'obsidian'
import { AtomicHighlightPage, BookPage, HighlightBlock, SomeHighlight } from 'src/bookfusion_api'
import UpdateStrategy from './update_strategy'
import { DoublyLinkedList, ListNode, formatHighlightContent, formatHighlightLink, replaceBlock } from 'src/utils'
import BookFusionPlugin from 'main'
import logger from 'src/logger'

interface ExtractedHighlight {
  id: string
  index: number
  text: string
}

interface UpdateResult {
  changesCount: number
  text: string
}

export default class SmartStrategy extends UpdateStrategy {
  /**
   * Switch Magic Update / Smart Insert
  */
  replace: boolean

  constructor (plugin: BookFusionPlugin, app: App, replace: boolean = true) {
    super(plugin, app)

    this.replace = replace
  }

  async modifyBookPage (page: BookPage, file: TFile): Promise<TFile> {
    if (this.replace) {
      await this.replaceBook(page, file)
    }

    const { highlights } = page

    if (page.atomic_highlights) {
      await this.replaceAtomicHighlights(highlights as AtomicHighlightPage[], file)

      const content = await this.app.vault.read(file)
      const { text } = this.updateContentWith(content, highlights, formatHighlightLink)

      await this.app.vault.modify(file, text)
    } else {
      await this.replaceHighlights(highlights as HighlightBlock[], file)
    }

    return file
  }

  private async replaceBook (page: BookPage, file: TFile): Promise<void> {
    const content = await this.app.vault.read(file)
    const newContent = replaceBlock(content, page.id, String(page.content))

    if (this.replace) {
      try {
        let oldFrontMatter, newFrontMatter
        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
          oldFrontMatter = JSON.stringify(frontmatter)
          Object.assign(frontmatter, parseYaml(String(page.frontmatter)))
          newFrontMatter = JSON.stringify(frontmatter)
        })

        if (oldFrontMatter !== newFrontMatter) {
          this.plugin.events.emit('bookModified', { filePath: file.path })
        }
      } catch (error) {
        logger.error(error)
        this.plugin.events.emit('bookFailed', { filePath: file.path, error })
      }
    }

    if (content.trim() !== newContent.trim()) {
      await this.app.vault.modify(file, newContent)
      this.plugin.events.emit('bookModified', { filePath: file.path })
    }
  }

  private async replaceAtomicHighlights (highlights: AtomicHighlightPage[], file: TFile): Promise<void> {
    for (const highlight of highlights) {
      const dirPath = normalizePath(String(highlight.directory))
      const filePath = normalizePath(dirPath + '/' + String(highlight.filename))

      if (this.app.vault.getAbstractFileByPath(dirPath) == null) {
        await this.plugin.tryCreateFolder(dirPath)
      }

      const highlightFile = this.app.vault.getAbstractFileByPath(filePath)

      if (highlightFile instanceof TFile) {
        if (!this.replace) continue

        const content = await this.app.vault.read(highlightFile)
        const newContent = replaceBlock(content, highlight.id, highlight.content)

        if (content.trim() !== newContent.trim()) {
          await this.app.vault.modify(highlightFile, newContent)
          this.plugin.events.emit('highlightModified', { filePath: file.path })
        }
      } else if (highlightFile == null) {
        await this.app.vault.create(filePath, this.wrapWithMagicComment(highlight.id, highlight.content))
        this.plugin.events.emit('highlightModified', { filePath: file.path })
      }
    }
  }

  private async replaceHighlights (highlights: HighlightBlock[], file: TFile): Promise<void> {
    if (highlights.length === 0) {
      return
    }

    const content = await this.app.vault.read(file)
    const { text, changesCount } = this.updateContentWith(content, highlights, formatHighlightContent)

    await this.app.vault.modify(file, text)

    this.plugin.events.emit('highlightModified', { filePath: file.path, count: changesCount })
  }

  private updateContentWith (content: string, highlights: SomeHighlight[], formatter: (highlight: SomeHighlight) => string): UpdateResult {
    const slices = this.extractHighlightFragments(content)
    const nodesMap = new Map<string, ListNode<ExtractedHighlight>>()
    const nodesDLL = new DoublyLinkedList<ExtractedHighlight>()
    let changesCount = 0

    slices.forEach((value) => {
      nodesMap.set(value.id, nodesDLL.append(value))
    })

    for (const highlight of highlights.reverse()) {
      const highlightContent = formatter(highlight)
      let target = nodesMap.get(highlight.id)

      if (target != null) {
        if (this.replace) {
          target.value.text = replaceBlock(target.value.text, highlight.id, highlightContent)
          changesCount++
        }

        continue
      }

      const value = { id: highlight.id, index: -1, text: this.wrapWithMagicComment(highlight.id, highlightContent) }

      if (highlight.next != null) {
        target = nodesMap.get(highlight.next)
      }
      if (target != null) {
        nodesMap.set(highlight.id, nodesDLL.insertBefore(target, value))
        changesCount++
        continue
      }

      if (highlight.previous != null) {
        target = nodesMap.get(highlight.previous)
      }
      if (target != null) {
        nodesMap.set(highlight.id, nodesDLL.insertAfter(target, value))
        changesCount++
        continue
      }

      nodesMap.set(highlight.id, nodesDLL.append(value))
      changesCount++
    }

    let modifiedContent = content.slice(0, slices[0]?.index)

    for (const value of nodesDLL) {
      modifiedContent += value.text

      if (!modifiedContent.endsWith('\n')) {
        modifiedContent += '\n'
      }
    }

    return { text: modifiedContent, changesCount }
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
