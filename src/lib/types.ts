export type Role = "owner" | "manager" | "member";
export type Priority = "none" | "low" | "medium" | "high";

export interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  is_admin: boolean;
  last_seen: string | null;
  created_at: string;
}

export interface Board {
  id: string;
  owner_id: string;
  title: string;
  created_at: string;
}

export interface BoardMember {
  board_id: string;
  user_id: string;
  role: Role;
  profiles: Profile;
}

export interface BoardList {
  id: string;
  board_id: string;
  title: string;
  color: string;
  position: number;
}

export interface Attachment {
  id: string;
  card_id: string;
  uploaded_by: string | null;
  storage_path: string;
  original_name: string;
  mime_type: string | null;
  size_bytes: number;
  created_at: string;
}

export interface Card {
  id: string;
  list_id: string;
  title: string;
  description: string;
  created_by: string | null;
  due_date: string | null;
  due_time: string | null;
  priority: Priority;
  position: number;
  created_at?: string;
  card_assignees: { user_id: string; profiles: Profile }[];
  card_attachments: Attachment[];
}

export interface BoardSummary {
  id: string;
  title: string;
  created_at: string;
  owner_id: string;
  role: Role;
  member_count: number;
}
