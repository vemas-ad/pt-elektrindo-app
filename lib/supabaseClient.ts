import { createClient } from "@supabase/supabase-js";

/* ==============================================================
   CONFIG
================================================================ */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const primaryStorageUrl = process.env.NEXT_PUBLIC_PRIMARY_STORAGE_URL!;

/* ==============================================================
   DATABASE TYPES
================================================================ */

// Tipe sederhana untuk master_schedule
export interface MasterSchedule {
  id: number;
  description: string | null;
  week_date: string | null;
  weight: number | null;
  plan_progress: number | null;
  actual_progress: number | null;
  color: string | null;
  created_at: string;
  updated_at: string | null;
  project_name?: string | null;
}

export type MasterScheduleUpdate = Partial<MasterSchedule>;

// HAPUS deklarasi kedua MasterScheduleUpdate di bawah ini
// export interface MasterScheduleUpdate {  // <-- HAPUS INI
//   description?: string | null;
//   week_date?: string | null;
//   weight?: number | null;
//   plan_progress?: number | null;
//   actual_progress?: number | null;
//   color?: string | null;
//   updated_at?: string;
// }

/* ==============================================================
   SINGLETON SAFE CLIENT
================================================================ */

declare global {
  var _supabasePrimary: ReturnType<typeof createClient> | undefined;
}

// Buat client tanpa generic type
const supabaseClient = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);

// Export supabase dengan type assertion
export const supabase = supabaseClient as any;

/* ==============================================================
   ⛔ JANGAN UBAH APA PUN DI BAWAH INI
   (Storage management functions dan interface)
================================================================ */

// ==============================================================
// 🗂️ STORAGE TYPE DEFINITIONS
// ==============================================================

export interface UploadResult {
  success: boolean;
  url: string | null;
  primary: { success: boolean; error?: string; data?: any };
  errors: string[];
  warnings: string[];
  debug?: any;
}

export interface DownloadResult {
  success: boolean;
  url?: string;
  source?: 'primary' | 'none';
  error?: string;
}

export interface ListFilesResult {
  success: boolean;
  files: any[];
  primaryCount: number;
  errors: string[];
  warnings: string[];
}

export interface DeleteResult {
  success: boolean;
  primary: boolean;
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
}

// ==============================================================
// 🗂️ STORAGE MANAGEMENT CLASS
// ==============================================================

export class StorageManager {
  /**
   * Upload file ke storage dengan strategy yang robust
   */
  static async upload(file: File, filePath: string, bucketName: string = 'proofs'): Promise<UploadResult> {
    if (typeof window === 'undefined') {
      return {
        success: false,
        url: null,
        primary: { success: false },
        errors: ['Cannot upload on server side'],
        warnings: []
      };
    }

    console.log(`📤 ========== UPLOAD START ==========`);
    console.log(`📤 File: ${filePath} (${file.size} bytes)`);

    const results: UploadResult = {
      success: false,
      url: null,
      primary: { success: false },
      errors: [],
      warnings: [],
      debug: {
        timestamp: new Date().toISOString(),
        fileInfo: { name: file.name, size: file.size, type: file.type, path: filePath },
        primary: {} as any
      }
    };

    try {
      // STEP 1: Upload ke PRIMARY storage
      console.log('🔄 STEP 1: Uploading to PRIMARY storage...');
      
      const primaryResult = await this.uploadToStorage(supabase, file, filePath, bucketName, 'primary');
      results.primary = primaryResult;
      results.debug.primary = primaryResult;

      // Tentukan final URL
      if (results.primary.success) {
        results.url = `${primaryStorageUrl}/${filePath}`;
        results.success = true;
      }

      // Log results
      console.log('🎉 UPLOAD RESULTS:', {
        success: results.success,
        primary: results.primary.success,
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
   * Helper function untuk upload ke storage
   */
  static async uploadToStorage(
    client: any,
    file: File, 
    fileName: string, 
    bucket: string = 'proofs', 
    storageType: 'primary' = 'primary'
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
      console.log(`❌ ${storageType} Upload EXCEPTION (${uploadTime}ms):`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Download file dari storage
   */
  static async download(filePath: string, bucketName: string = 'proofs'): Promise<DownloadResult> {
    if (typeof window === 'undefined') {
      return { 
        success: false, 
        error: 'Cannot download on server side',
        source: 'none'
      };
    }

    console.log(`📥 Downloading from storage: ${filePath}`);
    
    try {
      // Try PRIMARY
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

      throw new Error('File not found in storage system');

    } catch (error: any) {
      console.error('❌ Storage download error:', error);
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
  static getPublicUrl(filePath: string, preferredSource: 'primary' = 'primary'): string {
    return `${primaryStorageUrl}/${filePath}`;
  }

  /**
   * List files dari storage
   */
  static async listFiles(folderPath: string = '', bucketName: string = 'proofs', limit: number = 100): Promise<ListFilesResult> {
    if (typeof window === 'undefined') {
      return {
        success: false,
        files: [],
        primaryCount: 0,
        errors: ['Cannot list files on server side'],
        warnings: []
      };
    }

    console.log(`📂 Listing files from storage: ${folderPath}`);
    
    try {
      const primaryList = await supabase.storage.from(bucketName).list(folderPath, {
        limit,
        offset: 0,
        sortBy: { column: 'name', order: 'asc' }
      });

      const errors: string[] = [];
      const warnings: string[] = [];

      if (primaryList.error) {
        errors.push(`PRIMARY: ${primaryList.error.message}`);
      }

      // File lists
      const primaryFiles = primaryList.data || [];
      
      const mergedFiles = primaryFiles;

      return {
        success: mergedFiles.length > 0,
        files: mergedFiles,
        primaryCount: primaryFiles.length,
        errors,
        warnings
      };

    } catch (error: any) {
      console.error('❌ Storage list error:', error);
      return {
        success: false,
        files: [],
        primaryCount: 0,
        errors: [`System error: ${error.message}`],
        warnings: []
      };
    }
  }

  /**
   * Delete file dari storage
   */
  static async delete(filePath: string, bucketName: string = 'proofs'): Promise<DeleteResult> {
    if (typeof window === 'undefined') {
      return {
        success: false,
        primary: false,
        errors: ['Cannot delete on server side'],
        warnings: []
      };
    }

    console.log(`🗑️ Deleting from storage: ${filePath}`);
    
    const results: DeleteResult = {
      success: false,
      primary: false,
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

      results.success = results.primary;
      return results;

    } catch (error: any) {
      console.error('❌ Storage delete error:', error);
      return {
        success: false,
        primary: false,
        errors: [`System error: ${error.message}`],
        warnings: []
      };
    }
  }

  /**
   * Check health status storage
   */
  static async healthCheck(bucketName: string = 'proofs'): Promise<HealthCheckResult> {
    if (typeof window === 'undefined') {
      return {
        primary: { status: 'unknown', responseTime: 0 }
      };
    }

    console.log('🏥 Running storage health check...');
    
    const health: HealthCheckResult = {
      primary: { status: 'unknown', responseTime: 0 }
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

      console.log('🏥 Health check completed:', health);
      return health;

    } catch (error: any) {
      console.error('❌ Health check error:', error);
      health.primary.status = 'error';
      health.primary.error = error.message;
      return health;
    }
  }

  /**
   * Manual upload untuk debugging
   */
  static async manualUpload(file: File, filePath: string, bucketName: string = 'proofs'): Promise<{
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

    console.log(`🔧 MANUAL UPLOAD: ${filePath}`);
    
    try {
      // Test connection dulu
      console.log('🔍 Testing storage connection...');
      const { data: testData, error: testError } = await supabase
        .storage
        .from(bucketName)
        .list('', { limit: 1 });

      if (testError) {
        console.error('❌ Storage connection test failed:', testError);
        return { 
          success: false, 
          error: `Connection test failed: ${testError.message}`,
          debug: { testError }
        };
      }

      console.log('✅ Storage connection test passed');

      // Upload file
      console.log('🔄 Uploading file...');
      const { data, error } = await supabase
        .storage
        .from(bucketName)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
          contentType: file.type || 'application/octet-stream'
        });

      if (error) {
        console.error('❌ Manual upload failed:', error);
        
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

      console.log('✅ Manual upload successful');
      return { success: true, data };

    } catch (error: any) {
      console.error('❌ Manual upload exception:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Alternative upload methods
   */
  private static async tryAlternativeUpload(file: File, filePath: string, bucketName: string): Promise<{
    success: boolean;
    error?: string;
    data?: any;
  }> {
    try {
      // Method 1: Upload dengan path yang berbeda
      const altFilePath = `alt-${Date.now()}-${filePath}`;
      console.log(`🔧 Alternative 1: Uploading to alternative path: ${altFilePath}`);
      
      const { data, error } = await supabase
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
      
      const { data: rootData, error: rootError } = await supabase
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
   * Test connections ke storage
   */
  static async testConnections(bucketName: string = 'proofs'): Promise<{
    primary: { success: boolean; error?: string; details?: any };
    environment: { primary: boolean };
  }> {
    if (typeof window === 'undefined') {
      return {
        primary: { success: false, error: 'Cannot test on server side' },
        environment: { primary: false }
      };
    }

    console.log('🔍 ========== STORAGE CONNECTION TEST ==========');
    
    const results = {
      primary: { success: false } as { success: boolean; error?: string; details?: any },
      environment: {
        primary: !!(supabaseUrl && supabaseAnonKey)
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

    console.log('📊 CONNECTION TEST RESULTS:', results);
    return results;
  }

  /**
   * Check file existence in storage
   */
  static async checkFileExists(filePath: string, bucketName: string = 'proofs'): Promise<{
    primary: boolean;
    inSync: boolean;
  }> {
    if (typeof window === 'undefined') {
      return { primary: false, inSync: false };
    }

    try {
      // Check primary
      const { data: primaryList } = await supabase
        .storage
        .from(bucketName)
        .list('', { 
          search: filePath.split('/').pop() 
        });

      const primaryExists = !!primaryList && primaryList.some((file: any) => 
        file.name === filePath.split('/').pop()
      );

      return {
        primary: primaryExists,
        inSync: primaryExists
      };

    } catch (error) {
      console.error('❌ File check error:', error);
      return { primary: false, inSync: false };
    }
  }

  /**
   * Get detailed storage status untuk debugging
   */
  static async getStorageStatus(): Promise<any> {
    if (typeof window === 'undefined') {
      return {
        timestamp: new Date().toISOString(),
        environment: { primary: false },
        connections: { primary: { success: false } },
        health: { primary: { status: 'unknown' } },
        clients: { primary: false }
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
        }
      },
      connections,
      health,
      clients: {
        primary: !!supabase
      }
    };
  }

  /**
   * Batch upload multiple files
   */
  static async batchUpload(files: Array<{file: File, path: string}>, bucketName: string = 'proofs'): Promise<{
    success: boolean;
    results: Array<{path: string; success: boolean; url?: string; error?: string}>;
    total: number;
    succeeded: number;
    failed: number;
  }> {
    if (typeof window === 'undefined') {
      return {
        success: false,
        results: [],
        total: 0,
        succeeded: 0,
        failed: 0
      };
    }

    console.log(`📦 BATCH UPLOAD START: ${files.length} files`);
    
    const results: Array<{path: string; success: boolean; url?: string; error?: string}> = [];
    let succeeded = 0;
    let failed = 0;

    for (const fileData of files) {
      try {
        const result = await this.upload(fileData.file, fileData.path, bucketName);
        
        const fileResult = {
          path: fileData.path,
          success: result.success,
          url: result.url || undefined,
          error: result.errors.length > 0 ? result.errors.join(', ') : undefined
        };
        
        results.push(fileResult);
        
        if (result.success) {
          succeeded++;
        } else {
          failed++;
        }
        
        console.log(`  ${result.success ? '✅' : '❌'} ${fileData.path}`);
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error: any) {
        console.error(`❌ Error uploading ${fileData.path}:`, error);
        results.push({
          path: fileData.path,
          success: false,
          error: error.message
        });
        failed++;
      }
    }

    const overallSuccess = succeeded > 0;

    console.log(`📦 BATCH UPLOAD COMPLETE: ${succeeded} succeeded, ${failed} failed`);
    
    return {
      success: overallSuccess,
      results,
      total: files.length,
      succeeded,
      failed
    };
  }

  /**
   * Get file metadata
   */
  static async getFileMetadata(filePath: string, bucketName: string = 'proofs'): Promise<{
    success: boolean;
    metadata?: any;
    error?: string;
  }> {
    if (typeof window === 'undefined') {
      return {
        success: false,
        error: 'Cannot get metadata on server side'
      };
    }

    try {
      const { data, error } = await supabase
        .storage
        .from(bucketName)
        .list('', {
          search: filePath.split('/').pop()
        });

      if (error) {
        return {
          success: false,
          error: error.message
        };
      }

      const file = data?.find(f => f.name === filePath.split('/').pop());
      
      if (!file) {
        return {
          success: false,
          error: 'File not found'
        };
      }

      return {
        success: true,
        metadata: file
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Move file within storage
   */
  static async moveFile(sourcePath: string, destinationPath: string, bucketName: string = 'proofs'): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (typeof window === 'undefined') {
      return {
        success: false,
        error: 'Cannot move file on server side'
      };
    }

    try {
      // First download the file
      const { data: fileData, error: downloadError } = await supabase
        .storage
        .from(bucketName)
        .download(sourcePath);

      if (downloadError || !fileData) {
        return {
          success: false,
          error: `Download failed: ${downloadError?.message || 'No file data'}`
        };
      }

      // Upload to new location
      const { error: uploadError } = await supabase
        .storage
        .from(bucketName)
        .upload(destinationPath, fileData, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        return {
          success: false,
          error: `Upload failed: ${uploadError.message}`
        };
      }

      // Delete original file
      const { error: deleteError } = await supabase
        .storage
        .from(bucketName)
        .remove([sourcePath]);

      if (deleteError) {
        console.warn(`⚠️ Could not delete original file ${sourcePath}: ${deleteError.message}`);
        // We still consider it a success since the file was moved
      }

      console.log(`✅ File moved from ${sourcePath} to ${destinationPath}`);
      return {
        success: true
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Copy file within storage
   */
  static async copyFile(sourcePath: string, destinationPath: string, bucketName: string = 'proofs'): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (typeof window === 'undefined') {
      return {
        success: false,
        error: 'Cannot copy file on server side'
      };
    }

    try {
      // First download the file
      const { data: fileData, error: downloadError } = await supabase
        .storage
        .from(bucketName)
        .download(sourcePath);

      if (downloadError || !fileData) {
        return {
          success: false,
          error: `Download failed: ${downloadError?.message || 'No file data'}`
        };
      }

      // Upload to new location
      const { error: uploadError } = await supabase
        .storage
        .from(bucketName)
        .upload(destinationPath, fileData, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        return {
          success: false,
          error: `Upload failed: ${uploadError.message}`
        };
      }

      console.log(`✅ File copied from ${sourcePath} to ${destinationPath}`);
      return {
        success: true
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create folder in storage
   */
  static async createFolder(folderPath: string, bucketName: string = 'proofs'): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (typeof window === 'undefined') {
      return {
        success: false,
        error: 'Cannot create folder on server side'
      };
    }

    try {
      // Supabase doesn't have explicit folder creation, we create an empty file
      const folderMarkerPath = folderPath.endsWith('/') ? `${folderPath}.folder` : `${folderPath}/.folder`;
      
      const { error } = await supabase
        .storage
        .from(bucketName)
        .upload(folderMarkerPath, new Blob([]), {
          cacheControl: '3600',
          upsert: true
        });

      if (error) {
        return {
          success: false,
          error: `Folder creation failed: ${error.message}`
        };
      }

      console.log(`✅ Folder created: ${folderPath}`);
      return {
        success: true
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get storage usage information
   */
  static async getStorageUsage(bucketName: string = 'proofs'): Promise<{
    success: boolean;
    totalFiles?: number;
    approximateSize?: number;
    error?: string;
  }> {
    if (typeof window === 'undefined') {
      return {
        success: false,
        error: 'Cannot get usage on server side'
      };
    }

    try {
      const { data, error } = await supabase
        .storage
        .from(bucketName)
        .list('', {
          limit: 1000 // Max limit
        });

      if (error) {
        return {
          success: false,
          error: error.message
        };
      }

      const totalFiles = data?.length || 0;
      const approximateSize = data?.reduce((total, file) => total + (file.metadata?.size || 0), 0) || 0;

      return {
        success: true,
        totalFiles,
        approximateSize
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Clean up empty folders
   */
  static async cleanupEmptyFolders(bucketName: string = 'proofs'): Promise<{
    success: boolean;
    cleaned: number;
    errors: string[];
  }> {
    if (typeof window === 'undefined') {
      return {
        success: false,
        cleaned: 0,
        errors: ['Cannot cleanup on server side']
      };
    }

    console.log('🧹 Cleaning up empty folders...');
    
    let cleaned = 0;
    const errors: string[] = [];

    try {
      // Note: This is a simplified implementation
      // In production, you'd need a more sophisticated algorithm
      const { data: folders } = await supabase
        .storage
        .from(bucketName)
        .list('');

      if (!folders) {
        return {
          success: true,
          cleaned: 0,
          errors: []
        };
      }

      // Find and remove folder marker files
      for (const folder of folders) {
        if (folder.name === '.folder') {
          try {
            const { error } = await supabase
              .storage
              .from(bucketName)
              .remove([folder.name]);

            if (!error) {
              cleaned++;
              console.log(`✅ Removed folder marker: ${folder.name}`);
            } else {
              errors.push(`Failed to remove ${folder.name}: ${error.message}`);
            }
          } catch (error: any) {
            errors.push(`Error removing ${folder.name}: ${error.message}`);
          }
        }
      }

      return {
        success: errors.length === 0,
        cleaned,
        errors
      };

    } catch (error: any) {
      console.error('❌ Cleanup error:', error);
      return {
        success: false,
        cleaned: 0,
        errors: [error.message]
      };
    }
  }
}

// Export default untuk backward compatibility
export default supabase;