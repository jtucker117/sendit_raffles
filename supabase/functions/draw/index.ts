// Send It Raffles — provably-fair draw (Random.org Signed API).
// Holds the Random.org key server-side. Verifies the caller is the host (or
// superadmin), draws ONE signed random integer over the confirmed tickets,
// records the signed certificate, completes the raffle, and — for a "mini" —
// awards the winner seat(s) in the parent raffle.
//
// Deploy: supabase functions deploy draw   (secret: RANDOM_ORG_KEY)

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RANDOM_ORG_KEY = Deno.env.get("RANDOM_ORG_KEY");
    if (!RANDOM_ORG_KEY) return json({ error: "RANDOM_ORG_KEY not set" }, 500);

    const body = await req.json();

    // ----- Verify a past draw's signature (no auth needed; proves fairness) -----
    if (body?.verify) {
      const { random, signature } = body;
      if (!random || !signature) return json({ error: "random + signature required" }, 400);
      const vr = await fetch("https://api.random.org/json-rpc/4/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "verifySignature", params: { random, signature } }),
      });
      const vj = await vr.json();
      if (vj.error) return json({ error: `Random.org: ${vj.error.message}` }, 502);
      return json({ authentic: !!vj.result?.authenticity });
    }

    // ----- Public draw record (no auth; powers the shareable result page) -----
    if (body?.record) {
      const rid = body.raffle_id;
      if (!rid) return json({ error: "raffle_id required" }, 400);
      const admin0 = createClient(SUPABASE_URL, SERVICE);
      const { data: raffle } = await admin0.from("raffles").select("id, title, prize, cover_url, capacity, status").eq("id", rid).single();
      if (!raffle || raffle.status !== "complete") return json({ error: "No public record for this raffle yet" }, 404);
      const { data: d } = await admin0.from("draws").select("winning_seat, winner_id, randomorg_signed, rounds, drawn_at").eq("raffle_id", rid).maybeSingle();
      if (!d) return json({ error: "No draw record" }, 404);
      const { data: w } = await admin0.from("profiles").select("display_name").eq("id", d.winner_id).single();
      const { count } = await admin0.from("tickets").select("*", { count: "exact", head: true }).eq("raffle_id", rid).eq("status", "confirmed");
      return json({
        title: raffle.title, prize: raffle.prize, cover_url: raffle.cover_url, capacity: raffle.capacity,
        winning_seat: d.winning_seat, winner_name: w?.display_name ?? "Winner",
        randomorg_signed: d.randomorg_signed, rounds: d.rounds, drawn_at: d.drawn_at, entrants: count ?? 0,
      });
    }

    const raffle_id = body?.raffle_id;
    if (!raffle_id) return json({ error: "raffle_id required" }, 400);

    // Who is calling?
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE);

    const { data: raffle } = await admin.from("raffles").select("*").eq("id", raffle_id).single();
    if (!raffle) return json({ error: "Raffle not found" }, 404);

    const { data: me } = await admin.from("profiles").select("is_superadmin").eq("id", user.id).single();
    if (raffle.host_id !== user.id && !me?.is_superadmin) return json({ error: "Only the host can draw" }, 403);
    if (raffle.status === "complete") return json({ error: "This raffle was already drawn" }, 409);

    // Eligible entrants = confirmed tickets, ordered for a stable mapping.
    const { data: tickets } = await admin
      .from("tickets").select("id, seat_number, owner_id")
      .eq("raffle_id", raffle_id).eq("status", "confirmed").order("seat_number");
    const N = tickets?.length ?? 0;
    if (N < 1) return json({ error: "No confirmed entrants to draw from" }, 400);

    // One signed integers request to Random.org.
    async function signedIntegers(n: number, max: number, replacement: boolean) {
      const res = await fetch("https://api.random.org/json-rpc/4/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "generateSignedIntegers",
          params: { apiKey: RANDOM_ORG_KEY, n, min: 1, max, replacement },
        }),
      });
      const j = await res.json();
      if (j.error) throw new Error(`Random.org: ${j.error.message}`);
      return j.result;
    }

    const mode = raffle.draw_mode === "elimination" ? "elimination" : "single";
    let signed: any = null;
    let rounds: { eliminated: number[]; signed?: any }[] | null = null;
    let winner: any;

    if (N === 1) {
      winner = tickets![0]; // nothing to randomize
    } else if (mode === "elimination") {
      // Multiple signed rounds: each removes ~half the remaining seats until one survives.
      rounds = [];
      let remaining = tickets!.map((_, i) => i); // indices into tickets
      while (remaining.length > 1) {
        const elimCount = Math.floor(remaining.length / 2);
        const result = await signedIntegers(elimCount, remaining.length, false);
        signed = result; // keep the last round's signed cert for verification
        const positions: number[] = result.random.data;
        const elimIdx = positions.map((p) => remaining[p - 1]);
        rounds.push({ eliminated: elimIdx.map((i) => tickets![i].seat_number), signed: result });
        const elimSet = new Set(elimIdx);
        remaining = remaining.filter((i) => !elimSet.has(i));
      }
      winner = tickets![remaining[0]];
    } else {
      const result = await signedIntegers(1, N, true);
      signed = result;
      winner = tickets![(result.random.data[0] as number) - 1];
    }

    const { data: winnerProfile } = await admin.from("profiles").select("display_name").eq("id", winner.owner_id).single();

    // Record the signed certificate + complete the raffle.
    const { data: draw, error: drawErr } = await admin.from("draws").insert({
      raffle_id,
      winning_ticket_id: winner.id,
      winning_seat: winner.seat_number,
      winner_id: winner.owner_id,
      randomorg_signed: signed,
      rounds,
      verify_url: "https://api.random.org/",
    }).select().single();
    if (drawErr) return json({ error: drawErr.message }, 500);

    await admin.from("raffles").update({ status: "complete" }).eq("id", raffle_id);

    // Mini payoff: award the winner seat(s) in the parent raffle.
    let awardedSeats: number[] = [];
    if (raffle.parent_raffle_id) {
      const parentId = raffle.parent_raffle_id;
      const { data: parent } = await admin.from("raffles").select("capacity").eq("id", parentId).single();
      const { data: taken } = await admin.from("tickets").select("seat_number").eq("raffle_id", parentId);
      const used = new Set((taken ?? []).map((t: any) => t.seat_number));
      const openSeats: number[] = [];
      for (let s = 1; s <= (parent?.capacity ?? 0) && openSeats.length < (raffle.seats_awarded ?? 1); s++) {
        if (!used.has(s)) openSeats.push(s);
      }
      for (const seat of openSeats) {
        await admin.from("tickets").insert({
          raffle_id: parentId, seat_number: seat, owner_id: winner.owner_id,
          type: "free", status: "confirmed",
        });
        awardedSeats.push(seat);
      }
    }

    return json({
      ok: true,
      winning_seat: winner.seat_number,
      winner_id: winner.owner_id,
      winner_name: winnerProfile?.display_name ?? "Winner",
      entrants: N,
      mode,
      rounds,
      awarded_parent_seats: awardedSeats,
      draw_id: draw.id,
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
