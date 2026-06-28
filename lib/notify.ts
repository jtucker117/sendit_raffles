import { Alert, Platform } from "react-native";

// Cross-platform alert. RN-Web doesn't render Alert.alert, so on web we use the
// browser dialog. (The root layout also polyfills Alert.alert itself so existing
// Alert.alert calls work on web — this is the preferred helper for new code.)
export function notify(title: string, message?: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.alert(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}

// Show an error with a consistent "send to support" note. Use in catch blocks.
export function showError(e: any, context = "Something went wrong") {
  const msg = e?.message ?? (typeof e === "string" ? e : "Unexpected error.");
  notify(context, `${msg}\n\n📸 Please screenshot this and send it to support so we can fix it.`);
}
