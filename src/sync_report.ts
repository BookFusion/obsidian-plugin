interface BookCreatedEvent {
  path: string
}

interface BookModifiedEvent {
  path: string
}

interface FileFailedEvent {
  path: string | null
  error: Error
}

interface BookFailedEvent extends FileFailedEvent {}

export default class SyncReport {
  indicesFailed: FileFailedEvent[] = []
  booksCreated: BookCreatedEvent[] = []
  booksModified: BookModifiedEvent[] = []
  booksFailed: BookFailedEvent[] = []
  highlightsModified: Map<string, number> = new Map()

  isEmpty (): boolean {
    return this.indicesFailed.length === 0 &&
      this.booksCreated.length === 0 &&
      this.booksModified.length === 0 &&
      this.booksFailed.length === 0 &&
      this.highlightsModified.size === 0
  }

  indexFailed (path: string | null, error: Error): void {
    this.indicesFailed.push({ path, error })
  }

  bookCreated (path: string): void {
    this.booksCreated.push({ path })
  }

  bookModified (path: string): void {
    this.booksModified.push({ path })
  }

  bookFailed (path: string | null, error: Error): void {
    this.booksFailed.push({ path, error })
  }

  highlightModified (path: string, offset: number = 1): void {
    const value = this.highlightsModified.get(path) ?? 0
    this.highlightsModified.set(path, value + offset)
  }
}
