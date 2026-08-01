import { NextResponse } from "next/server";
import { bearerToken } from "@/features/local-biometric/workstation/workstation-auth";
import { workstationStore } from "@/features/local-biometric/workstation/workstation-store";
export const dynamic="force-dynamic";
export async function GET(request:Request){const headers={"Cache-Control":"no-store, private"};const token=bearerToken(request);if(!token)return NextResponse.json({error:"Unauthorized"},{status:401,headers});const command=workstationStore.poll(token);return NextResponse.json({command},{headers})}
