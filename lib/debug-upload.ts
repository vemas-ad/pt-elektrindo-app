import { supabase, StorageManager } from './supabaseClient';

export async function debugUploadToStorage() {
  if (!supabase) {
    console.error('❌ supabase client is null');
    return;
  }

  console.log('🔍 ========== DEBUG STORAGE UPLOAD ==========');
  
  // Test 1: List files di bucket proofs
  try {
    console.log('📋 Test 1: Listing files in proofs bucket...');
    const { data: files, error } = await supabase.storage.from('proofs').list();
    
    if (error) {
      console.error('❌ List files error:', error);
    } else {
      console.log('✅ List files success. Files count:', files?.length);
      console.log('📁 Files:', files);
    }
  } catch (err) {
    console.error('❌ List files exception:', err);
  }

  // Test 2: Try upload small test file
  try {
    console.log('📤 Test 2: Uploading test file...');
    const testContent = 'This is a test file for debugging single storage';
    const testFile = new File([testContent], 'debug-test-single.txt', { type: 'text/plain' });
    
    const { data, error } = await supabase.storage
      .from('proofs')
      .upload('debug/test-file-single.txt', testFile, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) {
      console.error('❌ Upload test error:', error);
      console.error('Error details:', {
        message: error.message,
        name: error.name
      });
    } else {
      console.log('✅ Upload test success:', data);
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('proofs')
        .getPublicUrl('debug/test-file-single.txt');
      console.log('🔗 Public URL:', urlData.publicUrl);
    }
  } catch (err) {
    console.error('❌ Upload test exception:', err);
  }

  // Test 3: Check bucket configuration
  try {
    console.log('⚙️ Test 3: Checking bucket configuration...');
    const { data: buckets, error } = await supabase.storage.listBuckets();
    
    if (error) {
      console.error('❌ List buckets error:', error);
    } else {
      console.log('✅ Buckets found:', buckets?.length);
      const proofsBucket = buckets?.find(b => b.name === 'proofs');
      console.log('📦 Proofs bucket details:', proofsBucket);
    }
  } catch (err) {
    console.error('❌ List buckets exception:', err);
  }

  // Test 4: Test StorageManager
  try {
    console.log('🧪 Test 4: Testing StorageManager class...');
    
    const testContent = 'Testing StorageManager upload';
    const testFile = new File([testContent], 'storage-manager-test.txt', { type: 'text/plain' });
    
    const result = await StorageManager.upload(
      testFile, 
      'debug/storage-manager-test.txt', 
      'proofs'
    );
    
    console.log('📊 StorageManager upload result:', {
      success: result.success,
      url: result.url,
      errors: result.errors,
      warnings: result.warnings
    });
    
  } catch (err) {
    console.error('❌ StorageManager test exception:', err);
  }

  // Test 5: Test health check
  try {
    console.log('🏥 Test 5: Testing storage health check...');
    const health = await StorageManager.healthCheck('proofs');
    console.log('📈 Health check result:', health);
  } catch (err) {
    console.error('❌ Health check exception:', err);
  }

  // Test 6: Test file deletion
  try {
    console.log('🗑️ Test 6: Testing file deletion...');
    
    // Upload file first to delete
    const testContent = 'File to be deleted';
    const testFile = new File([testContent], 'delete-test.txt', { type: 'text/plain' });
    
    await supabase.storage
      .from('proofs')
      .upload('debug/delete-test.txt', testFile, {
        cacheControl: '3600',
        upsert: true
      });
    
    console.log('✅ Test file uploaded for deletion');
    
    // Now delete it
    const deleteResult = await StorageManager.delete('debug/delete-test.txt', 'proofs');
    console.log('🗑️ Delete result:', deleteResult);
    
  } catch (err) {
    console.error('❌ Delete test exception:', err);
  }

  // Test 7: Test list files with StorageManager
  try {
    console.log('📂 Test 7: Testing StorageManager list files...');
    const listResult = await StorageManager.listFiles('debug', 'proofs', 10);
    console.log('📁 List files result:', {
      success: listResult.success,
      fileCount: listResult.files.length,
      files: listResult.files.map(f => f.name)
    });
  } catch (err) {
    console.error('❌ List files test exception:', err);
  }

  console.log('🎉 ========== DEBUG COMPLETE ==========');
  
  // Get final status
  const status = await StorageManager.getStorageStatus();
  console.log('📊 FINAL STORAGE STATUS:', status);
}

// Fungsi tambahan untuk testing spesifik
export async function testSpecificUpload(file: File, filePath: string): Promise<{
  success: boolean;
  error?: string;
  url?: string;
}> {
  try {
    const { data, error } = await supabase.storage
      .from('proofs')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type || 'application/octet-stream'
      });

    if (error) {
      return {
        success: false,
        error: error.message
      };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('proofs')
      .getPublicUrl(filePath);

    return {
      success: true,
      url: urlData.publicUrl
    };

  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Fungsi untuk clear debug files
export async function cleanupDebugFiles(): Promise<{
  success: boolean;
  deleted: number;
  errors: string[];
}> {
  try {
    console.log('🧹 Cleaning up debug files...');
    
    // List all debug files
    const { data: files, error } = await supabase.storage
      .from('proofs')
      .list('debug');

    if (error) {
      return {
        success: false,
        deleted: 0,
        errors: [error.message]
      };
    }

    const filePaths = files?.map(f => `debug/${f.name}`) || [];
    
    if (filePaths.length === 0) {
      console.log('✅ No debug files to clean up');
      return {
        success: true,
        deleted: 0,
        errors: []
      };
    }

    console.log(`🗑️ Deleting ${filePaths.length} debug files...`);
    
    const { error: deleteError } = await supabase.storage
      .from('proofs')
      .remove(filePaths);

    if (deleteError) {
      return {
        success: false,
        deleted: 0,
        errors: [deleteError.message]
      };
    }

    console.log(`✅ Successfully deleted ${filePaths.length} debug files`);
    return {
      success: true,
      deleted: filePaths.length,
      errors: []
    };

  } catch (error: any) {
    return {
      success: false,
      deleted: 0,
      errors: [error.message]
    };
  }
}

// Export fungsi dengan nama lama untuk backward compatibility
export const debugUploadToSecondary = debugUploadToStorage;