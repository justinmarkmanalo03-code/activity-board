"use client";

import { supabase } from "@/lib/supabase";
import {
  enqueueMutation,
  getPendingCount,
  isOnline,
} from "@/lib/offline";

export type OfflineTable = "boards" | "lists" | "cards" | "card_assignees" | "card_attachments" | "profiles" | "board_members";

export async function offlineInsert(table: OfflineTable, payload: any): Promise<void> {
  if (isOnline()) {
    const { error } = await supabase.from(table).insert(payload);
    if (error) throw error;
  } else {
    await enqueueMutation({ type: "insert", table, payload });
  }
}

export async function offlineUpdate(
  table: OfflineTable,
  payload: any,
  filters: Record<string, any>
): Promise<void> {
  if (isOnline()) {
    let query = supabase.from(table).update(payload);
    for (const [col, val] of Object.entries(filters)) {
      query = query.eq(col, val);
    }
    const { error } = await query;
    if (error) throw error;
  } else {
    await enqueueMutation({ type: "update", table, payload, filters });
  }
}

export async function offlineDelete(table: OfflineTable, filters: Record<string, any>): Promise<void> {
  if (isOnline()) {
    let query = supabase.from(table).delete();
    for (const [col, val] of Object.entries(filters)) {
      query = query.eq(col, val);
    }
    const { error } = await query;
    if (error) throw error;
  } else {
    await enqueueMutation({ type: "delete", table, filters });
  }
}

export async function offlineRpc(rpcName: string, args?: any): Promise<void> {
  if (isOnline()) {
    const { error } = await supabase.rpc(rpcName, args ?? {});
    if (error) throw error;
  } else {
    await enqueueMutation({ type: "rpc", table: "", rpcName, rpcArgs: args });
  }
}

export async function getOfflinePendingCount(): Promise<number> {
  return getPendingCount();
}
