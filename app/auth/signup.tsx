import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useAuth } from "@/lib/auth-context";

interface SignUpScreenProps {
  onSwitchToSignIn: () => void;
}

export function SignUpScreen({ onSwitchToSignIn }: SignUpScreenProps) {
  const { signUp, loading, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"host" | "player">("player");
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSignUp() {
    setFormError(null);

    // Validation
    if (!email.trim()) {
      setFormError("Email is required");
      return;
    }
    if (!email.includes("@")) {
      setFormError("Please enter a valid email");
      return;
    }
    if (!displayName.trim()) {
      setFormError("Display name is required");
      return;
    }
    if (password.length < 8) {
      setFormError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Passwords do not match");
      return;
    }

    try {
      await signUp(email, password, displayName, role);
      // Success — auth context will handle navigation
    } catch (err) {
      // Error already set in context
    }
  }

  const displayError = formError || error;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Join Send It Raffles</Text>

        {displayError && <View style={styles.errorBox}>
            <Text style={styles.errorText}>{displayError}</Text>
          </View>}

        {/* Role Selection */}
        <Text style={styles.label}>I'm a...</Text>
        <View style={styles.roleButtons}>
          <TouchableOpacity
            style={[styles.roleButton, role === "player" && styles.roleButtonActive]}
            onPress={() => setRole("player")}
          >
            <Text style={[styles.roleButtonText, role === "player" && styles.roleButtonTextActive]}>
              Player
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.roleButton, role === "host" && styles.roleButtonActive]}
            onPress={() => setRole("host")}
          >
            <Text style={[styles.roleButtonText, role === "host" && styles.roleButtonTextActive]}>
              Host
            </Text>
          </TouchableOpacity>
        </View>

        {/* Form Fields */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Display Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Your name"
            placeholderTextColor="#a0a0a5"
            value={displayName}
            onChangeText={setDisplayName}
            editable={!loading}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor="#a0a0a5"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!loading}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Password (min. 8 characters)</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor="#a0a0a5"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!loading}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Confirm Password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor="#a0a0a5"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            editable={!loading}
          />
        </View>

        {/* Sign Up Button */}
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSignUp}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Create Account</Text>
          )}
        </TouchableOpacity>

        {/* Switch to Sign In */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={onSwitchToSignIn} disabled={loading}>
            <Text style={styles.footerLink}>Sign In</Text>
          </TouchableOpacity>
        </View>

        {/* Security note */}
        <View style={styles.securityNote}>
          <Text style={styles.securityText}>
            🔒 Your password is encrypted. We'll send a verification email to confirm your account.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f2f2f7",
  },
  content: {
    padding: 24,
    paddingTop: 40,
    paddingBottom: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1c1c1e",
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: "#8a8a8e",
    marginBottom: 24,
  },
  errorBox: {
    backgroundColor: "#ff3b30",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1c1c1e",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  roleButtons: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 24,
  },
  roleButton: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#d1d1d6",
    backgroundColor: "#fff",
    alignItems: "center",
  },
  roleButtonActive: {
    borderColor: "#007aff",
    backgroundColor: "#007aff",
  },
  roleButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1c1c1e",
  },
  roleButtonTextActive: {
    color: "#fff",
  },
  field: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#1c1c1e",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d1d6",
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    fontSize: 15,
    color: "#1c1c1e",
    backgroundColor: "#fff",
  },
  button: {
    backgroundColor: "#007aff",
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 20,
  },
  footerText: {
    color: "#8a8a8e",
    fontSize: 13,
  },
  footerLink: {
    color: "#007aff",
    fontSize: 13,
    fontWeight: "600",
  },
  securityNote: {
    backgroundColor: "#34c75915",
    borderRadius: 11,
    padding: 12,
  },
  securityText: {
    fontSize: 12,
    color: "#34c759",
    lineHeight: 18,
    fontWeight: "500",
  },
});
