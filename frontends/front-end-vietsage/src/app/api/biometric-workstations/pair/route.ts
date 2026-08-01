import { NextResponse } from "next/server";
import { workstationStore } from "@/features/local-biometric/workstation/workstation-store";
export const dynamic="force-dynamic";
export async function POST(request:Request){const headers={"Cache-Control":"no-store, private"};let body:unknown;try{body=await request.json()}catch{return NextResponse.json({error:"JSON không hợp lệ"},{status:400,headers})}const code=typeof body==="object"&&body!==null&&"code" in body?String((body as {code:unknown}).code):"";const paired=workstationStore.pair(code);return paired?NextResponse.json(paired,{status:201,headers}):NextResponse.json({error:"Mã kết nối không hợp lệ hoặc đã hết hạn"},{status:404,headers})}
