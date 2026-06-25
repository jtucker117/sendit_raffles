import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Image } from "react-native";
import { useAuth } from "@/lib/auth-context";
import { colors, radius } from "@/lib/theme";

const LOGO = require("../../assets/logo.png");

interface SignInScreenProps {
  onSwitchToSignUp: () => void;
}

export function SignInScreen({ onSwitchToSignUp }: SignInScreenProps) {
  const { signIn, loading, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSignIn() {
    setFormError(null);
    if (!email.trim()) { setFormError("Email is required"); return; }
    if (!password) { setFormError("Password is required"); return; }
    try {
      await signIn(email, password);
    } catch (err) {
      // Error already set in context
    }
  }

  const displayError = formError || error;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Image source={LOGO} style={styles.logo} resizeMode="contain" />
      <Text style={styles.title}>Welcome back</Text>
      <Text style={styles.subtitle}>Sign in to Send It Raffles</Text>

      {displayError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{displayError}</Text>
        </View>
      )}

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          placeholderTextColor={colors.faint}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          editable={!loading}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor={colors.faint}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!loading}
        />
      </View>

      <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleSignIn} disabled={loading}>
        {loading ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.buttonText}>Sign In</Text>}
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Don't have an account? </Text>
        <TouchableOpacity onPress={onSwitchToSignUp} disabled={loading}>
          <Text style={styles.footerLink}>Create one</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.securityNote}>
        <Text style={styles.securityText}>🔐 Your credentials are encrypted. We never store your password in plain text.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, paddingTop: 64, paddingBottom: 60, alignItems: "stretch" },
  logo: { width: 150, height: 150, alignSelf: "center", marginBottom: 12 },
  title: { fontSize: 26, fontWeight: "800", color: colors.text, marginBottom: 6, letterSpacing: -0.5, textAlign: "center" },
  subtitle: { fontSize: 15, color: colors.muted, marginBottom: 28, textAlign: "center" },
  errorBox: { backgroundColor: colors.red, borderRadius: radius.md, padding: 12, marginBottom: 16 },
  errorText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 12.5, fontWeight: "600", color: colors.text, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: colors.inputBorder, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 12, fontSize: 15, color: colors.text, backgroundColor: colors.surfaceAlt },
  button: { backgroundColor: colors.red, paddingVertical: 14, borderRadius: radius.md, alignItems: "center", marginTop: 6, marginBottom: 16 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.onAccent, fontSize: 16, fontWeight: "700" },
  footer: { flexDirection: "row", justifyContent: "center", marginBottom: 20 },
  footerText: { color: colors.muted, fontSize: 13 },
  footerLink: { color: colors.red, fontSize: 13, fontWeight: "700" },
  securityNote: { backgroundColor: colors.greenSoft, borderRadius: radius.md, padding: 12 },
  securityText: { fontSize: 12, color: colors.green, lineHeight: 18, fontWeight: "500" },
});
