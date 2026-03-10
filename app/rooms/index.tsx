import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Switch,
  Modal,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { rooms, Room } from "@/lib/api";
import { getCurrentUser, removeToken } from "@/lib/auth";
import { disconnectSocket } from "@/lib/socket";

type Tab = "all" | "joined" | "my";

export default function RoomsScreen() {
  const router = useRouter();
  const [allRooms, setAllRooms] = useState<Room[]>([]);
  const [joinedRooms, setJoinedRooms] = useState<Room[]>([]);
  const [tab, setTab] = useState<Tab>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);

  // Create room modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPrivate, setNewPrivate] = useState(false);

  // Join private room
  const [joinModal, setJoinModal] = useState<number | null>(null);
  const [joinKey, setJoinKey] = useState("");

  useEffect(() => {
    getCurrentUser().then((u) => {
      if (!u) {
        router.replace("/login");
        return;
      }
      setUserId(u.id);
    });
    loadRooms();
  }, [router]);

  async function loadRooms() {
    try {
      const [allRes, joinedRes] = await Promise.all([
        rooms.list({ limit: "50" }),
        rooms.joined(),
      ]);
      setAllRooms(allRes.data);
      setJoinedRooms(joinedRes);
    } catch {
      Alert.alert("Error", "Failed to load rooms");
    } finally {
      setLoading(false);
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadRooms();
    setRefreshing(false);
  }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      await rooms.create({ name: newName, description: newDesc || undefined, isPrivate: newPrivate });
      setNewName("");
      setNewDesc("");
      setNewPrivate(false);
      setShowCreate(false);
      loadRooms();
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to create");
    }
  }

  async function handleJoin(roomId: number, isPrivate: boolean) {
    if (isPrivate) {
      setJoinModal(roomId);
      return;
    }
    try {
      await rooms.join(roomId);
      router.push(`/rooms/${roomId}`);
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to join");
    }
  }

  async function handleJoinWithKey() {
    if (!joinModal || !joinKey.trim()) return;
    try {
      await rooms.join(joinModal, joinKey);
      setJoinModal(null);
      setJoinKey("");
      router.push(`/rooms/${joinModal}`);
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Invalid access key");
    }
  }

  async function handleDelete(roomId: number) {
    Alert.alert("Delete Room", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await rooms.delete(roomId);
            loadRooms();
          } catch (err: unknown) {
            Alert.alert("Error", err instanceof Error ? err.message : "Failed to delete");
          }
        },
      },
    ]);
  }

  async function handleLogout() {
    disconnectSocket();
    await removeToken();
    router.replace("/login");
  }

  const joinedIds = new Set(joinedRooms.map((r) => r.id));
  const myRooms = allRooms.filter((r) => r.createdById === userId);
  const displayRooms = tab === "all" ? allRooms : tab === "joined" ? joinedRooms : myRooms;

  function renderRoom({ item: room }: { item: Room }) {
    const isJoined = joinedIds.has(room.id);
    const isMine = room.createdById === userId;

    return (
      <View style={styles.roomCard}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={styles.roomName}>{room.name}</Text>
            {room.isPrivate && <Text style={styles.badgePrivate}>Private</Text>}
            {!room.isActive && <Text style={styles.badgeInactive}>Inactive</Text>}
          </View>
          {room.description ? <Text style={styles.roomDesc}>{room.description}</Text> : null}
        </View>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          {isJoined ? (
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: "#16a34a" }]}
              onPress={() => router.push(`/rooms/${room.id}`)}
            >
              <Text style={styles.btnText}>Open</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.btn}
              onPress={() => handleJoin(room.id, room.isPrivate)}
            >
              <Text style={styles.btnText}>Join</Text>
            </TouchableOpacity>
          )}
          {isMine && (
            <TouchableOpacity onPress={() => handleDelete(room.id)}>
              <Text style={{ color: "#ef4444", fontSize: 13 }}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header actions */}
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.btn} onPress={() => setShowCreate(true)}>
          <Text style={styles.btnText}>+ New Room</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity onPress={() => router.push("/profile")}>
            <Text style={{ color: "#4f46e5", fontWeight: "600" }}>Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout}>
            <Text style={{ color: "#ef4444", fontWeight: "600" }}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(["all", "joined", "my"] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === "all" ? "All" : t === "joined" ? "Joined" : "Mine"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#4f46e5" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={displayRooms}
          keyExtractor={(r) => r.id.toString()}
          renderItem={renderRoom}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <Text style={{ textAlign: "center", color: "#9ca3af", marginTop: 40 }}>No rooms found</Text>
          }
        />
      )}

      {/* Create Room Modal */}
      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create Room</Text>
            <TextInput
              style={styles.input}
              placeholder="Room name"
              value={newName}
              onChangeText={setNewName}
              placeholderTextColor="#9ca3af"
            />
            <TextInput
              style={styles.input}
              placeholder="Description (optional)"
              value={newDesc}
              onChangeText={setNewDesc}
              placeholderTextColor="#9ca3af"
            />
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16, gap: 8 }}>
              <Switch value={newPrivate} onValueChange={setNewPrivate} trackColor={{ true: "#4f46e5" }} />
              <Text style={{ color: "#374151" }}>Private room</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity style={styles.btn} onPress={handleCreate}>
                <Text style={styles.btnText}>Create</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: "#6b7280" }]}
                onPress={() => setShowCreate(false)}
              >
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Join Private Room Modal */}
      <Modal visible={joinModal !== null} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enter Access Key</Text>
            <TextInput
              style={styles.input}
              placeholder="Access key"
              value={joinKey}
              onChangeText={setJoinKey}
              placeholderTextColor="#9ca3af"
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity style={styles.btn} onPress={handleJoinWithKey}>
                <Text style={styles.btnText}>Join</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: "#6b7280" }]}
                onPress={() => {
                  setJoinModal(null);
                  setJoinKey("");
                }}
              >
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 8,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  tabActive: {
    backgroundColor: "#4f46e5",
    borderColor: "#4f46e5",
  },
  tabText: { fontSize: 13, color: "#6b7280" },
  tabTextActive: { color: "#fff" },
  roomCard: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 8,
    padding: 14,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  roomName: { fontWeight: "600", fontSize: 15, color: "#111827" },
  roomDesc: { fontSize: 13, color: "#6b7280", marginTop: 2 },
  badgePrivate: {
    fontSize: 10,
    backgroundColor: "#fef3c7",
    color: "#a16207",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  badgeInactive: {
    fontSize: 10,
    backgroundColor: "#fee2e2",
    color: "#dc2626",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  btn: {
    backgroundColor: "#4f46e5",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
    color: "#111827",
  },
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
});
