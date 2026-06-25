import { Stack, useSegments, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { useEffect } from "react";

function RootLayoutNav() {
  const { user, session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return; // Still checking auth state

    const inAuthGroup = segments[0] === "auth";

    if (session && user) {
      // Signed in — if we're still on the login screen, go to home.
      if (inAuthGroup) router.replace("/");
    } else {
      // Signed out — if we're not already on the login screen, go there.
      if (!inAuthGroup) router.replace("/auth");
    }
  }, [session, user, loading, segments]);

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
