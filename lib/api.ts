import { getToken } from "./auth";

const API_URL = "http://localhost:3000";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

// Auth
export const auth = {
  register: (data: { name: string; email: string; password: string }) =>
    request<{ id: number; name: string; email: string; role: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  login: (data: { email: string; password: string }) =>
    request<{ message: string; token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// Profile
export const profile = {
  get: () => request<{ id: number; name: string; email: string; role: string }>("/profile"),
};

// Users
export const users = {
  list: () => request<{ id: number; name: string; email: string; role: string }[]>("/users"),
  get: (id: number) => request<{ id: number; name: string; email: string; role: string }>(`/users/${id}`),
  delete: (id: number) => request<{ message: string }>(`/users/${id}`, { method: "DELETE" }),
};

// Rooms
export interface Room {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  createdById: number;
  createdAt: string;
  expiresAt: string | null;
  isPrivate: boolean;
  accessKey?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: { total: number; limit: number; offset: number; totalPages: number };
}

export const rooms = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<PaginatedResponse<Room>>(`/rooms${q}`);
  },
  my: () => request<PaginatedResponse<Room>>("/rooms/my"),
  joined: () => request<Room[]>("/rooms/joined/me"),
  get: (id: number) => request<Room>(`/rooms/${id}`),
  create: (data: { name: string; description?: string; isPrivate?: boolean; expiresAt?: string }) =>
    request<Room>("/rooms", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Room>) =>
    request<Room>(`/rooms/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: number) => request<{ message: string }>(`/rooms/${id}`, { method: "DELETE" }),
  join: (id: number, accessKey?: string) =>
    request<{ message: string }>(`/rooms/${id}/join`, {
      method: "POST",
      body: JSON.stringify(accessKey ? { accessKey } : {}),
    }),
  leave: (id: number) => request<{ message: string }>(`/rooms/${id}/leave`, { method: "DELETE" }),
  members: (id: number) =>
    request<{ members: { userId: number; role: string; User?: { name: string; email: string } }[]; count: number }>(
      `/rooms/${id}/members`
    ),
  invite: (id: number) => request<{ accessKey: string; inviteUrl: string }>(`/rooms/${id}/invite`),
  regenerateInvite: (id: number) =>
    request<{ accessKey: string; inviteUrl: string }>(`/rooms/${id}/invite/regenerate`, { method: "POST" }),
};

// Messages
export interface Message {
  id: number;
  content: string;
  userId: number;
  roomId: number;
  createdAt: string;
  isEdited: boolean;
  status: "sent" | "delivered" | "read";
  User?: { name: string; email: string };
}

export const messages = {
  listByRoom: (roomId: number, params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<PaginatedResponse<Message>>(`/messages/room/${roomId}${q}`);
  },
  my: () => request<PaginatedResponse<Message>>("/messages/my"),
  get: (id: number) => request<Message>(`/messages/${id}`),
  create: (data: { content: string; roomId: number }) =>
    request<Message>("/messages", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, content: string) =>
    request<Message>(`/messages/${id}`, { method: "PUT", body: JSON.stringify({ content }) }),
  delete: (id: number) => request<{ message: string }>(`/messages/${id}`, { method: "DELETE" }),
};
