import { createFileRoute } from "@tanstack/react-router";
import { ChatPage } from "../../../../components/chat/chat-page";

export const Route = createFileRoute("/_layout/_authenticated/chat/")({
  component: IndexPage,
  head: () => {
    return {
      meta: [
        { title: "AI Chat - Legion Social" },
        { name: "description", content: "Chat with NEAR AI" },
        { property: "og:title", content: "AI Chat - Legion Social" },
        { property: "og:description", content: "Chat with NEAR AI" },
        { property: "og:image", content: `${typeof window !== "undefined" ? window.location.origin : ""}/og.jpg` },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: `${typeof window !== "undefined" ? window.location.origin : ""}/og.jpg` },
      ],
    };
  },
});

function IndexPage() {
  return (
    <div className="flex flex-col h-full">
      <ChatPage />
    </div>
  );
}
