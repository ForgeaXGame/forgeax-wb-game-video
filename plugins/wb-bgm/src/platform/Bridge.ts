/**
 * 平台通信桥接器
 * 用于 iframe 内的应用与外部 Workbench 宿主通信
 */

export interface AppState {
  status: 'ready' | 'loading' | 'idle' | 'error';
  env?: string;
  assetCount?: number;
}

export interface PlatformMessage {
  type: 'setEnv' | 'refresh' | 'search' | 'navigate' | 'getState';
  env?: string;
  query?: string;
  path?: string;
}

type MessageHandler = (msg: PlatformMessage) => void;

export class PlatformBridge {
  private handlers: MessageHandler[] = [];
  private isEmbedded: boolean;

  constructor() {
    this.isEmbedded = window.parent !== window;

    if (this.isEmbedded) {
      window.addEventListener('message', this.handleMessage.bind(this));
    }
  }

  get embedded(): boolean {
    return this.isEmbedded;
  }

  sendReady(): void {
    this.sendToParent({ type: 'ready' });
    // Workbench StudioHost protocol
    this.sendToParent({ type: 'STUDIO_READY' });
  }

  sendStateChange(state: Partial<AppState>): void {
    this.sendToParent({ type: 'stateChange', state });
  }

  sendError(message: string): void {
    this.sendToParent({ type: 'error', message });
  }

  sendLog(level: 'info' | 'warn' | 'error', message: string): void {
    this.sendToParent({ type: 'log', level, message });
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  private handleMessage(event: MessageEvent): void {
    const data = event.data;
    if (!data || typeof data.type !== 'string') return;

    // Handle Workbench StudioHost initialization
    if (data.type === 'STUDIO_INIT' && data.payload) {
      const { filePath, context } = data.payload;
      if (context?.env) {
        for (const handler of this.handlers) {
          handler({ type: 'setEnv', env: context.env } as PlatformMessage);
        }
      }
      if (filePath) {
        for (const handler of this.handlers) {
          handler({ type: 'navigate', path: filePath } as PlatformMessage);
        }
      }
      return;
    }

    for (const handler of this.handlers) {
      handler(data as PlatformMessage);
    }
  }

  private sendToParent(data: Record<string, unknown>): void {
    if (this.isEmbedded) {
      window.parent.postMessage(data, '*');
    }
  }
}
