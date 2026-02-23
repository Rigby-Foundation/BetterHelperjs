export type ErrorPrinter = (index: number, message: string) => void;

export class ErrorCenter {
  public print: ErrorPrinter = () => {};
  public readonly errors: Record<number, string> = {};
  private counter = 0;

  public log(error: unknown): void {
    const message = this.stringify(error);
    this.print(this.counter, message);
    this.counter += 1;
    this.errors[this.counter] = message;
  }

  public handleGlobal = (
    message: string | Event,
    source?: string,
    line?: number,
    column?: number,
    error?: Error
  ): void => {
    const title = typeof message === 'string' ? message : String(message.type ?? 'error');
    console.error(title, source ? `${source}:${line ?? 0}:${column ?? 0}` : undefined, error);
    this.log(`${title}\n IN ${source ?? 'unknown'} ON LINE ${line ?? 0} IN COLUMN ${column ?? 0}`);
  };

  public handleRejection = (event: PromiseRejectionEvent | unknown): void => {
    const reason =
      typeof event === 'object' && event !== null && 'reason' in event
        ? (event as { reason: unknown }).reason
        : event;

    console.error(reason);
    this.log(`PROMISE ERROR\n${this.stringify(reason)}`);
  };

  private stringify(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.stack ?? value.message;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
}

export const err = new ErrorCenter();

export function bindGlobalErrorHandlers(errorCenter: ErrorCenter = err): void {
  const target = globalThis as typeof globalThis & {
    addEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
  };

  if (typeof target.addEventListener !== 'function') return;

  target.addEventListener('error', ((event: Event) => {
    const e = event as ErrorEvent;
    errorCenter.handleGlobal(e.message, e.filename, e.lineno, e.colno, e.error);
  }) as EventListener);

  target.addEventListener('unhandledrejection', ((event: Event) => {
    errorCenter.handleRejection(event as PromiseRejectionEvent);
  }) as EventListener);
}
