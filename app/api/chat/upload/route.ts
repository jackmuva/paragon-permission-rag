import { NextRequest, NextResponse } from "next/server";
import { getDataSource } from "../engine";
import { initSettings } from "../engine/settings";
import { uploadDocument } from "../llamaindex/documents/upload";

initSettings();

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const base64 = data.base64;
    const fileId = data.fileId;
    const source = data.source;

    if (!base64) {
      return NextResponse.json(
        { error: "base64 is required in the request body" },
        { status: 400 },
      );
    }
    const index = await getDataSource();
    if (!index) {
      throw new Error(
        `StorageContext is empty - call 'npm run generate' to generate the storage first`,
      );
    }

    return NextResponse.json(await uploadDocument(index, base64, fileId ?? "", source ?? ""));
  } catch (error) {
    console.error("[Upload API]", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
