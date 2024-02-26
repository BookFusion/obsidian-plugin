import { requestUrl } from 'obsidian'
import { UpdateStrategyId } from './update_strategy/update_strategy'

/* eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing */
export const BASE_URL = process.env.BOOKFUSION_URL || 'https://www.bookfusion.com'
const SYNC_URL = new URL('/obsidian-api/sync', BASE_URL)

export interface Page {
  type: string
  content: string | null
  directory: string
  filename: string
  update_strategy: UpdateStrategyId
}

export interface BookPage extends Page {
  id: string
  type: 'book'
  frontmatter: string | null
  highlights: SomeHighlight[]
  atomic_highlights: boolean
}

export interface IndexPage extends Page {
  type: 'index'
}

export interface HighlightBlock {
  id: string
  content: string
  chapter_heading: string | null
  /**
   * For Magic update policy. Block id of previous expected highlight.
   */
  previous: string | null
  /**
   * For Magic update policy. Block id of next expected highlight.
   */
  next: string | null
}

export interface AtomicHighlightPage extends HighlightBlock {
  directory: string
  filename: string
  link: string
}

export type SomeHighlight = HighlightBlock | AtomicHighlightPage

interface SyncOptions {
  token: string
}

interface SyncResponse {
  pages: Page[]
  cursor: string | null
  next_sync_cursor: string | null
}

export class APIError extends Error {
  constructor (message: string) {
    super(message)
    this.name = this.constructor.name
  }
}

export class SyncAbortedError extends Error {
  constructor (message: string = 'Sync aborted.') {
    super(message)
    this.name = this.constructor.name
  }
}

export class SyncTask {
  isRunning: boolean = false
  isAborted: boolean = false
  lastResponse: SyncResponse
  private cursor: string | null
  private readonly token: string
  private readonly cursors = new Set()

  constructor (options: SyncOptions) {
    this.token = options.token
  }

  async * run (initialCursor: string | null): AsyncGenerator<Page> {
    if (this.isRunning) {
      return
    }

    this.initialize(initialCursor)

    try {
      do {
        const response = await requestUrl({
          url: SYNC_URL.toString(),
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Token': this.token,
            'API-Version': '1'
          },
          body: JSON.stringify({ cursor: this.cursor }),
          throw: false
        })

        if (this.isAborted) {
          throw new SyncAbortedError()
        }

        if (response.status < 200 && response.status > 299) {
          let errorMessage
          try {
            errorMessage = response.json
          } catch {
            throw new Error('Something went wrong')
          }
          throw new APIError(errorMessage.message)
        }

        const data: SyncResponse = await response.json

        this.lastResponse = data

        for (const page of data.pages) {
          yield page
        }

        if (data.cursor == null) break
        if (data.cursor === this.cursor) {
          throw new Error('Next pagination cursor is the same as current. Stopping sync.')
        }
        if (this.cursors.has(data.cursor)) {
          throw new Error('Pagination is looped! Abort sync.')
        }

        this.cursor = data.cursor
        this.cursors.add(this.cursor)
      } while (this.cursor != null)
    } finally {
      this.isRunning = false
    }
  }

  initialize (initialCursor: string | null): void {
    this.isRunning = true
    this.isAborted = false
    this.cursor = initialCursor
    this.cursors.clear()
  }

  abort (): void {
    this.isRunning = false
    this.isAborted = true
  }
}
