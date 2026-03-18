import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#000" },
          headerTintColor: "#fff",
          headerTitleStyle: { fontWeight: "bold" },
        }}
      >
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="rooms/index" options={{ title: "Rooms" }} />
        <Stack.Screen name="rooms/[id]" options={{ title: "Chat" }} />
        <Stack.Screen name="profile" options={{ title: "Profile" }} />
      </Stack>
    </>
  );
}
