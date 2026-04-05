export interface Pillar {
  id: string;
  name: string;
}

export interface PillarDetail extends Pillar {
  rooms: RoomSummary[];
}

export interface RoomSummary {
  id: string;
  name: string;
  description: string;
  pillar: string;
  persona_count: number;
}

export interface Persona {
  id: string;
  role: string;
}

export interface Room {
  id: string;
  name: string;
  description: string;
  pillar: string;
  persona_count: number;
  personas?: Persona[];
}

export interface ConversationConfig {
  user_profile: {
    experience?: string;
    task?: string;
    uncertainty?: string;
    use?: string;
  };
  project_config: Record<string, string>;
  document_ids: string[];
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  panel: string[];
  timestamp: string;
}

export interface Conversation {
  id: string;
  title: string;
  room_id: string;
  created_at: string;
  updated_at: string;
  config: ConversationConfig;
  messages: Message[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  room_id: string;
  room_name: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface Document {
  id: string;
  name: string;
  char_count: number;
  uploaded_at: string;
}

export interface ProjectContextField {
  key: string;
  label: string;
  options: string[];
}

export interface ConfigOptions {
  experience: { label: string; value: string }[];
  task: { label: string; value: string }[];
  uncertainty: { label: string; value: string }[];
  use: { label: string; value: string }[];
  project_fields: ProjectContextField[];
}

// SSE event types
export type SSEEvent =
  | { type: "status"; content: string }
  | { type: "token"; content: string }
  | { type: "done"; panel: string[]; message_id: string }
  | { type: "error"; content: string };
