import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import { LocalMateGuidesView } from "@/features/localmate-admin/components/localmate-guides-view";

export default async function LocalMateGuidesPage() {
  const context = await loadServerWorkspaceContext("/localmate/guides");

  return (
    <div className="w-full">
      <LocalMateGuidesView
        currentUserEmail={context.email}
        currentUserRole={context.activeRole.code}
        currentUserName={context.fullName}
      />
    </div>
  );
}
