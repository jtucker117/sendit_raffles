import { Stack, useSegments, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, Alert, Platform } from "react-native";
import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ThemeProvider, useTheme } from "@/lib/theme-context";
import { AppHeader, SideMenu } from "@/components/nav";
import { BottomNav } from "@/components/BottomNav";

// React Native Web doesn't render Alert.alert, so on web every error/confirm was
// silently doing nothing. Polyfill it with the browser dialog so all existing
// Alert.alert calls (and their button callbacks) work app-wide.
if (Platform.OS === "web" && typeof window !== "undefined") {
  (Alert as any).alert = (title: string, message?: string, buttons?: any[]) => {
    const text = message ? `${title}\n\n${message}` : title;
    if (buttons && buttons.length > 1) {
      const ok = window.confirm(text);
      const cancel = buttons.find((b) => b?.style === "cancel");
      const confirm = buttons.find((b) => b?.style !== "cancel") ?? buttons[buttons.length - 1];
      if (ok) confirm?.onPress?.();
      else cancel?.onPress?.();
    } else {
      window.alert(text);
      buttons?.[0]?.onPress?.();
    }
  };
}

function RootLayoutNav() {
  const { user, session, loading } = useAuth();
  const { colors, mode } = useTheme();
  const segments = useSegments();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const isPublic = segments[0] === "r"; // public shareable draw-record pages

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === "auth";
    if (session && user) {
      if (inAuthGroup) router.replace("/");
    } else {
      if (!inAuthGroup && !isPublic) router.replace("/auth");
    }
  }, [session, user, loading, segments]);

  const inAuthGroup = segments[0] === "auth";
  const showChrome = !!(session && user) && !inAuthGroup && !isPublic;

  return (
    <View style={{ flex: 1, backgroundColor: inAuthGroup ? "#0a0a0c" : colors.bg }}>
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
