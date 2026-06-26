import { useState } from "react";
import { supabase } from "./supabase";

export interface HostGroup {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  host_id: string;
  role: "owner" | "admin" | "member";
  joined_at: string;
}

export function useHostGroups() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch the groups this user can see. RLS already limits host_groups SELECT to
  // groups you own or are a member of, so a plain select returns exactly those.
  async function fetchMyGroups(_userId: string) {
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from("host_groups")
        .select("*")
        .order("created_at", { ascending: false });

      if (queryError) throw queryError;
      return (data ?? []) as HostGroup[];
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch groups";
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }

  // Create a new host group
  async function createGroup(name: string, description: string, ownerId: string) {
    setLoading(true);
    setError(null);
    try {
      const { data, error: insertError } = await supabase
        .from("host_groups")
        .insert([{ name, description, owner_id: ownerId }])
        .select()
        .single();

      if (insertError) throw insertError;

      // Auto-add owner as member
      await supabase.from("group_members").insert([
        {
          group_id: data.id,
          host_id: ownerId,
          role: "owner",
        },
      ]);

      return data as HostGroup;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create group";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  // Request to join a group (creates pending membership)
  async function requestToJoinGroup(groupId: string, hostId: string) {
    setLoading(true);
    setError(null);
    try {
      const { data, error: insertError } = await supabase
        .from("group_members")
        .insert([
          {
            group_id: groupId,
            host_id: hostId,
            role: "member",
          },
        ])
        .select()
        .single();

      if (insertError) throw insertError;
      return data as GroupMember;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to join group";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  // Get group members
  async function fetchGroupMembers(groupId: string) {
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from("group_members")
        .select("*, profiles:host_id(display_name, email)")
        .eq("group_id", groupId);

      if (queryError) throw queryError;
      return data as (GroupMember & { profiles: { display_name: string; email: string } })[];
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch members";
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }

  // Update a group
  async function updateGroup(groupId: string, updates: Partial<HostGroup>) {
    setLoading(true);
    setError(null);
    try {
      const { data, error: updateError } = await supabase
        .from("host_groups")
        .update(updates)
        .eq("id", groupId)
        .select()
        .single();

      if (updateError) throw updateError;
      return data as HostGroup;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update group";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  // Remove member from group
  async function removeMember(groupId: string, hostId: string) {
    setLoading(true);
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from("group_members")
        .delete()
        .eq("group_id", groupId)
        .eq("host_id", hostId);

      if (deleteError) throw deleteError;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to remove member";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  return {
    loading,
    error,
    fetchMyGroups,
    createGroup,
    requestToJoinGroup,
    fetchGroupMembers,
    updateGroup,
    removeMember,
  };
}
