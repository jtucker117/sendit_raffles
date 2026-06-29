import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, Pressable, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname } from "expo-router";
import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { radius, AppColors } from "@/lib/theme";
import { supabase } from "@/lib/supabase";

const LOGO = require("../assets/logo.png");

// Human-readable account role, accounting for pending/rejected host requests.
function roleLabel(user: any, isSuperadmin: boolean): string {
  if (isSuperadmin) return "Superadmin";
  if (user?.role === "host") {
    if (user?.host_approved === true) return "Host";
    if (user?.host_approved === null) return "Player · host request pending";
    return "Player"; // host_approved === false (denied) — treated as player
  }
  return "Player";
}

// Persistent top bar: hamburger (side menu) left, logo center, profile menu right.
export function AppHeader({ onMenu }: { onMenu: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const pathname = usePathname();
  const { user, isSuperadmin, refreshProfile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user?.id) { setUnread(0); return; }
    supabase.from("direct_messages").select("id", { count: "exact", head: true })
      .eq("recipient_id", user.id).is("read_at", null)
      .then(({ count }) => setUnread(count ?? 0));
  }, [user?.id, pathname]);

  const go = (href: string) => { setOpen(false); router.push(href as any); };

  async function chatWithCreator() {
    setOpen(false);
    // Find the platform creator (superadmin) to start a DM with.
    const { data } = await supabase.from("profiles").select("id").eq("is_superadmin", true).limit(1).maybeSingle();
    if (data?.id && data.id !== user?.id) router.push(`/messages/chat/${data.id}`);
    else router.push("/messages");
  }

  async function requestHost() {
    setOpen(false);
    if (!user?.id) return;
    // Flip to a pending host — the creator approves/denies in Host requests.
    const { error } = await supabase.from("profiles").update({ role: "host", host_approved: null }).eq("id", user.id);
    if (error) { Alert.alert("Couldn't send request", error.message); return; }
    await refreshProfile();
    Alert.alert("Request sent ✅", "The creator will review it. You'll get host tools once you're approved.");
  }

  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onMenu} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="menu" size={26} color={colors.text} />
        {unread > 0 && <View style={styles.navDot} />}
      </TouchableOpacity>
      <Image source={LOGO} style={styles.logo} resizeMode="contain" />
      <TouchableOpacity onPress={() => setOpen(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="person-circle-outline" size={28} color={colors.text} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.ddBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.dropdown} onPress={() => {}}>
            <View style={styles.ddHead}>
              <Text style={styles.ddName} numberOfLines={1}>{user?.display_name ?? "My profile"}</Text>
              <Text style={styles.ddRole}>{roleLabel(user, isSuperadmin)}</Text>
            </View>
            <DDItem icon="add-circle-outline" label="Follow a host (enter code)" onPress={() => go("/join")} colors={colors} />
            <DDItem icon="person-outline" label="Edit my profile" onPress={() => go("/profile")} colors={colors} />
            <DDItem icon="lock-closed-outline" label="Change password" onPress={() => go("/settings/password")} colors={colors} />
            <DDItem icon="gift-outline" label="My referrals" onPress={() => go("/referrals")} colors={colors} />
            {!isSuperadmin && <DDItem icon="chatbubble-ellipses-outline" label="Chat with creator / support" onPress={chatWithCreator} colors={colors} />}
            {user?.role === "player" && (
              <DDItem icon="rocket-outline" label="Request to be a host" onPress={requestHost} colors={colors} />
            )}
            {user?.role === "host" && user?.host_approved === null && (
              <View style={ddItemStyle.row}>
                <Ionicons name="time-outline" size={20} color={colors.muted} />
                <Text style={[ddItemStyle.text, { color: colors.muted }]}>Host request pending…</Text>
              </View>
            )}
            {isSuperadmin && (
              <DDItem icon="shield-checkmark-outline" label="Host requests" onPress={() => go("/admin/users")} colors={colors} />
            )}
            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />
            <TouchableOpacity style={ddItemStyle.row} onPress={() => { setOpen(false); signOut(); }}>
              <Ionicons name="log-out-outline" size={20} color={colors.red} />
              <Text style={[ddItemStyle.text, { color: colors.red }]}>Sign out</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function DDItem({ icon, label, onPress, colors }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; colors: AppColors }) {
  return (
    <TouchableOpacity style={ddItemStyle.row} onPress={onPress}>
      <Ionicons name={icon} size={20} color={colors.text} />
      <Text style={[ddItemStyle.text, { color: colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const ddItemStyle = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  text: { fontSize: 15, fontWeight: "600" },
});

type Item = { label: string; icon: keyof typeof Ionicons.glyphMap; href: string };

// Slide-in side menu (overlay). Rendered at the app root so it covers everything.
export function SideMenu({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { user, isSuperadmin, isHostApproved, signOut } = useAuth();
  const { colors, mode, toggle } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    supabase.from("direct_messages").select("id", { count: "exact", head: true })
      .eq("recipient_id", user.id).is("read_at", null)
      .then(({ count }) => setUnread(count ?? 0));
  }, [user?.id]);

  const items: Item[] = [
    { label: "Games", icon: "home-outline", href: "/" },
    { label: "Follow a host", icon: "add-circle-outline", href: "/join" },
    { label: "Messages", icon: "chatbubble-ellipses-outline", href: "/messages" },
    { label: "Profile", icon: "person-outline", href: "/profile" },
  ];
  if (user?.role === "host" && isHostApproved) {
    items.splice(1, 0,
      { label: "Dashboard", icon: "speedometer-outline", href: "/host/dashboard" },
      { label: "Create game", icon: "add-circle-outline", href: "/host/create-raffle" },
    );
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
            <Text style={styles.role}>{roleLabel(user, isSuperadmin)}</Text>
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
              {it.href === "/messages" && unread > 0 && (
                <View style={styles.menuBadge}><Text style={styles.menuBadgeText}>{unread > 99 ? "99+" : unread}</Text></View>
              )}
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
  navDot: { position: "absolute", top: -3, right: -4, minWidth: 10, height: 10, borderRadius: 5, backgroundColor: colors.red, borderWidth: 1.5, borderColor: colors.surface },

  ddBackdrop: { flex: 1, alignItems: "flex-end", paddingTop: HEADER_HEIGHT + 6, paddingRight: 10, backgroundColor: "rgba(0,0,0,0.25)" },
  dropdown: { minWidth: 230, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingVertical: 6, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  ddHead: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 4 },
  ddName: { color: colors.text, fontSize: 15, fontWeight: "800" },
  ddRole: { color: colors.muted, fontSize: 12, marginTop: 2 },

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
  menuBadge: { marginLeft: "auto", backgroundColor: colors.red, borderRadius: radius.pill, minWidth: 22, height: 22, paddingHorizontal: 7, alignItems: "center", justifyContent: "center" },
  menuBadgeText: { color: colors.onAccent, fontSize: 12, fontWeight: "900" },
  toggle: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 13, paddingHorizontal: 10, marginTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  signOut: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 13, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: colors.border },
  signOutText: { color: colors.red, fontSize: 16, fontWeight: "700" },
});
