import { supabase2 } from './supabaseClient';

export async function debugUploadToSecondary() {
  if (!supabase2) {
    console.error('❌ supabase2 is null');
    return;
  }

  console.log('🔍 Testing upload to Secondary Storage...');
  
  // Test 1: List files di bucket proofs
  try {
    console.log('📋 Test 1: Listing files in proofs bucket...');
    const { data: files, error } = await supabase2.storage.from('proofs').list();
    
    if (error) {
      console.error('❌ List files error:', error);
    } else {
      console.log('✅ List files success. Files count:', files?.length);
    }
  } catch (err) {
    console.error('❌ List files exception:', err);
  }

  // Test 2: Try upload small test file
  try {
    console.log('📤 Test 2: Uploading test file...');
    const testContent = 'This is a test file for debugging';
    const testFile = new File([testContent], 'debug-test.txt', { type: 'text/plain' });
    
    const { data, error } = await supabase2.storage
      .from('proofs')
      .upload('debug/test-file.txt', testFile, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) {
      console.error('❌ Upload test error:', error);
      console.error('Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
    } else {
      console.log('✅ Upload test success:', data);
    }
  } catch (err) {
    console.error('❌ Upload test exception:', err);
  }

  // Test 3: Check bucket configuration
  try {
    console.log('⚙️ Test 3: Checking bucket configuration...');
    const { data: buckets, error } = await supabase2.storage.listBuckets();
    
    if (error) {
      console.error('❌ List buckets error:', error);
    } else {
      console.log('✅ Buckets:', buckets);
      const proofsBucket = buckets?.find(b => b.name === 'proofs');
      console.log('📦 Proofs bucket details:', proofsBucket);
    }
  } catch (err) {
    console.error('❌ List buckets exception:', err);
  }
}