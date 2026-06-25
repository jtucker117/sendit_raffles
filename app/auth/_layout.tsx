import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { SignUpScreen } from "./signup";
import { SignInScreen } from "./signin";

type AuthMode = "signup" | "signin";

export default function AuthLayout() {
  const [mode, setMode] = useState<AuthMode>("signin");

  return (
    <View style={styles.container}>
      {mode === "signup" ? (
        <SignUpScreen onSwitchToSignIn={() => setMode("signin")} />
      ) : (
        <SignInScreen onSwitchToSignUp={() => setMode("signup")} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
