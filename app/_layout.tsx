import { Stack, useSegments, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ThemeProvider, useTheme } from "@/lib/theme-context";
import { AppHeader, SideMenu } from "@/components/nav";
import { BottomNav } from "@/components/BottomNav";

function RootLayoutNav() {
  const { user, session, loading } = useAuth();
  const { colors, mode } = useTheme();
  const segments = useSegments();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === "auth";
    if (session && user) {
      if (inAuthGroup) router.replace("/");
    } else {
      if (!inAuthGroup) router.replace("/auth");
    }
  }, [session, user, loading, segments]);

  const inAuthGroup = segments[0] === "auth";
  const showChrome = !!(session && user) && !inAuthGroup;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      {/* Center everything in a max-width column so content doesn't stretch
          edge-to-edge on wide/desktop windows. */}
      <View style={{ flex: 1, width: "100%", maxWidth: 1100, alignSelf: "center" }}>
        {showChrome && <AppHeader onMenu={() => setMenuOpen(true)} />}
        <View style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
        </View>
        {showChrome && <BottomNav />}
      </View>
      {showChrome && menuOpen && <SideMenu onClose={() => setMenuOpen(false)} />}
    </View>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <RootLayoutNav />
      </ThemeProvider>
    </AuthProvider>
  );
}
