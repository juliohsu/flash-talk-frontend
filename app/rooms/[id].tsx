import { useState, useEffect, useRef, useCallback } from "react";
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
  Pressable,
  AppState,
  AppStateStatus,
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
  const [typingUsers, setTypingUsers] = useState<number[]>([]);
  const [showMembers, setShowMembers] = useState(false);
  const [inviteKey, setInviteKey] = useState("");
  const [showInvite, setShowInvite] = useState(false);

  // Three-dot menu state
  const [menuMsgId, setMenuMsgId] = useState<number | null>(null);

  // Edit modal state
  const [editModalMsg, setEditModalMsg] = useState<Message | null>(null);
  const [editContent, setEditContent] = useState("");

  // Delete confirmation modal state
  const [deleteMsgId, setDeleteMsgId] = useState<number | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const mountedRef = useRef(true);

  // Reload messages from API (used on reconnect and app foreground)
  const reloadMessages = useCallback(async () => {
    try {
      const res = await messages.listByRoom(roomId, { limit: "100", order: "ASC" });
      if (mountedRef.current) setMsgList(res.data);
    } catch {
      // silent fail on reload
    }
  }, [roomId]);

  // Setup socket listeners
  const setupSocketListeners = useCallback((socket: Socket) => {
    // Remove old listeners to avoid duplicates
    socket.off("new-message");
    socket.off("user-typing");
    socket.off("user-joined");
    socket.off("user-left");
    socket.off("messages-status-updated");
    socket.off("connect");
    socket.off("reconnect");

    socket.on("new-message", (msg: Message) => {
      if (mountedRef.current) {
        setMsgList((prev) => {
          // Deduplicate by id
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        socket.emit("messages-delivered", { roomId });
      }
    });

    socket.on("user-typing", ({ userId: uid, isTyping }: { userId: number; isTyping: boolean }) => {
      if (mountedRef.current) {
        setTypingUsers((prev) =>
          isTyping ? [...prev.filter((x) => x !== uid), uid] : prev.filter((x) => x !== uid)
        );
      }
    });

    socket.on("user-joined", async () => {
      const res = await rooms.members(roomId);
      if (mountedRef.current) setMembers(res.members);
    });

    socket.on("user-left", async () => {
      const res = await rooms.members(roomId);
      if (mountedRef.current) setMembers(res.members);
    });

    socket.on("messages-status-updated", async () => {
      await reloadMessages();
    });

    // On reconnect: re-join room and reload messages to catch anything missed
    socket.on("connect", () => {
      console.log("[socket] connected/reconnected, re-joining room", roomId);
      socket.emit("join-room", roomId);
      socket.emit("messages-read", { roomId });
      reloadMessages();
    });
  }, [roomId, reloadMessages]);

  // Main init effect
  useEffect(() => {
    mountedRef.current = true;

    async function init() {
      const user = await getCurrentUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      if (mountedRef.current) setUserId(user.id);

      try {
        const [roomData, msgData, memberData] = await Promise.all([
          rooms.get(roomId),
          messages.listByRoom(roomId, { limit: "100", order: "ASC" }),
          rooms.members(roomId),
        ]);
        if (mountedRef.current) {
          setRoom(roomData);
          setMsgList(msgData.data);
          setMembers(memberData.members);
        }
      } catch {
        Alert.alert("Error", "Failed to load room");
      }

      const socket = await connectSocket();
      socketRef.current = socket;
      setupSocketListeners(socket);

      // If already connected, join immediately; otherwise the "connect" listener handles it
      if (socket.connected) {
        socket.emit("join-room", roomId);
        socket.emit("messages-read", { roomId });
      }
    }

    init();

    return () => {
      mountedRef.current = false;
      if (socketRef.current) {
        socketRef.current.emit("leave-room", roomId);
        socketRef.current.off("new-message");
        socketRef.current.off("user-typing");
        socketRef.current.off("user-joined");
        socketRef.current.off("user-left");
        socketRef.current.off("messages-status-updated");
        socketRef.current.off("connect");
        socketRef.current.off("reconnect");
      }
    };
  }, [roomId, router, setupSocketListeners]);

  // Handle app going to background/foreground
  useEffect(() => {
    function handleAppState(nextState: AppStateStatus) {
      if (nextState === "active" && socketRef.current) {
        // App came back to foreground — reconnect socket if needed and reload messages
        if (socketRef.current.disconnected) {
          socketRef.current.connect();
        } else {
          // Already connected, just reload to catch missed messages
          socketRef.current.emit("join-room", roomId);
          reloadMessages();
        }
      }
    }

    const subscription = AppState.addEventListener("change", handleAppState);
    return () => subscription.remove();
  }, [roomId, reloadMessages]);

  // Scroll to bottom on new messages
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
    if (!newMsg.trim() || !socketRef.current) return;
    const content = newMsg.trim();
    setNewMsg("");
    socketRef.current.emit("typing", { roomId, isTyping: false });

    // Use callback acknowledgment so the sender always gets the saved message
    socketRef.current.emit("send-message", { roomId, content }, (savedMsg: Message) => {
      if (savedMsg && mountedRef.current) {
        setMsgList((prev) => {
          if (prev.some((m) => m.id === savedMsg.id)) return prev;
          return [...prev, savedMsg];
        });
      }
    });
  }

  async function handleEditSave() {
    if (!editContent.trim() || !editModalMsg) return;
    try {
      await messages.update(editModalMsg.id, editContent);
      setEditModalMsg(null);
      setEditContent("");
      const res = await messages.listByRoom(roomId, { limit: "100", order: "ASC" });
      setMsgList(res.data);
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to edit");
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteMsgId) return;
    try {
      await messages.delete(deleteMsgId);
      setMsgList((prev) => prev.filter((m) => m.id !== deleteMsgId));
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleteMsgId(null);
    }
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
    const showMenu = menuMsgId === msg.id;

    return (
      <View style={[styles.msgRow, isMine ? styles.msgRowRight : styles.msgRowLeft]}>
        {/* Three-dot button + bubble row */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", maxWidth: "82%" }}>
          {/* Three-dot on the left for own messages */}
          {isMine && (
            <TouchableOpacity
              style={styles.dotBtn}
              onPress={() => setMenuMsgId(showMenu ? null : msg.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.dotIcon}>...</Text>
            </TouchableOpacity>
          )}

          <View style={{ position: "relative", flexShrink: 1 }}>
            <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
              {!isMine && (
                <Text style={styles.msgAuthor}>
                  {memberMap.get(msg.userId) || msg.User?.name || `User #${msg.userId}`}
                </Text>
              )}
              <Text style={[styles.msgText, isMine && { color: "#fff" }]}>{msg.content}</Text>
              <View style={styles.msgMeta}>
                <Text style={[styles.msgTime, isMine && { color: "rgba(255,255,255,0.6)" }]}>
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
                {msg.isEdited && (
                  <Text style={[styles.msgTime, isMine && { color: "rgba(255,255,255,0.6)" }]}>(edited)</Text>
                )}
                {isMine && (
                  <Text style={[styles.msgTime, { color: "rgba(255,255,255,0.6)" }]}>{msg.status}</Text>
                )}
              </View>
            </View>

            {/* Dropdown menu */}
            {showMenu && isMine && (
              <View style={[styles.menuDropdown, isMine ? styles.menuDropdownRight : styles.menuDropdownLeft]}>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setMenuMsgId(null);
                    setEditContent(msg.content);
                    setEditModalMsg(msg);
                  }}
                >
                  <Text style={styles.menuItemText}>Edit</Text>
                </TouchableOpacity>
                <View style={styles.menuDivider} />
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setMenuMsgId(null);
                    setDeleteMsgId(msg.id);
                  }}
                >
                  <Text style={[styles.menuItemText, { color: "#333" }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Three-dot on the right for other's messages — not shown since they can't edit/delete */}
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
            <Text style={{ color: "#000", fontSize: 13, fontWeight: "600" }}>
              Members ({members.length})
            </Text>
          </TouchableOpacity>
          {isOwner && room?.isPrivate && (
            <TouchableOpacity onPress={handleShowInvite}>
              <Text style={{ color: "#555", fontSize: 13, fontWeight: "600" }}>Invite</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleLeave}>
            <Text style={{ color: "#333", fontSize: 13, fontWeight: "600" }}>Leave</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Dismiss menu when tapping elsewhere */}
      <Pressable style={{ flex: 1 }} onPress={() => menuMsgId && setMenuMsgId(null)}>
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
      </Pressable>

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

      {/* Edit Message Modal */}
      <Modal visible={editModalMsg !== null} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Message</Text>
            <TextInput
              style={styles.editModalInput}
              value={editContent}
              onChangeText={setEditContent}
              autoFocus
              multiline
              placeholderTextColor="#9ca3af"
              placeholder="Edit your message..."
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
              <TouchableOpacity
                style={[styles.btn, styles.btnOutline]}
                onPress={() => {
                  setEditModalMsg(null);
                  setEditContent("");
                }}
              >
                <Text style={styles.btnOutlineText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, !editContent.trim() && { opacity: 0.5 }]}
                onPress={handleEditSave}
                disabled={!editContent.trim()}
              >
                <Text style={styles.btnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal visible={deleteMsgId !== null} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete Message</Text>
            <Text style={{ color: "#555", fontSize: 15, lineHeight: 22 }}>
              Are you sure you want to delete this message? This action cannot be undone.
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
              <TouchableOpacity
                style={[styles.btn, styles.btnOutline]}
                onPress={() => setDeleteMsgId(null)}
              >
                <Text style={styles.btnOutlineText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnDanger]}
                onPress={handleDeleteConfirm}
              >
                <Text style={styles.btnText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
                style={[styles.btn, { backgroundColor: "#555" }]}
                onPress={handleRegenerateKey}
              >
                <Text style={styles.btnText}>Regenerate</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnOutline]}
                onPress={() => setShowInvite(false)}
              >
                <Text style={styles.btnOutlineText}>Close</Text>
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
    backgroundColor: "#f3f4f6",
    color: "#555",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  msgRow: { marginBottom: 8 },
  msgRowRight: { alignItems: "flex-end" },
  msgRowLeft: { alignItems: "flex-start" },
  bubble: {
    maxWidth: "100%",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleMine: { backgroundColor: "#000", borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: "#fff", borderBottomLeftRadius: 4, borderWidth: 1, borderColor: "#e5e7eb" },
  msgAuthor: { fontSize: 11, fontWeight: "600", color: "#000", marginBottom: 2 },
  msgText: { fontSize: 15, color: "#111827" },
  msgMeta: { flexDirection: "row", gap: 6, marginTop: 4 },
  msgTime: { fontSize: 10, color: "#9ca3af" },
  dotBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginRight: 4,
    marginTop: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  dotIcon: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#9ca3af",
    letterSpacing: 1,
  },
  menuDropdown: {
    position: "absolute",
    top: -4,
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingVertical: 4,
    minWidth: 100,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    zIndex: 100,
  },
  menuDropdownRight: { right: "100%", marginRight: 4 },
  menuDropdownLeft: { left: "100%", marginLeft: 4 },
  menuItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
  },
  menuDivider: {
    height: 1,
    backgroundColor: "#f3f4f6",
  },
  editModalInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#111827",
    minHeight: 80,
    textAlignVertical: "top",
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
    backgroundColor: "#000",
    borderRadius: 20,
    paddingHorizontal: 18,
    justifyContent: "center",
  },
  btn: {
    backgroundColor: "#000",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnOutline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  btnOutlineText: {
    color: "#555",
    fontWeight: "600",
    fontSize: 14,
  },
  btnDanger: {
    backgroundColor: "#333",
  },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
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
