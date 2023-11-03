interface BookCreatedEvent {
  path: string
}

interface BookModifiedEvent {
  path: string
}

interface BookFailedEvent {
  path: string | null
  error: Error
}

export default class SyncReport {
  booksCreated: BookCreatedEvent[] = []
  booksModified: BookModifiedEvent[] = []
  booksFailed: BookFailedEvent[] = []

  bookCreated (path: string): void {
    this.booksCreated.push({ path })
  }

  bookModified (path: string): void {
    this.booksModified.push({ path })
  }

  bookFailed (path: string | null, error: Error): void {
    this.booksFailed.push({ path, error })
  }
}
