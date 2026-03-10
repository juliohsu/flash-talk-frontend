import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Clipboard,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { rooms, messages, Room, Message } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { connectSocket, disconnectSocket } from "@/lib/socket";
import type { Socket } from "socket.io-client";

interface Member {
  userId: number;
  role: string;
  User?: { name: string; email: string };
}

export default function ChatRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const roomId = Number(id);
  const router = useRouter();

  const [room, setRoom] = useState<Room | null>(null);
  const [msgList, setMsgList] = useState<Message[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [userId, setUserId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [typingUsers, setTypingUsers] = useState<number[]>([]);
  const [showMembers, setShowMembers] = useState(false);
  const [inviteKey, setInviteKey] = useState("");
  const [showInvite, setShowInvite] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    let mounted = true;

    async function init() {
      const user = await getCurrentUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      if (mounted) setUserId(user.id);

      // Load data
      try {
        const [roomData, msgData, memberData] = await Promise.all([
          rooms.get(roomId),
          messages.listByRoom(roomId, { limit: "100", order: "ASC" }),
          rooms.members(roomId),
        ]);
        if (mounted) {
          setRoom(roomData);
          setMsgList(msgData.data);
          setMembers(memberData.members);
        }
      } catch {
        Alert.alert("Error", "Failed to load room");
      }

      // Socket
      const socket = await connectSocket();
      socketRef.current = socket;
      socket.emit("join-room", roomId);
      socket.emit("messages-read", { roomId });

      socket.on("new-message", (msg: Message) => {
        if (mounted) {
          setMsgList((prev) => [...prev, msg]);
          socket.emit("messages-delivered", { roomId });
        }
      });

      socket.on("user-typing", ({ userId: uid, isTyping }: { userId: number; isTyping: boolean }) => {
        if (mounted) {
          setTypingUsers((prev) =>
            isTyping ? [...prev.filter((x) => x !== uid), uid] : prev.filter((x) => x !== uid)
          );
        }
      });

      socket.on("user-joined", async () => {
        const res = await rooms.members(roomId);
        if (mounted) setMembers(res.members);
      });

      socket.on("user-left", async () => {
        const res = await rooms.members(roomId);
        if (mounted) setMembers(res.members);
      });

      socket.on("messages-status-updated", async () => {
        const res = await messages.listByRoom(roomId, { limit: "100", order: "ASC" });
        if (mounted) setMsgList(res.data);
      });
    }

    init();

    return () => {
      mounted = false;
      if (socketRef.current) {
        socketRef.current.emit("leave-room", roomId);
        socketRef.current.off("new-message");
        socketRef.current.off("user-typing");
        socketRef.current.off("user-joined");
        socketRef.current.off("user-left");
        socketRef.current.off("messages-status-updated");
      }
    };
  }, [roomId, router]);

  useEffect(() => {
    if (msgList.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [msgList]);

  function handleTyping() {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit("typing", { roomId, isTyping: true });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("typing", { roomId, isTyping: false });
    }, 2000);
  }

  async function handleSend() {
    if (!newMsg.trim()) return;
    try {
      await messages.create({ content: newMsg, roomId });
      setNewMsg("");
      socketRef.current?.emit("typing", { roomId, isTyping: false });
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to send");
    }
  }

  async function handleEdit(msgId: number) {
    if (!editContent.trim()) return;
    try {
      await messages.update(msgId, editContent);
      setEditingId(null);
      setEditContent("");
      const res = await messages.listByRoom(roomId, { limit: "100", order: "ASC" });
      setMsgList(res.data);
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to edit");
    }
  }

  async function handleDeleteMsg(msgId: number) {
    Alert.alert("Delete Message", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await messages.delete(msgId);
            setMsgList((prev) => prev.filter((m) => m.id !== msgId));
          } catch (err: unknown) {
            Alert.alert("Error", err instanceof Error ? err.message : "Failed to delete");
          }
        },
      },
    ]);
  }

  async function handleLeave() {
    Alert.alert("Leave Room", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          try {
            await rooms.leave(roomId);
            disconnectSocket();
            router.back();
          } catch (err: unknown) {
            Alert.alert("Error", err instanceof Error ? err.message : "Failed to leave");
          }
        },
      },
    ]);
  }

  async function handleShowInvite() {
    try {
      const res = await rooms.invite(roomId);
      setInviteKey(res.accessKey);
      setShowInvite(true);
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Cannot get invite");
    }
  }

  async function handleRegenerateKey() {
    try {
      const res = await rooms.regenerateInvite(roomId);
      setInviteKey(res.accessKey);
      Alert.alert("Success", "Access key regenerated");
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to regenerate");
    }
  }

  const isOwner = room?.createdById === userId;
  const memberMap = new Map(members.map((m) => [m.userId, m.User?.name || `User #${m.userId}`]));
  const otherTyping = typingUsers.filter((uid) => uid !== userId);

  function renderMessage({ item: msg }: { item: Message }) {
    const isMine = msg.userId === userId;

    return (
      <View style={[styles.msgRow, isMine ? styles.msgRowRight : styles.msgRowLeft]}>
        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
          {!isMine && (
            <Text style={styles.msgAuthor}>
              {memberMap.get(msg.userId) || msg.User?.name || `User #${msg.userId}`}
            </Text>
          )}
          {editingId === msg.id ? (
            <View>
              <TextInput
                style={styles.editInput}
                value={editContent}
                onChangeText={setEditContent}
                autoFocus
                onSubmitEditing={() => handleEdit(msg.id)}
              />
              <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                <TouchableOpacity onPress={() => handleEdit(msg.id)}>
                  <Text style={{ color: isMine ? "#c7d2fe" : "#4f46e5", fontSize: 12 }}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setEditingId(null)}>
                  <Text style={{ color: isMine ? "#c7d2fe" : "#6b7280", fontSize: 12 }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <Text style={[styles.msgText, isMine && { color: "#fff" }]}>{msg.content}</Text>
          )}
          <View style={styles.msgMeta}>
            <Text style={[styles.msgTime, isMine && { color: "#c7d2fe" }]}>
              {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Text>
            {msg.isEdited && (
              <Text style={[styles.msgTime, isMine && { color: "#c7d2fe" }]}>(edited)</Text>
            )}
            {isMine && (
              <Text style={[styles.msgTime, { color: "#c7d2fe" }]}>{msg.status}</Text>
            )}
          </View>
          {isMine && editingId !== msg.id && (
            <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
              <TouchableOpacity
                onPress={() => {
                  setEditingId(msg.id);
                  setEditContent(msg.content);
                }}
              >
                <Text style={{ color: "#c7d2fe", fontSize: 11 }}>edit</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDeleteMsg(msg.id)}>
                <Text style={{ color: "#c7d2fe", fontSize: 11 }}>delete</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      {/* Room info bar */}
      <View style={styles.infoBar}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ fontWeight: "bold", fontSize: 15 }}>{room?.name || "Loading..."}</Text>
            {room?.isPrivate && <Text style={styles.badgePrivate}>Private</Text>}
          </View>
          {room?.description ? <Text style={{ fontSize: 12, color: "#6b7280" }}>{room.description}</Text> : null}
        </View>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <TouchableOpacity onPress={() => setShowMembers(true)}>
            <Text style={{ color: "#4f46e5", fontSize: 13, fontWeight: "600" }}>
              Members ({members.length})
            </Text>
          </TouchableOpacity>
          {isOwner && room?.isPrivate && (
            <TouchableOpacity onPress={handleShowInvite}>
              <Text style={{ color: "#a16207", fontSize: 13, fontWeight: "600" }}>Invite</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleLeave}>
            <Text style={{ color: "#ef4444", fontSize: 13, fontWeight: "600" }}>Leave</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={msgList}
        keyExtractor={(m) => m.id.toString()}
        renderItem={renderMessage}
        contentContainerStyle={{ padding: 12, paddingBottom: 4 }}
        ListEmptyComponent={
          <Text style={{ textAlign: "center", color: "#9ca3af", marginTop: 60 }}>
            No messages yet. Start the conversation!
          </Text>
        }
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
      />

      {/* Typing indicator */}
      {otherTyping.length > 0 && (
        <View style={styles.typingBar}>
          <Text style={{ color: "#9ca3af", fontSize: 12 }}>
            {otherTyping.map((uid) => memberMap.get(uid) || `User #${uid}`).join(", ")} typing...
          </Text>
        </View>
      )}

      {/* Input */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.msgInput}
          placeholder="Type a message..."
          value={newMsg}
          onChangeText={(text) => {
            setNewMsg(text);
            handleTyping();
          }}
          placeholderTextColor="#9ca3af"
          onSubmitEditing={handleSend}
          returnKeyType="send"
        />
        <TouchableOpacity
          style={[styles.sendBtn, !newMsg.trim() && { opacity: 0.5 }]}
          onPress={handleSend}
          disabled={!newMsg.trim()}
        >
          <Text style={{ color: "#fff", fontWeight: "bold" }}>Send</Text>
        </TouchableOpacity>
      </View>

      {/* Members Modal */}
      <Modal visible={showMembers} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Members ({members.length})</Text>
            {members.map((m) => (
              <View key={m.userId} style={styles.memberRow}>
                <Text style={{ fontWeight: "500" }}>
                  {m.User?.name || `User #${m.userId}`}
                </Text>
                <Text style={{ color: "#6b7280", fontSize: 12 }}>{m.role}</Text>
              </View>
            ))}
            <TouchableOpacity
              style={[styles.btn, { marginTop: 16, alignSelf: "center" }]}
              onPress={() => setShowMembers(false)}
            >
              <Text style={styles.btnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Invite Modal */}
      <Modal visible={showInvite} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Invite Key</Text>
            <View style={styles.keyBox}>
              <Text style={{ fontSize: 14, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>
                {inviteKey}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <TouchableOpacity
                style={styles.btn}
                onPress={() => {
                  Clipboard.setString(inviteKey);
                  Alert.alert("Copied!");
                }}
              >
                <Text style={styles.btnText}>Copy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: "#a16207" }]}
                onPress={handleRegenerateKey}
              >
                <Text style={styles.btnText}>Regenerate</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: "#6b7280" }]}
                onPress={() => setShowInvite(false)}
              >
                <Text style={styles.btnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  infoBar: {
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
  },
  badgePrivate: {
    fontSize: 10,
    backgroundColor: "#fef3c7",
    color: "#a16207",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  msgRow: { marginBottom: 8 },
  msgRowRight: { alignItems: "flex-end" },
  msgRowLeft: { alignItems: "flex-start" },
  bubble: {
    maxWidth: "78%",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleMine: { backgroundColor: "#4f46e5", borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: "#fff", borderBottomLeftRadius: 4, borderWidth: 1, borderColor: "#e5e7eb" },
  msgAuthor: { fontSize: 11, fontWeight: "600", color: "#4f46e5", marginBottom: 2 },
  msgText: { fontSize: 15, color: "#111827" },
  msgMeta: { flexDirection: "row", gap: 6, marginTop: 4 },
  msgTime: { fontSize: 10, color: "#9ca3af" },
  editInput: {
    backgroundColor: "#fff",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 14,
    color: "#111827",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  typingBar: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  inputBar: {
    flexDirection: "row",
    padding: 10,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    gap: 8,
  },
  msgInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: "#111827",
  },
  sendBtn: {
    backgroundColor: "#4f46e5",
    borderRadius: 20,
    paddingHorizontal: 18,
    justifyContent: "center",
  },
  btn: {
    backgroundColor: "#4f46e5",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 24,
    width: "100%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 16,
  },
  memberRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  keyBox: {
    backgroundColor: "#f9fafb",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
});
