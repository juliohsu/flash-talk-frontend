import { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { profile, users } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

interface UserProfile {
  id: number;
  name: string;
  email: string;
  role: string;
}

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentId, setCurrentId] = useState<number | null>(null);

  useEffect(() => {
    async function init() {
      const current = await getCurrentUser();
      if (!current) {
        router.replace("/login");
        return;
      }
      setCurrentId(current.id);
      setIsAdmin(current.role === "admin");

      try {
        const p = await profile.get();
        setUser(p);
        if (current.role === "admin") {
          setAllUsers(await users.list());
        }
      } catch {
        Alert.alert("Error", "Failed to load profile");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [router]);

  async function handleDeleteUser(id: number) {
    Alert.alert("Delete User", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await users.delete(id);
            setAllUsers((prev) => prev.filter((u) => u.id !== id));
          } catch (err: unknown) {
            Alert.alert("Error", err instanceof Error ? err.message : "Failed to delete");
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {user && (
        <View style={styles.card}>
          <Text style={styles.label}>Name</Text>
          <Text style={styles.value}>{user.name}</Text>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{user.email}</Text>
          <Text style={styles.label}>Role</Text>
          <Text style={[styles.value, { textTransform: "capitalize" }]}>{user.role}</Text>
        </View>
      )}

      {isAdmin && (
        <>
          <Text style={styles.sectionTitle}>All Users (Admin)</Text>
          <FlatList
            data={allUsers}
            keyExtractor={(u) => u.id.toString()}
            renderItem={({ item: u }) => (
              <View style={styles.userRow}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "500", fontSize: 15 }}>{u.name}</Text>
                  <Text style={{ color: "#555", fontSize: 13 }}>
                    {u.email} · {u.role}
                  </Text>
                </View>
                {u.id !== currentId && (
                  <TouchableOpacity onPress={() => handleDeleteUser(u.id)}>
                    <Text style={{ color: "#333", fontSize: 13 }}>Delete</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb", padding: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  label: { fontSize: 12, color: "#9ca3af", marginTop: 12 },
  value: { fontSize: 17, fontWeight: "500", color: "#111827", marginTop: 2 },
  sectionTitle: { fontSize: 17, fontWeight: "bold", color: "#111827", marginBottom: 12 },
  userRow: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
});
