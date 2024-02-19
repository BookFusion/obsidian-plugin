export function wrapWithMagicComment (id: string, content: string): string {
  return `%%begin-${id}%%\n${content}\n%%end-${id}%%\n\n`
}

export function replaceBlock (content: string, id: string, fragment: string): string {
  const regexp = new RegExp(`%%begin-${id}%%[\\s\\S]*?%%end-${id}%%\\n{0,2}`)
  return content.replace(regexp, () => wrapWithMagicComment(id, fragment))
}

export class ListNode<T> {
  value: T
  previous: ListNode<T> | null = null
  next: ListNode<T> | null = null

  constructor (value: T) {
    this.value = value
  }
}

export class DoublyLinkedList<T> implements Iterable<T> {
  head: ListNode<T> | null
  tail: ListNode<T> | null

  [Symbol.iterator] (): Iterator<T> {
    let current = this.head

    return {
      next: () => {
        if (current != null) {
          const value = current.value
          current = current.next
          return { value, done: false }
        } else {
          return { value: null, done: true }
        }
      }
    }
  }

  append (value: any): ListNode<T> {
    if (this.tail != null) {
      return this.insertAfter(this.tail, value)
    } else {
      const node = new ListNode<any>(value)

      this.head = node
      this.tail = node

      return node
    }
  }

  insertBefore (target: ListNode<T>, value: T): ListNode<T> {
    const node = new ListNode<T>(value)

    node.next = target
    node.previous = target.previous
    target.previous = node

    if (node.previous != null) {
      node.previous.next = node
    } else {
      this.head = node
    }

    return node
  }

  insertAfter (target: ListNode<T>, value: T): ListNode<T> {
    const node = new ListNode<T>(value)

    node.previous = target
    node.next = target.next
    target.next = node

    if (node.next != null) {
      node.next.previous = node
    } else {
      this.tail = node
    }

    return node
  }
}
