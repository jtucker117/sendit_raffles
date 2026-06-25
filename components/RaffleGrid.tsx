import { View, useWindowDimensions } from "react-native";
import { RaffleCard, RaffleCardData } from "./RaffleCard";

// Responsive raffle grid: 1 column on phones, 2 on desktop/wide screens.
export function RaffleGrid({ raffles, onPress }: { raffles: RaffleCardData[]; onPress: (id: string) => void }) {
  const { width } = useWindowDimensions();
  const cols = width >= 900 ? 2 : 1;

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
      {raffles.map((r) => (
        <View key={r.id} style={{ width: cols === 1 ? "100%" : "48.8%" }}>
          <RaffleCard raffle={r} onPress={() => onPress(r.id)} />
        </View>
      ))}
    </View>
  );
}
