import fs from 'fs';
import path from 'path';
import pg from 'pg';

export interface StoredMediaEntry {
  id: string;
  patientId?: string;
  mimeType: string;
  buffer: Buffer;
  storageBackend: 'supabase_storage' | 'postgres' | 'disk' | 'memory';
  storageKey?: string;
}

export interface MediaStorageStatus {
  supabaseStorageConfigured: boolean;
  supabaseBucketReady: boolean;
  bucketName: string;
  postgresMediaReady: boolean;
  mediaCount: number;
  totalBytes: number;
  lastError: string | null;
}

const MAX_CACHE_ENTRIES = 120;
const MAX_CACHE_TOTAL_BYTES = 64 * 1024 * 1024; // 64MB bounded RAM cache

class MediaStorageService {
  private pgPool: pg.Pool | null = null;
  private supabaseBucketReady = false;
  private postgresMediaReady = false;
  private lastError: string | null = null;
  private uploadsDir: string;

  // Bounded LRU-like in-memory cache so freshly uploaded/viewed media serves instantly
  private cache = new Map<string, { buffer: Buffer; mimeType: string; patientId?: string }>();
  private cacheBytes = 0;

  constructor() {
    const dataDir = process.env.DATA_DIR
      ? path.resolve(process.env.DATA_DIR)
      : path.resolve(process.cwd(), 'data');
    this.uploadsDir = process.env.DATA_DIR
      ? path.join(dataDir, 'uploads')
      : path.resolve(process.cwd(), 'uploads');
  }

  public getSupabaseUrl(): string {
    return (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  }

  public getSupabaseServiceKey(): string {
    return (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  }

  public getBucketName(): string {
    return (process.env.SUPABASE_STORAGE_BUCKET || 'clinical-media').trim() || 'clinical-media';
  }

  public isSupabaseStorageConfigured(): boolean {
    return Boolean(this.getSupabaseUrl() && this.getSupabaseServiceKey());
  }

  public isCloudOffloadEnabled(): boolean {
    return this.isSupabaseStorageConfigured() || Boolean(this.pgPool && this.postgresMediaReady);
  }

  public sanitizeId(rawId: string): string {
    return String(rawId || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 160);
  }

  private putInCache(id: string, entry: { buffer: Buffer; mimeType: string; patientId?: string }) {
    if (entry.buffer.length > 16 * 1024 * 1024) return; // Do not cache single >16MB blobs in RAM
    const existing = this.cache.get(id);
    if (existing) {
      this.cacheBytes -= existing.buffer.length;
      this.cache.delete(id);
    }
    this.cache.set(id, entry);
    this.cacheBytes += entry.buffer.length;

    while (this.cache.size > MAX_CACHE_ENTRIES || this.cacheBytes > MAX_CACHE_TOTAL_BYTES) {
      const oldestKey = this.cache.keys().next().value;
      if (!oldestKey) break;
      const oldest = this.cache.get(oldestKey);
      if (oldest) this.cacheBytes -= oldest.buffer.length;
      this.cache.delete(oldestKey);
    }
  }

  public async init(pool: pg.Pool | null): Promise<void> {
    this.pgPool = pool;
    this.lastError = null;

    if (this.pgPool) {
      try {
        await this.pgPool.query(`
          CREATE TABLE IF NOT EXISTS clinical_os_media (
            id TEXT PRIMARY KEY,
            patient_id TEXT,
            mime_type TEXT NOT NULL,
            storage_backend TEXT NOT NULL DEFAULT 'postgres',
            storage_key TEXT,
            data BYTEA,
            size_bytes INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_clinical_os_media_patient_id ON clinical_os_media (patient_id);
        `);
        this.postgresMediaReady = true;
      } catch (err: unknown) {
        this.postgresMediaReady = false;
        this.lastError = err instanceof Error ? err.message : 'Failed to initialize Postgres media table';
        console.warn('[MediaStorage] Postgres media table init warning:', this.lastError);
      }
    } else {
      this.postgresMediaReady = false;
    }

    if (this.isSupabaseStorageConfigured()) {
      await this.ensureSupabaseBucket();
    } else {
      this.supabaseBucketReady = false;
    }
  }

  private async ensureSupabaseBucket(): Promise<boolean> {
    const baseUrl = this.getSupabaseUrl();
    const key = this.getSupabaseServiceKey();
    const bucket = this.getBucketName();
    if (!baseUrl || !key) return false;

    try {
      const checkRes = await fetch(`${baseUrl}/storage/v1/bucket/${encodeURIComponent(bucket)}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${key}`,
          apikey: key
        }
      });

      if (checkRes.ok) {
        this.supabaseBucketReady = true;
        return true;
      }

      if (checkRes.status === 404 || checkRes.status === 400) {
        const createRes = await fetch(`${baseUrl}/storage/v1/bucket`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            apikey: key,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            id: bucket,
            name: bucket,
            public: false,
            file_size_limit: 20 * 1024 * 1024
          })
        });
        if (createRes.ok || createRes.status === 409) {
          this.supabaseBucketReady = true;
          console.log(`[MediaStorage] Supabase Storage bucket "${bucket}" ready (private).`);
          return true;
        }
        const errText = await createRes.text().catch(() => createRes.statusText);
        this.lastError = `Supabase bucket creation failed: ${errText}`;
        console.warn('[MediaStorage]', this.lastError);
      } else {
        const errText = await checkRes.text().catch(() => checkRes.statusText);
        this.lastError = `Supabase bucket check failed (${checkRes.status}): ${errText}`;
        console.warn('[MediaStorage]', this.lastError);
      }
    } catch (err: unknown) {
      this.lastError = err instanceof Error ? err.message : 'Supabase Storage network error';
      console.warn('[MediaStorage] Supabase Storage init error:', this.lastError);
    }
    this.supabaseBucketReady = false;
    return false;
  }

  public cacheAndPersist(params: {
    id: string;
    patientId?: string;
    mimeType: string;
    buffer: Buffer;
    objectKey?: string;
  }): void {
    const cleanId = this.sanitizeId(params.id);
    if (!cleanId || !params.buffer) return;
    this.putInCache(cleanId, {
      buffer: params.buffer,
      mimeType: params.mimeType,
      patientId: params.patientId
    });
    void this.saveMedia({ ...params, id: cleanId });
  }

  public async saveMedia(params: {
    id: string;
    patientId?: string;
    mimeType: string;
    buffer: Buffer;
    objectKey?: string;
  }): Promise<{ backend: 'supabase_storage' | 'postgres' | 'disk'; storageKey: string }> {
    const cleanId = this.sanitizeId(params.id);
    const mimeType = params.mimeType || 'application/octet-stream';
    const ext = mimeType.includes('pdf')
      ? 'pdf'
      : mimeType.includes('svg')
      ? 'svg'
      : mimeType.includes('png')
      ? 'png'
      : mimeType.includes('webp')
      ? 'webp'
      : 'jpg';
    const objectKey = (params.objectKey || `${params.patientId || 'shared'}/${cleanId}.${ext}`)
      .replace(/^\/+/, '');

    this.putInCache(cleanId, {
      buffer: params.buffer,
      mimeType,
      patientId: params.patientId
    });

    let backend: 'supabase_storage' | 'postgres' | 'disk' = 'disk';
    let uploadedToSupabase = false;

    if (this.isSupabaseStorageConfigured()) {
      if (!this.supabaseBucketReady) {
        await this.ensureSupabaseBucket();
      }
      if (this.supabaseBucketReady) {
        try {
          const encodedKey = objectKey.split('/').map((seg) => encodeURIComponent(seg)).join('/');
          const uploadRes = await fetch(
            `${this.getSupabaseUrl()}/storage/v1/object/${encodeURIComponent(this.getBucketName())}/${encodedKey}`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${this.getSupabaseServiceKey()}`,
                apikey: this.getSupabaseServiceKey(),
                'Content-Type': mimeType,
                'x-upsert': 'true'
              },
              body: new Uint8Array(params.buffer)
            }
          );
          if (uploadRes.ok) {
            uploadedToSupabase = true;
            backend = 'supabase_storage';
          } else {
            const errBody = await uploadRes.text().catch(() => uploadRes.statusText);
            this.lastError = `Supabase upload failed (${uploadRes.status}): ${errBody}`;
            console.warn('[MediaStorage]', this.lastError);
          }
        } catch (err: unknown) {
          this.lastError = err instanceof Error ? err.message : 'Supabase upload error';
          console.warn('[MediaStorage] Supabase upload error:', this.lastError);
        }
      }
    }

    if (this.pgPool && this.postgresMediaReady) {
      try {
        // When stored in Supabase Storage bucket, keep bytea NULL in Postgres so DB size stays tiny
        const dataCol = uploadedToSupabase ? null : params.buffer;
        const dbBackend = uploadedToSupabase ? 'supabase_storage' : 'postgres';
        if (!uploadedToSupabase) backend = 'postgres';

        await this.pgPool.query(
          `INSERT INTO clinical_os_media (id, patient_id, mime_type, storage_backend, storage_key, data, size_bytes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET
             patient_id = COALESCE(EXCLUDED.patient_id, clinical_os_media.patient_id),
             mime_type = EXCLUDED.mime_type,
             storage_backend = EXCLUDED.storage_backend,
             storage_key = EXCLUDED.storage_key,
             data = EXCLUDED.data,
             size_bytes = EXCLUDED.size_bytes`,
          [
            cleanId,
            params.patientId || null,
            mimeType,
            dbBackend,
            objectKey,
            dataCol,
            params.buffer.length
          ]
        );
      } catch (err: unknown) {
        console.warn('[MediaStorage] Postgres media write error:', err);
      }
    }

    // Best-effort local disk copy for fast local serving (non-critical on ephemeral hosts)
    try {
      if (!fs.existsSync(this.uploadsDir)) {
        fs.mkdirSync(this.uploadsDir, { recursive: true });
      }
      const diskFile = path.join(this.uploadsDir, `${cleanId}.${ext}`);
      fs.writeFileSync(diskFile, params.buffer);
    } catch {
      // ignore disk failure on read-only/ephemeral FS
    }

    return { backend, storageKey: objectKey };
  }

  public async getMedia(rawId: string): Promise<StoredMediaEntry | null> {
    const cleanId = this.sanitizeId(rawId);
    if (!cleanId) return null;

    // 1. Check RAM cache
    const cached = this.cache.get(cleanId);
    if (cached) {
      return {
        id: cleanId,
        patientId: cached.patientId,
        mimeType: cached.mimeType,
        buffer: cached.buffer,
        storageBackend: 'memory'
      };
    }

    // 2. Check Postgres media index (which either holds bytea directly OR the Supabase Storage object key)
    if (this.pgPool && this.postgresMediaReady) {
      try {
        const res = await this.pgPool.query(
          `SELECT id, patient_id, mime_type, storage_backend, storage_key, data FROM clinical_os_media WHERE id = $1 LIMIT 1`,
          [cleanId]
        );
        if (res.rows.length > 0) {
          const row = res.rows[0];
          const mimeType = row.mime_type || 'application/octet-stream';
          const patientId = row.patient_id || undefined;
          const storageKey = row.storage_key || undefined;

          if (row.data && Buffer.isBuffer(row.data)) {
            this.putInCache(cleanId, { buffer: row.data, mimeType, patientId });
            return {
              id: cleanId,
              patientId,
              mimeType,
              buffer: row.data,
              storageBackend: 'postgres',
              storageKey
            };
          }

          if (storageKey && this.isSupabaseStorageConfigured()) {
            const downloaded = await this.fetchFromSupabaseStorage(storageKey);
            if (downloaded) {
              this.putInCache(cleanId, { buffer: downloaded, mimeType, patientId });
              return {
                id: cleanId,
                patientId,
                mimeType,
                buffer: downloaded,
                storageBackend: 'supabase_storage',
                storageKey
              };
            }
          }
        }
      } catch (err) {
        console.warn('[MediaStorage] Postgres media read warning:', err);
      }
    }

    // 3. Direct Supabase Storage probe by standard extensions if no Postgres index row existed
    if (this.isSupabaseStorageConfigured()) {
      for (const candidateKey of [`${cleanId}.jpg`, `${cleanId}.png`, `${cleanId}.pdf`, `${cleanId}.webp`]) {
        const downloaded = await this.fetchFromSupabaseStorage(candidateKey);
        if (downloaded) {
          const mimeType = candidateKey.endsWith('.pdf')
            ? 'application/pdf'
            : candidateKey.endsWith('.png')
            ? 'image/png'
            : candidateKey.endsWith('.webp')
            ? 'image/webp'
            : 'image/jpeg';
          this.putInCache(cleanId, { buffer: downloaded, mimeType });
          return {
            id: cleanId,
            mimeType,
            buffer: downloaded,
            storageBackend: 'supabase_storage',
            storageKey: candidateKey
          };
        }
      }
    }

    // 4. Local disk fallback
    try {
      for (const ext of ['jpg', 'png', 'webp', 'svg', 'pdf']) {
        const diskPath = path.join(this.uploadsDir, `${cleanId}.${ext}`);
        if (fs.existsSync(diskPath)) {
          const buffer = fs.readFileSync(diskPath);
          const mimeType =
            ext === 'pdf'
              ? 'application/pdf'
              : ext === 'svg'
              ? 'image/svg+xml'
              : ext === 'png'
              ? 'image/png'
              : ext === 'webp'
              ? 'image/webp'
              : 'image/jpeg';
          this.putInCache(cleanId, { buffer, mimeType });
          return { id: cleanId, mimeType, buffer, storageBackend: 'disk' };
        }
      }
    } catch {
      // ignore disk read errors
    }

    return null;
  }

  private async fetchFromSupabaseStorage(objectKey: string): Promise<Buffer | null> {
    const baseUrl = this.getSupabaseUrl();
    const key = this.getSupabaseServiceKey();
    const bucket = this.getBucketName();
    if (!baseUrl || !key) return null;

    try {
      const cleanKey = objectKey.replace(/^\/+/, '');
      const encodedKey = cleanKey.split('/').map((seg) => encodeURIComponent(seg)).join('/');
      const res = await fetch(
        `${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedKey}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${key}`,
            apikey: key
          }
        }
      );
      if (!res.ok) return null;
      const arrBuf = await res.arrayBuffer();
      return Buffer.from(arrBuf);
    } catch {
      return null;
    }
  }

  public async deleteMedia(rawId: string): Promise<void> {
    const cleanId = this.sanitizeId(rawId);
    if (!cleanId) return;

    const existing = this.cache.get(cleanId);
    if (existing) {
      this.cacheBytes -= existing.buffer.length;
      this.cache.delete(cleanId);
    }

    if (this.pgPool && this.postgresMediaReady) {
      try {
        const res = await this.pgPool.query(
          `DELETE FROM clinical_os_media WHERE id = $1 RETURNING storage_key`,
          [cleanId]
        );
        const storageKey = res.rows[0]?.storage_key;
        if (storageKey && this.isSupabaseStorageConfigured()) {
          await fetch(
            `${this.getSupabaseUrl()}/storage/v1/object/${encodeURIComponent(this.getBucketName())}`,
            {
              method: 'DELETE',
              headers: {
                Authorization: `Bearer ${this.getSupabaseServiceKey()}`,
                apikey: this.getSupabaseServiceKey(),
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ prefixes: [storageKey] })
            }
          ).catch(() => {});
        }
      } catch {
        // ignore delete failure
      }
    }

    try {
      for (const ext of ['jpg', 'png', 'webp', 'svg', 'pdf']) {
        const diskPath = path.join(this.uploadsDir, `${cleanId}.${ext}`);
        if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
      }
    } catch {
      // ignore disk delete failure
    }
  }

  public async resolveAsDataUrl(urlOrDataUrl: string): Promise<string> {
    if (!urlOrDataUrl) return '';
    if (urlOrDataUrl.startsWith('data:')) return urlOrDataUrl;

    if (urlOrDataUrl.startsWith('/api/media/')) {
      const idPart = urlOrDataUrl.slice('/api/media/'.length).split('?')[0];
      const entry = await this.getMedia(idPart);
      if (entry) {
        return `data:${entry.mimeType};base64,${entry.buffer.toString('base64')}`;
      }
    }

    if (urlOrDataUrl.startsWith('/uploads/')) {
      const baseName = path.basename(urlOrDataUrl.split('?')[0]);
      const diskPath = path.join(this.uploadsDir, baseName);
      if (fs.existsSync(diskPath)) {
        const buf = fs.readFileSync(diskPath);
        const ext = path.extname(baseName).toLowerCase();
        const mime =
          ext === '.png'
            ? 'image/png'
            : ext === '.webp'
            ? 'image/webp'
            : ext === '.svg'
            ? 'image/svg+xml'
            : 'image/jpeg';
        return `data:${mime};base64,${buf.toString('base64')}`;
      }
    }

    return urlOrDataUrl;
  }

  public async getStats(): Promise<MediaStorageStatus> {
    let mediaCount = this.cache.size;
    let totalBytes = this.cacheBytes;

    if (this.pgPool && this.postgresMediaReady) {
      try {
        const res = await this.pgPool.query(
          `SELECT COUNT(*)::int AS cnt, COALESCE(SUM(size_bytes), 0)::bigint AS total_bytes FROM clinical_os_media`
        );
        mediaCount = Number(res.rows[0]?.cnt || 0);
        totalBytes = Number(res.rows[0]?.total_bytes || 0);
      } catch {
        // ignore stats query failure
      }
    }

    return {
      supabaseStorageConfigured: this.isSupabaseStorageConfigured(),
      supabaseBucketReady: this.supabaseBucketReady,
      bucketName: this.getBucketName(),
      postgresMediaReady: this.postgresMediaReady,
      mediaCount,
      totalBytes,
      lastError: this.lastError
    };
  }
}

export const mediaStorage = new MediaStorageService();
