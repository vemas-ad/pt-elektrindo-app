// app/api/upload-supabase/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Buat Supabase client dengan Service Role key untuk server-side
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
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

    // Validasi file size
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

    // Generate nama file unik
    const fileExtension = file.name.split('.').pop() ?? 'dat';
    const timestamp = Date.now();
    const safeDescription = description.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `${projectId}/${safeDescription}_${timestamp}.${fileExtension}`;

    console.log('📤 Uploading to Supabase Storage:', fileName);

    // Convert file ke Uint8Array
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Upload ke Supabase Storage
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

    // Ambil public URL
    const { data: urlData } = supabase.storage
      .from('proofs')
      .getPublicUrl(fileName);

    const publicUrl = urlData?.publicUrl || '';

    // Simpan URL ke DB jika ada taskId
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
    const { searchParams } = new URL(request.url);
    const fileUrl = searchParams.get('fileUrl');
    const projectId = searchParams.get('projectId');

    if (!fileUrl || !projectId) {
      return NextResponse.json(
        { success: false, error: 'Missing fileUrl or projectId' },
        { status: 400 }
      );
    }

    // Ambil file path dari URL
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
