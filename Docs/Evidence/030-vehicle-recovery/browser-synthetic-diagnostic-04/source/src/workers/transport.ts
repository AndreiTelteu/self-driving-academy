import type { Packet, Transport } from './protocol';
// Browser MessagePort/Worker adapter; caller owns termination and port lifetime.
export interface MessageEndpoint {
  postMessage(message: Packet, transfer: ArrayBuffer[]): void;
  addEventListener(
    type: 'message' | 'error' | 'messageerror',
    listener: (event: { data?: unknown }) => void,
  ): void;
  removeEventListener(
    type: 'message' | 'error' | 'messageerror',
    listener: (event: { data?: unknown }) => void,
  ): void;
  start?(): void;
}
export function messageTransport(endpoint: MessageEndpoint): Transport {
  return {
    send: (packet, transfer) => endpoint.postMessage(packet, [...transfer]),
    listen(message, error) {
      const onMessage = (event: { data?: unknown }) => message(event.data);
      const onError = () => error('Worker transport error');
      endpoint.addEventListener('message', onMessage);
      endpoint.addEventListener('error', onError);
      endpoint.addEventListener('messageerror', onError);
      endpoint.start?.();
      return () => {
        endpoint.removeEventListener('message', onMessage);
        endpoint.removeEventListener('error', onError);
        endpoint.removeEventListener('messageerror', onError);
      };
    },
  };
}
