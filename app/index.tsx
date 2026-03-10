import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { isLoggedIn } from "@/lib/auth";

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    isLoggedIn().then((loggedIn) => {
      router.replace(loggedIn ? "/rooms" : "/login");
    });
  }, [router]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator size="large" color="#4f46e5" />
    </View>
  );
}
