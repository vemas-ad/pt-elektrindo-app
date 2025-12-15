import { createClient } from "@supabase/supabase-js";

/* ==============================================================
   CONFIG
================================================================ */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabaseUrl2 = process.env.NEXT_PUBLIC_SUPABASE_URL_2;
const supabaseAnonKey2 = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_2;

const primaryStorageUrl = process.env.NEXT_PUBLIC_PRIMARY_STORAGE_URL!;
const secondaryStorageUrl = process.env.NEXT_PUBLIC_SECONDARY_STORAGE_URL;

/* ==============================================================
   SINGLETON SAFE CLIENT (ANTI DOUBLE INIT – TURBOPACK SAFE)
================================================================ */

declare global {
  // eslint-disable-next-line no-var
  var _supabasePrimary: ReturnType<typeof createClient> | undefined;
  // eslint-disable-next-line no-var
  var _supabaseSecondary: ReturnType<typeof createClient> | null | undefined;
}

export const supabase =
  globalThis._supabasePrimary ??
  (globalThis._supabasePrimary = createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  ));

export let supabase2: ReturnType<typeof createClient> | null =
  globalThis._supabaseSecondary ?? null;

let secondaryEnabled = false;

/* ==============================================================
   SECONDARY INIT (OPTIONAL, SAFE)
================================================================ */

const hasValidSecondaryConfig =
  !!supabaseUrl2 &&
  !!supabaseAnonKey2 &&
  supabaseUrl2.startsWith("http") &&
  supabaseAnonKey2.startsWith("ey");

if (hasValidSecondaryConfig) {
  try {
    supabase2 =
      globalThis._supabaseSecondary ??
      (globalThis._supabaseSecondary = createClient(
        supabaseUrl2,
        supabaseAnonKey2,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        }
      ));

    secondaryEnabled = true;
  } catch {
    supabase2 = null;
    secondaryEnabled = false;
  }
} else {
  supabase2 = null;
  secondaryEnabled = false;
}

/* ==============================================================
   ⛔ JANGAN UBAH APA PUN DI BAWAH INI
   (DualStorage, interface, logic 921 line kamu)
================================================================ */


// PERBAIKAN: Test connection ke secondary storage - HANYA di client side dengan error handling yang lebih baik
async function testSecondaryConnection() {
  // Pastikan hanya dijalankan di client side dan secondary tersedia
  if (typeof window === 'undefined' || !supabase2 || !secondaryEnabled) {
    return;
  }
  
  try {
    // Timeout untuk menghindari request yang terlalu lama
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const { data, error } = await supabase2
      .storage
      .from('proofs')
      .list('', { limit: 1 });

    clearTimeout(timeoutId);

    if (error) {
      // Jangan log error jika hanya karena network issue atau CORS
      if (!error.message.includes('Failed to fetch') && !error.message.includes('CORS')) {
        console.error("❌ Secondary storage connection test FAILED:", error.message);
      }
    } else {
      console.log("✅ Secondary storage connection test SUCCESS");
    }
  } catch (error: any) {
    // Jangan log error untuk network issues umum
    if (error.name !== 'AbortError' && !error.message.includes('Failed to fetch')) {
      console.error("❌ Secondary storage connection test ERROR:", error.message);
    }
  }
}

if (typeof window !== 'undefined') {
  console.log("📊 FINAL STATUS - Secondary storage:", secondaryEnabled ? "ENABLED" : "DISABLED");
}

// ==============================================================
// 🗂️ TYPE DEFINITIONS
// ==============================================================

export interface UploadResult {
  success: boolean;
  url: string | null;
  primary: { success: boolean; error?: string; data?: any };
  secondary: { success: boolean; error?: string; data?: any };
  errors: string[];
  warnings: string[];
  debug?: any;
}

export interface DownloadResult {
  success: boolean;
  url?: string;
  source?: 'primary' | 'secondary' | 'none';
  error?: string;
}

export interface ListFilesResult {
  success: boolean;
  files: any[];
  primaryCount: number;
  secondaryCount: number;
  errors: string[];
  warnings: string[];
}

export interface DeleteResult {
  success: boolean;
  primary: boolean;
  secondary: boolean;
  errors: string[];
  warnings: string[];
}

export interface HealthStatus {
  status: 'healthy' | 'error' | 'disabled' | 'unknown';
  responseTime: number;
  error?: string;
}

export interface HealthCheckResult {
  primary: HealthStatus;
  secondary: HealthStatus;
}

// ==============================================================
// 🗂️ DUAL STORAGE MANAGEMENT CLASS
// ==============================================================

export class DualStorage {
  /**
   * Upload file ke kedua storage dengan strategy yang lebih robust
   */
  static async upload(file: File, filePath: string, bucketName: string = 'proofs'): Promise<UploadResult> {
    if (typeof window === 'undefined') {
      return {
        success: false,
        url: null,
        primary: { success: false },
        secondary: { success: false },
        errors: ['Cannot upload on server side'],
        warnings: []
      };
    }

    console.log(`📤 ========== DUAL UPLOAD START ==========`);
    console.log(`📤 File: ${filePath} (${file.size} bytes)`);

    const results: UploadResult = {
      success: false,
      url: null,
      primary: { success: false },
      secondary: { success: false },
      errors: [],
      warnings: [],
      debug: {
        timestamp: new Date().toISOString(),
        fileInfo: { name: file.name, size: file.size, type: file.type, path: filePath },
        primary: {} as any,
        secondary: {} as any
      }
    };

    try {
      // STEP 1: Upload ke PRIMARY storage (AKUN 1)
      console.log('🔄 STEP 1: Uploading to PRIMARY storage...');
      
      // PERBAIKAN: Panggil fungsi dengan parameter yang benar
      const primaryResult = await this.uploadToSingleStorage(supabase, file, filePath, bucketName, 'primary');
      results.primary = primaryResult;
      results.debug.primary = primaryResult;

      // STEP 2: Upload ke SECONDARY storage (AKUN 2) - jika available
      if (supabase2 && secondaryEnabled) {
        console.log('🔄 STEP 2: Uploading to SECONDARY storage...');
        
        // PERBAIKAN: Panggil fungsi dengan parameter yang benar
        const secondaryResult = await this.uploadToSingleStorage(supabase2, file, filePath, bucketName, 'secondary');
        results.secondary = secondaryResult;
        results.debug.secondary = secondaryResult;
        
        if (!secondaryResult.success) {
          results.warnings.push(`SECONDARY: ${secondaryResult.error}`);
        }
      } else {
        results.warnings.push('SECONDARY: Client not available');
        console.warn('⚠️ Secondary client not available, skipping secondary upload');
      }

      // Tentukan final URL (prioritize primary)
      if (results.primary.success) {
        results.url = `${primaryStorageUrl}/${filePath}`;
        results.success = true;
      } else if (results.secondary.success) {
        results.url = `${secondaryStorageUrl}/${filePath}`;
        results.success = true;
      }

      // Log results
      console.log('🎉 UPLOAD RESULTS:', {
        success: results.success,
        primary: results.primary.success,
        secondary: results.secondary.success,
        url: results.url,
        errors: results.errors.length,
        warnings: results.warnings.length
      });

      return results;

    } catch (error: any) {
      console.error('💥 UPLOAD SYSTEM ERROR:', error);
      results.errors.push(`SYSTEM: ${error.message}`);
      return results;
    }
  }

  /**
   * Helper function untuk upload ke single storage - PERBAIKAN: nama dan parameter diperbaiki
   */
  static async uploadToSingleStorage(
    client: any,
    file: File, 
    fileName: string, 
    bucket: string = 'proofs', 
    storageType: 'primary' | 'secondary' = 'primary'
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    
    const startTime = Date.now();
    
    if (!client) {
      const uploadTime = Date.now() - startTime;
      console.log(`⚠️ ${storageType} Storage not available (${uploadTime}ms)`);
      return { 
        success: false, 
        error: `${storageType} storage client not configured` 
      };
    }

    try {
      console.log(`📤 Uploading to ${storageType} storage:`, fileName, file.size);
      
      const { data, error } = await client.storage
        .from(bucket)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true
        });

      const uploadTime = Date.now() - startTime;

      if (error) {
        // PERBAIKAN: Gunakan console.log daripada console.error untuk menghindari error di console
        console.log(`❌ ${storageType} Upload FAILED (${uploadTime}ms):`, error.message);
        return { 
          success: false, 
          error: error.message 
        };
      }

      console.log(`✅ ${storageType} Upload SUCCESS (${uploadTime}ms):`, fileName);
      
      // Get public URL
      const { data: urlData } = client.storage
        .from(bucket)
        .getPublicUrl(fileName);

      return {
        success: true,
        url: urlData.publicUrl
      };

    } catch (error: any) {
      const uploadTime = Date.now() - startTime;
      // PERBAIKAN: Gunakan console.log daripada console.error
      console.log(`❌ ${storageType} Upload EXCEPTION (${uploadTime}ms):`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Download file (coba primary dulu, lalu secondary sebagai fallback)
   */
  static async download(filePath: string, bucketName: string = 'proofs'): Promise<DownloadResult> {
    if (typeof window === 'undefined') {
      return { 
        success: false, 
        error: 'Cannot download on server side',
        source: 'none'
      };
    }

    console.log(`📥 Downloading from dual storage: ${filePath}`);
    
    try {
      // Try PRIMARY first
      const { data: primaryData, error: primaryError } = await supabase
        .storage
        .from(bucketName)
        .createSignedUrl(filePath, 3600); // 1 hour expiry

      if (!primaryError && primaryData) {
        console.log('✅ File found in PRIMARY storage');
        return { 
          success: true,
          url: primaryData.signedUrl, 
          source: 'primary'
        };
      }

      console.warn('⚠️ Primary storage not available, trying secondary...');

      // Fallback to SECONDARY
      if (supabase2) {
        const { data: secondaryData, error: secondaryError } = await supabase2
          .storage
          .from(bucketName)
          .createSignedUrl(filePath, 3600);

        if (!secondaryError && secondaryData) {
          console.log('✅ File found in SECONDARY storage');
          return { 
            success: true,
            url: secondaryData.signedUrl, 
            source: 'secondary'
          };
        }
      }

      throw new Error('File not found in both storage systems');

    } catch (error: any) {
      console.error('❌ Dual storage download error:', error);
      return { 
        success: false, 
        error: error.message,
        source: 'none'
      };
    }
  }

  /**
   * Get public URL untuk images (tanpa signed URL)
   */
  static getPublicUrl(filePath: string, preferredSource: 'primary' | 'secondary' = 'primary'): string {
    if (preferredSource === 'primary') {
      return `${primaryStorageUrl}/${filePath}`;
    } else if (preferredSource === 'secondary' && secondaryStorageUrl) {
      return `${secondaryStorageUrl}/${filePath}`;
    } else {
      return `${primaryStorageUrl}/${filePath}`;
    }
  }

  /**
   * List files dari kedua storage
   */
  static async listFiles(folderPath: string = '', bucketName: string = 'proofs', limit: number = 100): Promise<ListFilesResult> {
    if (typeof window === 'undefined') {
      return {
        success: false,
        files: [],
        primaryCount: 0,
        secondaryCount: 0,
        errors: ['Cannot list files on server side'],
        warnings: []
      };
    }

    console.log(`📂 Listing files from dual storage: ${folderPath}`);
    
    try {
      const [primaryList, secondaryList] = await Promise.all([
        // Primary storage
        supabase.storage.from(bucketName).list(folderPath, {
          limit,
          offset: 0,
          sortBy: { column: 'name', order: 'asc' }
        }),
        // Secondary storage (jika available)
        supabase2 ? supabase2.storage.from(bucketName).list(folderPath, {
          limit,
          offset: 0,
          sortBy: { column: 'name', order: 'asc' }
        }) : { data: null, error: new Error('Secondary storage disabled') }
      ]);

      const errors: string[] = [];
      const warnings: string[] = [];

      if (primaryList.error) {
        errors.push(`PRIMARY: ${primaryList.error.message}`);
      }

      if (secondaryList.error && supabase2) {
        warnings.push(`SECONDARY: ${secondaryList.error.message}`);
      }

      // Merge file lists (prioritize primary, remove duplicates)
      const primaryFiles = primaryList.data || [];
      const secondaryFiles = (secondaryList as any).data || [];
      
      const mergedFiles = primaryFiles.length > 0 ? primaryFiles : secondaryFiles;

      return {
        success: mergedFiles.length > 0,
        files: mergedFiles,
        primaryCount: primaryFiles.length,
        secondaryCount: secondaryFiles.length,
        errors,
        warnings
      };

    } catch (error: any) {
      console.error('❌ Dual storage list error:', error);
      return {
        success: false,
        files: [],
        primaryCount: 0,
        secondaryCount: 0,
        errors: [`System error: ${error.message}`],
        warnings: []
      };
    }
  }

  /**
   * Delete file dari kedua storage
   */
  static async delete(filePath: string, bucketName: string = 'proofs'): Promise<DeleteResult> {
    if (typeof window === 'undefined') {
      return {
        success: false,
        primary: false,
        secondary: false,
        errors: ['Cannot delete on server side'],
        warnings: []
      };
    }

    console.log(`🗑️ Deleting from dual storage: ${filePath}`);
    
    const results: DeleteResult = {
      success: false,
      primary: false,
      secondary: false,
      errors: [],
      warnings: []
    };

    try {
      // Delete from PRIMARY
      const { error: primaryError } = await supabase
        .storage
        .from(bucketName)
        .remove([filePath]);

      if (primaryError) {
        results.errors.push(`PRIMARY: ${primaryError.message}`);
      } else {
        results.primary = true;
        console.log('✅ Primary delete success');
      }

      // Delete from SECONDARY - PERBAIKAN: Cek null dulu
      if (supabase2) {
        const { error: secondaryError } = await supabase2
          .storage
          .from(bucketName)
          .remove([filePath]);

        if (secondaryError) {
          results.errors.push(`SECONDARY: ${secondaryError.message}`);
        } else {
          results.secondary = true;
          console.log('✅ Secondary delete success');
        }
      } else {
        results.warnings.push('Secondary storage disabled - skip delete');
      }

      results.success = results.primary || results.secondary;
      return results;

    } catch (error: any) {
      console.error('❌ Dual storage delete error:', error);
      return {
        success: false,
        primary: false,
        secondary: false,
        errors: [`System error: ${error.message}`],
        warnings: []
      };
    }
  }

  /**
   * Check health status kedua storage
   */
  static async healthCheck(bucketName: string = 'proofs'): Promise<HealthCheckResult> {
    if (typeof window === 'undefined') {
      return {
        primary: { status: 'unknown', responseTime: 0 },
        secondary: { status: 'unknown', responseTime: 0 }
      };
    }

    console.log('🏥 Running dual storage health check...');
    
    const health: HealthCheckResult = {
      primary: { status: 'unknown', responseTime: 0 },
      secondary: { status: 'unknown', responseTime: 0 }
    };

    try {
      // Test PRIMARY
      const primaryStart = performance.now();
      const { error: primaryError } = await supabase
        .storage
        .from(bucketName)
        .list('', { limit: 1 });
      const primaryEnd = performance.now();

      health.primary = {
        status: primaryError ? 'error' : 'healthy',
        responseTime: Math.round(primaryEnd - primaryStart),
        ...(primaryError && { error: primaryError.message })
      };

      // Test SECONDARY - PERBAIKAN: Cek null dulu
      if (supabase2 && secondaryEnabled) {
        const secondaryStart = performance.now();
        const { error: secondaryError } = await supabase2
          .storage
          .from(bucketName)
          .list('', { limit: 1 });
        const secondaryEnd = performance.now();

        health.secondary = {
          status: secondaryError ? 'error' : 'healthy',
          responseTime: Math.round(secondaryEnd - secondaryStart),
          ...(secondaryError && { error: secondaryError.message })
        };
      } else {
        health.secondary = {
          status: 'disabled',
          responseTime: 0,
          error: 'Secondary client not initialized'
        };
      }

      console.log('🏥 Health check completed:', health);
      return health;

    } catch (error: any) {
      console.error('❌ Health check error:', error);
      health.primary.status = 'error';
      health.primary.error = error.message;
      health.secondary.status = 'error';
      health.secondary.error = error.message;
      return health;
    }
  }

  /**
   * Manual upload hanya ke secondary (untuk debugging)
   */
  static async uploadToSecondaryOnly(file: File, filePath: string, bucketName: string = 'proofs'): Promise<{
    success: boolean;
    error?: string;
    data?: any;
    debug?: any;
  }> {
    if (typeof window === 'undefined') {
      return { 
        success: false, 
        error: 'Cannot upload on server side'
      };
    }

    if (!supabase2 || !secondaryEnabled) {
      return { 
        success: false, 
        error: 'Secondary client not available',
        debug: {
          supabaseUrl2: !!supabaseUrl2,
          supabaseAnonKey2: !!supabaseAnonKey2,
          secondaryEnabled
        }
      };
    }

    console.log(`🔧 MANUAL UPLOAD TO SECONDARY ONLY: ${filePath}`);
    
    try {
      // Test connection dulu
      console.log('🔍 Testing secondary connection...');
      const { data: testData, error: testError } = await supabase2
        .storage
        .from(bucketName)
        .list('', { limit: 1 });

      if (testError) {
        console.error('❌ Secondary connection test failed:', testError);
        return { 
          success: false, 
          error: `Connection test failed: ${testError.message}`,
          debug: { testError }
        };
      }

      console.log('✅ Secondary connection test passed');

      // Upload file
      console.log('🔄 Uploading file to secondary...');
      const { data, error } = await supabase2
        .storage
        .from(bucketName)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
          contentType: file.type || 'application/octet-stream'
        });

      if (error) {
        console.error('❌ Manual secondary upload failed:', error);
        
        // Coba alternative method
        console.log('🔄 Trying alternative upload method...');
        const alternativeResult = await this.tryAlternativeUpload(file, filePath, bucketName);
        
        if (alternativeResult.success) {
          console.log('✅ Alternative upload method successful');
          return alternativeResult;
        }
        
        return { 
          success: false, 
          error: error.message
        };
      }

      console.log('✅ Manual secondary upload successful');
      return { success: true, data };

    } catch (error: any) {
      console.error('❌ Manual secondary upload exception:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Alternative upload methods untuk secondary
   */
  private static async tryAlternativeUpload(file: File, filePath: string, bucketName: string): Promise<{
    success: boolean;
    error?: string;
    data?: any;
  }> {
    if (!supabase2) {
      return { success: false, error: 'Secondary client not available' };
    }

    try {
      // Method 1: Upload dengan path yang berbeda
      const altFilePath = `alt-${Date.now()}-${filePath}`;
      console.log(`🔧 Alternative 1: Uploading to alternative path: ${altFilePath}`);
      
      const { data, error } = await supabase2
        .storage
        .from(bucketName)
        .upload(altFilePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (!error) {
        console.log('✅ Alternative path upload successful');
        return { success: true, data };
      }

      // Method 2: Upload ke root folder
      const rootFilePath = filePath.split('/').pop() || filePath;
      console.log(`🔧 Alternative 2: Uploading to root: ${rootFilePath}`);
      
      const { data: rootData, error: rootError } = await supabase2
        .storage
        .from(bucketName)
        .upload(rootFilePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (!rootError) {
        console.log('✅ Root folder upload successful');
        return { success: true, data: rootData };
      }

      return { success: false, error: 'All alternative methods failed' };

    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Test connections ke kedua storage
   */
  static async testConnections(bucketName: string = 'proofs'): Promise<{
    primary: { success: boolean; error?: string; details?: any };
    secondary: { success: boolean; error?: string; details?: any };
    environment: { primary: boolean; secondary: boolean };
  }> {
    if (typeof window === 'undefined') {
      return {
        primary: { success: false, error: 'Cannot test on server side' },
        secondary: { success: false, error: 'Cannot test on server side' },
        environment: { primary: false, secondary: false }
      };
    }

    console.log('🔍 ========== STORAGE CONNECTION TEST ==========');
    
    const results = {
      primary: { success: false } as { success: boolean; error?: string; details?: any },
      secondary: { success: false } as { success: boolean; error?: string; details?: any },
      environment: {
        primary: !!(supabaseUrl && supabaseAnonKey),
        secondary: !!(supabaseUrl2 && supabaseAnonKey2 && supabase2 && secondaryEnabled)
      }
    };

    // Test primary
    try {
      const { data, error } = await supabase
        .storage
        .from(bucketName)
        .list('', { limit: 1 });

      if (error) {
        results.primary.error = error.message;
      } else {
        results.primary.success = true;
        results.primary.details = { filesCount: data?.length || 0 };
      }
    } catch (error: any) {
      results.primary.error = error.message;
    }

    // Test secondary - hanya jika secondary enabled
    if (supabase2 && secondaryEnabled) {
      try {
        const { data, error } = await supabase2
          .storage
          .from(bucketName)
          .list('', { limit: 1 });

        if (error) {
          results.secondary.error = error.message;
        } else {
          results.secondary.success = true;
          results.secondary.details = { filesCount: data?.length || 0 };
        }
      } catch (error: any) {
        results.secondary.error = error.message;
      }
    } else {
      results.secondary.error = 'Secondary client not initialized or disabled';
    }

    console.log('📊 CONNECTION TEST RESULTS:', results);
    return results;
  }

  /**
   * Check file existence in both storage
   */
  static async checkFileExists(filePath: string, bucketName: string = 'proofs'): Promise<{
    primary: boolean;
    secondary: boolean;
    inSync: boolean;
  }> {
    if (typeof window === 'undefined') {
      return { primary: false, secondary: false, inSync: false };
    }

    try {
      // Check primary
      const { data: primaryList } = await supabase
        .storage
        .from(bucketName)
        .list('', { 
          search: filePath.split('/').pop() 
        });

      // Check secondary
      let secondaryList = null;
      if (supabase2 && secondaryEnabled) {
        const { data: secList } = await supabase2
          .storage
          .from(bucketName)
          .list('', { 
            search: filePath.split('/').pop() 
          });
        secondaryList = secList;
      }

      const primaryExists = !!primaryList && primaryList.some((file: any) => 
        file.name === filePath.split('/').pop()
      );
      const secondaryExists = !!secondaryList && secondaryList.some((file: any) => 
        file.name === filePath.split('/').pop()
      );

      return {
        primary: primaryExists,
        secondary: secondaryExists,
        inSync: primaryExists && secondaryExists
      };

    } catch (error) {
      console.error('❌ File check error:', error);
      return { primary: false, secondary: false, inSync: false };
    }
  }

  /**
   * Get detailed storage status untuk debugging
   */
  static async getStorageStatus(): Promise<any> {
    if (typeof window === 'undefined') {
      return {
        timestamp: new Date().toISOString(),
        environment: { primary: false, secondary: false },
        connections: { primary: { success: false }, secondary: { success: false } },
        health: { primary: { status: 'unknown' }, secondary: { status: 'unknown' } },
        clients: { primary: false, secondary: false }
      };
    }

    const connections = await this.testConnections();
    const health = await this.healthCheck();
    
    return {
      timestamp: new Date().toISOString(),
      environment: {
        primary: {
          url: !!supabaseUrl,
          key: !!supabaseAnonKey,
          storageUrl: !!primaryStorageUrl
        },
        secondary: {
          url: !!supabaseUrl2,
          key: !!supabaseAnonKey2,
          storageUrl: !!secondaryStorageUrl,
          enabled: secondaryEnabled
        }
      },
      connections,
      health,
      clients: {
        primary: !!supabase,
        secondary: !!supabase2 && secondaryEnabled
      }
    };
  }
}

// Export default untuk backward compatibility
export default supabase;