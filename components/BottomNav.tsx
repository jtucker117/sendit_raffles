import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { colors } from "@/lib/theme";

interface Tab {
  href: string;
  label: string;
  icon: string;
  match: (p: string) => boolean;
  super?: boolean;
}

const TABS: Tab[] = [
  { href: "/", label: "Home", icon: "🏠", match: (p) => p === "/" },
  { href: "/player/browse", label: "Raffles", icon: "🎟️", match: (p) => p.startsWith("/player") || p.startsWith("/raffle") },
  { href: "/messages", label: "Messages", icon: "💬", match: (p) => p.startsWith("/messages") },
  { href: "/profile", label: "Profile", icon: "👤", match: (p) => p.startsWith("/profile") },
  { href: "/admin/users", label: "Admin", icon: "🛡️", match: (p) => p.startsWith("/admin"), super: true },
];

export function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { isSuperadmin } = useAuth();
  const tabs = TABS.filter((t) => !t.super || isSuperadmin);

  return (
    <View style={styles.bar}>
      {tabs.map((t) => {
        const active = t.match(pathname);
        return (
          <TouchableOpacity key={t.href} style={styles.tab} onPress={() => router.replace(t.href as any)} activeOpacity={0.7}>
            <Text style={[styles.icon, active && styles.iconActive]}>{t.icon}</Text>
            <Text style={[styles.label, active && styles.labelActive]}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Height to pad screen content so the bar never covers it.
export const BOTTOM_NAV_HEIGHT = 64;

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    height: BOTTOM_NAV_HEIGHT,
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: 6,
    paddingTop: 6,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2 },
  icon: { fontSize: 20, opacity: 0.5 },
  iconActive: { opacity: 1 },
  label: { fontSize: 10, color: colors.muted, fontWeight: "600" },
  labelActive: { color: colors.red },
});
