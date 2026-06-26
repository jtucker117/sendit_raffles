import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { radius, AppColors } from "@/lib/theme";

const LOGO = require("../assets/logo.png");

// Persistent top bar with a hamburger that opens the side menu.
export function AppHeader({ onMenu }: { onMenu: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onMenu} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="menu" size={26} color={colors.text} />
      </TouchableOpacity>
      <Image source={LOGO} style={styles.logo} resizeMode="contain" />
      <View style={{ width: 26 }} />
    </View>
  );
}

type Item = { label: string; icon: keyof typeof Ionicons.glyphMap; href: string };

// Slide-in side menu (overlay). Rendered at the app root so it covers everything.
export function SideMenu({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { user, isSuperadmin, isHostApproved, signOut } = useAuth();
  const { colors, mode, toggle } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const items: Item[] = [
    { label: "Home", icon: "home-outline", href: "/" },
    { label: "Raffles", icon: "pricetags-outline", href: "/player/browse" },
    { label: "Messages", icon: "chatbubble-ellipses-outline", href: "/messages" },
    { label: "Profile", icon: "person-outline", href: "/profile" },
  ];
  if (user?.role === "host" && isHostApproved) {
    items.splice(1, 0,
      { label: "Dashboard", icon: "speedometer-outline", href: "/host/dashboard" },
      { label: "Create game", icon: "add-circle-outline", href: "/host/create-raffle" },
    );
    items.push({ label: "Groups", icon: "people-outline", href: "/host/groups" });
  }
  if (isSuperadmin) items.push({ label: "All accounts", icon: "shield-checkmark-outline", href: "/admin/users" });

  const go = (href: string) => { onClose(); router.push(href as any); };

  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={styles.panel}>
        <View style={styles.panelHead}>
          <Image source={LOGO} style={styles.panelLogo} resizeMode="contain" />
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{user?.display_name}</Text>
            <Text style={styles.role}>{user?.role === "host" ? "Host" : "Player"}{isSuperadmin ? " · Superadmin" : ""}</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color={colors.muted} />
          </TouchableOpacity>
        </View>

        <View style={styles.items}>
          {items.map((it) => (
            <TouchableOpacity key={it.href} style={styles.item} onPress={() => go(it.href)}>
              <Ionicons name={it.icon} size={22} color={colors.text} />
              <Text style={styles.itemText}>{it.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Light / dark toggle */}
        <TouchableOpacity style={styles.toggle} onPress={toggle}>
          <Ionicons name={mode === "dark" ? "sunny-outline" : "moon-outline"} size={22} color={colors.text} />
          <Text style={styles.itemText}>{mode === "dark" ? "Light mode" : "Dark mode"}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.signOut} onPress={() => { onClose(); signOut(); }}>
          <Ionicons name="log-out-outline" size={22} color={colors.red} />
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export const HEADER_HEIGHT = 56;

const makeStyles = (colors: AppColors) => StyleSheet.create({
  header: {
    height: HEADER_HEIGHT,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  logo: { width: 38, height: 38 },

  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, flexDirection: "row" },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.55)" },
  panel: { width: 276, maxWidth: "82%", backgroundColor: colors.surface, borderRightWidth: 1, borderRightColor: colors.border, paddingTop: 18, paddingHorizontal: 14, height: "100%" },
  panelHead: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 6, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 10 },
  panelLogo: { width: 44, height: 44 },
  name: { color: colors.text, fontSize: 16, fontWeight: "800" },
  role: { color: colors.muted, fontSize: 12, marginTop: 1 },
  items: { gap: 4 },
  item: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 13, paddingHorizontal: 10, borderRadius: radius.md },
  itemText: { color: colors.text, fontSize: 16, fontWeight: "600" },
  toggle: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 13, paddingHorizontal: 10, marginTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  signOut: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 13, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: colors.border },
  signOutText: { color: colors.red, fontSize: 16, fontWeight: "700" },
});
