export interface Persona {
  id: string;
  role: string;
}

export interface Room {
  id: string;
  name: string;
  description: string;
  personas?: Persona[];
}

export interface ConversationConfig {
  user_profile: {
    experience?: string;
    task?: string;
    uncertainty?: string;
    use?: string;
  };
  project_config: {
    infra_manager?: string;
    infra_type?: string;
    contract_type?: string;
    contract_option?: string;
    project_value?: string;
  };
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

export interface ConfigOptions {
  experience: { label: string; value: string }[];
  task: { label: string; value: string }[];
  uncertainty: { label: string; value: string }[];
  use: { label: string; value: string }[];
  infra_managers: string[];
  infra_types: string[];
  contract_types: string[];
  contract_options: string[];
  project_values: string[];
}

// SSE event types
export type SSEEvent =
  | { type: "status"; content: string }
  | { type: "token"; content: string }
  | { type: "done"; panel: string[]; message_id: string }
  | { type: "error"; content: string };
