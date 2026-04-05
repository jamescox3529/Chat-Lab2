"use client";

import { useRouter, useParams } from "next/navigation";
import { useState } from "react";
import ChatInterface from "@/components/chat/ChatInterface";

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const convId = params?.convId as string;
  const [navRefresh, setNavRefresh] = useState(0);

  // "New conversation" from the nav rail goes home so the user can
  // pick a pillar → room → configure a fresh chat.
  function handleNewChat() {
    router.push("/");
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
