/* eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing */
export const BASE_URL = process.env.BOOKFUSION_URL || 'https://www.bookfusion.com'

export interface BookPage {
  id: string
  frontmatter: string | null
  content: string | null
  directory: string
  filename: string
  highlights: HighlightBlock[]
}

export interface HighlightBlock {
  id: string
  content: string
}

interface SyncResponse {
  pages: BookPage[]
  cursor: string | null
}

export async function * initialSync (token: string): AsyncGenerator<BookPage> {
  const url = new URL('/obsidian-api/sync', BASE_URL)
  let cursor

  do {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Token': token,
        'API-Version': '1'
      },
      body: JSON.stringify({ cursor })
    })
    const body = await response.json() as SyncResponse

    for (const page of body.pages) {
      yield page
    }

    if (body.cursor == null) return
    if (body.cursor === cursor) {
      throw new Error('Next pagination cursor is the same as current. Stopping sync.')
    }

    cursor = body.cursor
  } while (cursor != null)
}
