import { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname } from "expo-router";
import { useTheme } from "@/lib/theme-context";
import { AppColors } from "@/lib/theme";

interface Tab {
  href: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: keyof typeof Ionicons.glyphMap;
  match: (p: string) => boolean;
}

// Primary mobile chrome: Games · Tickets · Updates · Profile.
const TABS: Tab[] = [
  { href: "/", label: "Games", icon: "compass-outline", active: "compass", match: (p) => p === "/" || p.startsWith("/player") || p.startsWith("/raffle") },
  { href: "/tickets", label: "Tickets", icon: "pricetags-outline", active: "pricetags", match: (p) => p.startsWith("/tickets") },
  { href: "/announcements", label: "Updates", icon: "megaphone-outline", active: "megaphone", match: (p) => p.startsWith("/announcements") || p.startsWith("/messages/announcement") },
  { href: "/profile", label: "Profile", icon: "person-outline", active: "person", match: (p) => p.startsWith("/profile") },
];

export function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.bar}>
      {TABS.map((t) => {
        const active = t.match(pathname);
        return (
          <TouchableOpacity key={t.href} style={styles.tab} onPress={() => router.replace(t.href as any)} activeOpacity={0.7}>
            <Ionicons name={active ? t.active : t.icon} size={22} color={active ? colors.red : colors.muted} />
            <Text style={[styles.label, active && { color: colors.red }]}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Height to pad screen content so the bar never covers it.
export const BOTTOM_NAV_HEIGHT = 64;

const makeStyles = (colors: AppColors) => StyleSheet.create({
  bar: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    height: BOTTOM_NAV_HEIGHT,
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: 6,
    paddingTop: 8,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  label: { fontSize: 10.5, color: colors.muted, fontWeight: "700" },
});
