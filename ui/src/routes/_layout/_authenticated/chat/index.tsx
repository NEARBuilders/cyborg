import { createFileRoute } from "@tanstack/react-router";
import { ChatPage } from "../../../../components/chat/chat-page";

export const Route = createFileRoute("/_layout/_authenticated/chat/")({
  component: IndexPage,
});

function IndexPage() {
  return (
    <div className="flex flex-col h-full">
      <ChatPage />
    </div>
  );
}
