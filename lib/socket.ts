import Constants from "expo-constants";
import { io, Socket } from "socket.io-client";
import { getToken } from "./auth";

const devHost = Constants.expoConfig?.hostUri?.split(":")[0] ?? "localhost";
const SOCKET_URL = `http://${devHost}:3000`;

let socket: Socket | null = null;

export async function connectSocket(): Promise<Socket> {
  // If existing socket is disconnected or doesn't exist, create a fresh one
  if (socket && socket.disconnected) {
    socket.removeAllListeners();
    socket = null;
  }

  if (!socket) {
    const token = await getToken();
    socket = io(SOCKET_URL, {
      auth: { token },
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      transports: ["websocket", "polling"],
    });
  }

  if (!socket.connected) {
    socket.connect();
  }

  return socket;
}

export function getSocketInstance(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
