import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";

/**
 * Immutable, content-addressed document storage. Files are stored by sha256
 * and never modified or deleted — provenance depends on it.
 * Backed by a directory (Railway volume at /data in production).
 */
export interface FileStore {
  put(sha256: string, bytes: Uint8Array): Promise<string>; // returns storageKey
  get(storageKey: string): Promise<Uint8Array>;
  exists(storageKey: string): Promise<boolean>;
}

export function sha256Of(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export class DiskFileStore implements FileStore {
  private readonly root: string;

  constructor(root?: string) {
    this.root =
      root ??
      process.env["DOCUMENT_STORE_PATH"] ??
      (process.env["NODE_ENV"] === "production" ? "/data/documents" : ".data/documents");
  }

  private pathFor(sha256: string): string {
    return join(this.root, sha256.slice(0, 2), sha256);
  }

  async put(sha256: string, bytes: Uint8Array): Promise<string> {
    const path = this.pathFor(sha256);
    await mkdir(join(this.root, sha256.slice(0, 2)), { recursive: true });
    try {
      await access(path);
      return path; // already stored — content-addressed, identical by definition
    } catch {
      await writeFile(path, bytes, { flag: "wx" });
      return path;
    }
  }

  get(storageKey: string): Promise<Uint8Array> {
    return readFile(storageKey);
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      await access(storageKey);
      return true;
    } catch {
      return false;
    }
  }
}

let defaultStore: FileStore | undefined;
export function fileStore(): FileStore {
  return (defaultStore ??= new DiskFileStore());
}
