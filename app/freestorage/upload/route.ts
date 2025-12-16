// app/api/upload-supabase/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * ✅ SERVER-ONLY SUPABASE CLIENT
 * - TANPA auth session
 * - TANPA persistSession
 * - TIDAK MENYENTUH localStorage / cookie
 */
function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Supabase environment variables are missing");
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getServerSupabase();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const projectId = (formData.get("projectId") as string) || "";
    const taskId = (formData.get("taskId") as string) || "";
    const description = (formData.get("description") as string) || "task";

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: "File terlalu besar. Maksimal 10MB." },
        { status: 400 }
      );
    }

    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: "Tipe file tidak didukung." },
        { status: 400 }
      );
    }

    const fileExtension = file.name.split(".").pop() ?? "dat";
    const timestamp = Date.now();
    const safeDescription = description.replace(/[^a-zA-Z0-9]/g, "_");
    const filePath = `${projectId}/${safeDescription}_${timestamp}.${fileExtension}`;

    const buffer = new Uint8Array(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("proofs")
      .upload(filePath, buffer, {
        upsert: true,
        contentType: file.type,
        cacheControl: "3600",
      });

    if (uploadError) {
      return NextResponse.json(
        { success: false, error: uploadError.message },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage
      .from("proofs")
      .getPublicUrl(filePath);

    const publicUrl = urlData?.publicUrl ?? "";

    if (taskId) {
      await supabase
        .from("tasks")
        .update({
          proof_url: publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", taskId);
    }

    return NextResponse.json({
      success: true,
      publicUrl,
      filePath,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = getServerSupabase();

    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get("filePath");

    if (!filePath) {
      return NextResponse.json(
        { success: false, error: "Missing filePath" },
        { status: 400 }
      );
    }

    const { error } = await supabase.storage
      .from("proofs")
      .remove([filePath]);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
