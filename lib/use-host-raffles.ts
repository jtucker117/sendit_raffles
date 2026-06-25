import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

export interface Raffle {
  id: string;
  host_id: string;
  title: string;
  prize: string | null;
  description: string | null;
  cover_url: string | null;
  capacity: number;
  free_seat_limit: number;
  entry_word: string;
  amount_cents: number;
  status: string;
  created_at: string;
}

// Fetch all raffles for a host (newest first) — backs the host feed.
export function useHostRaffles(hostId?: string) {
  const [raffles, setRaffles] = useState<Raffle[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!hostId) {
      setRaffles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("raffles")
      .select("*")
      .eq("host_id", hostId)
      .order("created_at", { ascending: false });
    if (!error && data) setRaffles(data as Raffle[]);
    setLoading(false);
  }, [hostId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { raffles, loading, reload };
}
