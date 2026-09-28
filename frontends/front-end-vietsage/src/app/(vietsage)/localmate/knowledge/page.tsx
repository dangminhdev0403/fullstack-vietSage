import { redirect } from "next/navigation";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import { LocalMateKnowledgeView } from "@/features/localmate-admin/components/localmate-knowledge-view";

export default async function LocalMateKnowledgePage() {
  const context = await loadServerWorkspaceContext("/localmate/knowledge");
  if (context.activeRole.code === "LOCALMATE_GUIDE") {
    redirect("/localmate/guides");
  }

  return (
    <div className="w-full">
      <LocalMateKnowledgeView />
    </div>
  );
}
