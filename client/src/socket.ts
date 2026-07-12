import { io, type Socket } from 'socket.io-client';
import { API_URL } from './api';

/**
 * A single shared socket.io connection to the Nest gateway. autoConnect:false so we
 * connect explicitly after login. The gateway is unauthenticated for the demo, so no
 * token is sent on the handshake (in prod: { auth: { token } }).
 */
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_URL, { autoConnect: false, transports: ['websocket'] });
  }
  return socket;
}
