export function wrapWithMagicComment (id: string, content: string): string {
  return `%%begin-${id}%%\n${content}\n%%end-${id}%%\n\n`
}
