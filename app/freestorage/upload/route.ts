// app/api/upload-supabase/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from "@supabase/supabase-js";

// 🔹 Gunakan fungsi untuk membuat client Supabase di server
function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase server environment variables are missing");
  }

  return createClient(url, key);
}

// ❌ Hapus inisialisasi supabase di luar fungsi
// const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: NextRequest) {
  try {
    const supabase = getServerSupabase();

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const projectId = (formData.get('projectId') as string) || '';
    const taskId = (formData.get('taskId') as string) || '';
    const description = (formData.get('description') as string) || 'task';

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    console.log('📁 Processing file for Supabase Storage:', file.name);

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: 'File terlalu besar. Maksimal 10MB.' },
        { status: 400 }
      );
    }

    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'Tipe file tidak didukung. Gunakan gambar, PDF, atau dokumen Office.' },
        { status: 400 }
      );
    }

    const fileExtension = file.name.split('.').pop() ?? 'dat';
    const timestamp = Date.now();
    const safeDescription = description.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `${projectId}/${safeDescription}_${timestamp}.${fileExtension}`;

    console.log('📤 Uploading to Supabase Storage:', fileName);

    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const { data, error } = await supabase.storage
      .from('proofs')
      .upload(fileName, uint8Array, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type
      });

    if (error) {
      console.error('❌ Supabase upload error:', error);
      return NextResponse.json(
        { success: false, error: `Upload gagal: ${error.message}` },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage
      .from('proofs')
      .getPublicUrl(fileName);

    const publicUrl = urlData?.publicUrl || '';

    if (taskId) {
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ 
          proof_url: publicUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', taskId);

      if (updateError) {
        console.warn('⚠ Database update failed (upload tetap berhasil):', updateError.message);
      }
    }

    return NextResponse.json({
      success: true,
      fileName: file.name,
      publicUrl,
      filePath: fileName,
      message: 'File berhasil diupload ke Supabase Storage!'
    });

  } catch (err: any) {
    console.error('💥 Upload error:', err);
    return NextResponse.json(
      { success: false, error: `Upload gagal: ${err.message}` },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = getServerSupabase(); // ✅ pastikan Supabase client dipanggil di setiap request

    const { searchParams } = new URL(request.url);
    const fileUrl = searchParams.get('fileUrl');
    const projectId = searchParams.get('projectId');

    if (!fileUrl || !projectId) {
      return NextResponse.json(
        { success: false, error: 'Missing fileUrl or projectId' },
        { status: 400 }
      );
    }

    const fileName = fileUrl.split('/').slice(-1)[0];
    const filePath = `${projectId}/${fileName}`;

    console.log('🗑️ Deleting file:', filePath);

    const { error } = await supabase.storage.from('proofs').remove([filePath]);

    if (error) {
      console.error('❌ Delete error:', error.message);
      return NextResponse.json(
        { success: false, error: `Delete gagal: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'File berhasil dihapus dari storage'
    });

  } catch (err: any) {
    console.error('💥 Delete error:', err);
    return NextResponse.json(
      { success: false, error: `Delete gagal: ${err.message}` },
      { status: 500 }
    );
  }
}
