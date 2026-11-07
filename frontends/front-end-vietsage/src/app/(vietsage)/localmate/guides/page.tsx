import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import { LocalMateGuidesView } from "@/features/localmate-admin/components/localmate-guides-view";

export default async function LocalMateGuidesPage() {
  await loadServerWorkspaceContext("/localmate/guides");

  return (
    <div className="w-full">
      <LocalMateGuidesView />
    </div>
  );
}
