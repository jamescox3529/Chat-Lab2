"use client";

import { useRouter, useParams } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { createConversation, setAuthToken } from "@/lib/api";
import ChatInterface from "@/components/chat/ChatInterface";

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const { getToken } = useAuth();
  const convId = params?.convId as string;
  const [navRefresh, setNavRefresh] = useState(0);

  async function handleNewChat() {
    try {
      const token = await getToken();
      setAuthToken(token);
      const conv = await createConversation("railway_engineering", {
        user_profile: {},
        project_config: {},
        document_ids: [],
      });
      setNavRefresh((n) => n + 1);
      router.push(`/chat/${conv.id}`);
    } catch (err) {
      router.push("/");
    }
  }

  if (!convId) return null;

  return (
    <ChatInterface
      convId={convId}
      onNewChat={handleNewChat}
      navRefreshTrigger={navRefresh}
    />
  );
}
