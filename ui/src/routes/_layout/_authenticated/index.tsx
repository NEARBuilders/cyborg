import { createFileRoute } from "@tanstack/react-router";
import { ChatPage } from "../../../components/chat/ChatPage";

export const Route = createFileRoute("/_layout/_authenticated/")({
  component: IndexPage,
});

function IndexPage() {
  return (
    <div className="flex flex-col h-full">
      <ChatPage />
    </div>
  );
}
