import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { httpServer } from "@/core/http/http-server";
import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import { LOCALMATE_SESSION_COOKIE } from "../../_lib/session-cookie";
import { toBffErrorResponse } from "../../_lib/bff-error";
import { candidateKeySchema, proposalKeySchema } from "../../public-chat/payload-schema";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ candidateKey: string }> },
) {
  try {
    const { candidateKey } = await params;
    const proposalKey = new URL(request.url).searchParams.get("proposalKey");
    const parsedCandidateKey = candidateKeySchema.safeParse(candidateKey);
    const parsedProposalKey = proposalKeySchema.safeParse(proposalKey);
    if (!parsedCandidateKey.success || !parsedProposalKey.success) {
      return NextResponse.json(
        { error: "INVALID_CANDIDATE_SELECTION" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const cookieStore = await cookies();
    const token = cookieStore.get(LOCALMATE_SESSION_COOKIE)?.value;
    if (!token) {
      return NextResponse.json(
        { error: "UNAUTHORIZED_NO_SESSION" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    const result = unwrapApiEnvelope<unknown>(
      await httpServer.get(
        `/public/localmate/candidates/${encodeURIComponent(parsedCandidateKey.data)}`,
        {
          query: { proposalKey: parsedProposalKey.data },
          headers: { "x-public-localmate-token": token },
        },
      ),
    ).data;

    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    return toBffErrorResponse(error, "Failed to resolve candidate");
  }
}
