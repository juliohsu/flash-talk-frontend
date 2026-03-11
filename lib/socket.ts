import Constants from "expo-constants";
import { io, Socket } from "socket.io-client";
import { getToken } from "./auth";

const devHost = Constants.expoConfig?.hostUri?.split(":")[0] ?? "localhost";
const SOCKET_URL = `http://${devHost}:3000`;

let socket: Socket | null = null;

export async function getSocket(): Promise<Socket> {
  if (!socket) {
    const token = await getToken();
    socket = io(SOCKET_URL, {
      auth: { token },
      autoConnect: false,
    });
  }
  return socket;
}

export async function connectSocket(): Promise<Socket> {
  const s = await getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
