/* eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing */
export const BASE_URL = process.env.BOOKFUSION_URL || 'https://www.bookfusion.com'
const SYNC_URL = new URL('/obsidian-api/sync', BASE_URL)

export interface Page {
  type: string
  content: string | null
  directory: string
  filename: string
}

export interface BookPage extends Page {
  id: string
  type: 'book'
  frontmatter: string | null
  highlights: HighlightBlock[]
}

export interface IndexPage extends Page {
  type: 'index'
}

export interface HighlightBlock {
  id: string
  content: string
  chapter_heading: string | null
  directory: string | null
  filename: string | null
}

interface SyncOptions {
  token: string
}

interface SyncResponse {
  pages: Page[]
  cursor: string | null
  next_sync_cursor: string | null
}

export class SyncTask {
  abortController: AbortController
  isRunning: boolean = false
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

    this.isRunning = true
    this.abortController = new AbortController()
    this.cursor = initialCursor
    this.cursors.clear()

    try {
      do {
        const response = await fetch(SYNC_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Token': this.token,
            'API-Version': '1'
          },
          body: JSON.stringify({ cursor: this.cursor }),
          signal: this.abortController.signal
        })

        if (!response.ok) {
          throw new Error('Something went wrong')
        }

        const data: SyncResponse = await response.json()

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

  abort (): void {
    this.abortController?.abort()
    this.isRunning = false
  }

  get isAborted (): boolean {
    return this.abortController?.signal.aborted
  }
}
