class Logger {
  output: Console = console

  log (message: any): void {
    console.log('BookFusion:', message)
  }

  error (message: any): void {
    console.error('BookFusion:', message)
  }
}

export default new Logger()
