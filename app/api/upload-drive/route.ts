import { NextResponse } from "next/server";
import formidable, { Files, Fields } from "formidable";
import { google } from "googleapis";
import fs from "fs";

// Nonaktifkan body parsing bawaan Next.js agar FormData bisa terbaca
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Agar TypeScript tidak error “no declaration file”
declare module "formidable";

// Konversi Request (Web API) → Readable Stream (agar bisa diparse oleh formidable)
function requestToReadable(req: Request): NodeJS.ReadableStream {
  const readable = new ReadableStream({
    start(controller) {
      req
        .arrayBuffer()
        .then((buf) => {
          controller.enqueue(new Uint8Array(buf));
          controller.close();
        })
        .catch((err) => controller.error(err));
    },
  });

  // Konversi ReadableStream → NodeJS.ReadableStream
  // @ts-ignore: fromWeb may not be on type definitions in some Node versions
  const nodeReadable = require("stream").Readable.fromWeb(readable as any);
  return nodeReadable;
}

export async function POST(req: Request) {
  try {
    // NOTE:
    // `formidable` typings kadang berbeda antar versi. Untuk menghindari error
    // TS "IncomingForm not exported", kita akses constructor IncomingForm
    // melalui objek `formidable` runtime dan beri typing `any` di bagian ini.
    const IncomingFormConstructor: any = (formidable as any).IncomingForm || (formidable as any);
    const form = new IncomingFormConstructor({ multiples: false });

    const nodeReq = requestToReadable(req);

    // parse formdata
    const { fields, files }: { fields: Fields; files: Files } = await new Promise(
      (resolve, reject) => {
        // beri tipe pada callback agar TS tidak complain tentang implicit any
        form.parse(nodeReq as any, (err: Error | null, fields: Fields, files: Files) => {
          if (err) reject(err);
          else resolve({ fields, files });
        });
      }
    );

    const file = (files as any)?.file;
    if (!file) {
      return NextResponse.json({ error: "Tidak ada file diunggah" }, { status: 400 });
    }

    const saKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    if (!saKey || !folderId) {
      return NextResponse.json(
        { error: "Konfigurasi Google Drive belum lengkap (cek .env.local)" },
        { status: 500 }
      );
    }

    // Autentikasi service account
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(saKey),
      scopes: [
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/drive",
      ],
    });

    const drive = google.drive({ version: "v3", auth });

    // formidable vX kadang meletakkan filepath atau path
    const filepath = (file as any).filepath || (file as any).path;
    const mime = (file as any).mimetype || "application/octet-stream";
    const name = (file as any).originalFilename || (file as any).name || "upload.bin";

    // Upload ke Google Drive
    const uploadRes = await drive.files.create({
      requestBody: {
        name,
        parents: [folderId],
      },
      media: {
        mimeType: mime,
        body: fs.createReadStream(filepath),
      },
      fields: "id,name",
    });

    const fileId = uploadRes.data.id;
    if (!fileId) {
      return NextResponse.json({ error: "File ID tidak diterima dari Google" }, { status: 500 });
    }

    // Set permission public (agar bisa diakses umum)
    await drive.permissions.create({
      fileId,
      requestBody: { role: "reader", type: "anyone" },
    });

    const publicUrl = `https://drive.google.com/uc?id=${fileId}&export=download`;

    return NextResponse.json({
      success: true,
      fileId,
      name,
      publicUrl,
    });
  } catch (err: any) {
    console.error("upload-drive error:", err);
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 });
  }
}
