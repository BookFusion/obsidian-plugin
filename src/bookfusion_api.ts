/* eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing */
export const BASE_URL = process.env.BOOKFUSION_URL || 'https://www.bookfusion.com'

export interface Page {
  type: string
  content: string | null
  directory: string
  filename: string
}

export interface BookPage extends Page {
  id: string
  frontmatter: string | null
  highlights: HighlightBlock[]
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
  signal?: AbortSignal
}

interface SyncResponse {
  pages: BookPage[]
  cursor: string | null
}

export async function * initialSync (options: SyncOptions): AsyncGenerator<Page> {
  const url = new URL('/obsidian-api/sync', BASE_URL)
  const cursors = new Set()
  let cursor

  do {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Token': options.token,
        'API-Version': '1'
      },
      body: JSON.stringify({ cursor }),
      signal: options.signal
    })
    const body = await response.json() as SyncResponse

    for (const page of body.pages) {
      yield page
    }

    if (body.cursor == null) return
    if (body.cursor === cursor) {
      throw new Error('Next pagination cursor is the same as current. Stopping sync.')
    }
    if (cursors.has(body.cursor)) {
      throw new Error('Pagination is looped! Abort sync.')
    }

    cursor = body.cursor
    cursors.add(cursor)
  } while (cursor != null)
}
