import fs from "fs";
import path from "path";

export interface StorageDirectoryDiagnostics {
  absolutePath: string;
  exists: boolean;
  writable: boolean;
}

export interface StoredFileDiagnostics {
  absolutePath: string;
  exists: boolean | null;
  isFile: boolean;
  readable: boolean;
  sizeBytes: number | null;
  errorCode?: string;
}

/**
 * Returns safe filesystem metadata for operational logs. File contents and
 * original client-supplied names are intentionally never included.
 */
export function inspectStorageDirectory(directory: string): StorageDirectoryDiagnostics {
  const absolutePath = path.resolve(directory);
  let exists = false;
  let writable = false;

  try {
    exists = fs.statSync(absolutePath).isDirectory();
    if (exists) {
      fs.accessSync(absolutePath, fs.constants.W_OK);
      writable = true;
    }
  } catch {
    // Callers log the resulting false checks without exposing OS details.
  }

  return { absolutePath, exists, writable };
}

/**
 * Check a stored upload immediately after writing it or immediately before it
 * is read by the background analysis job.
 */
export function inspectStoredFile(filePath: string): StoredFileDiagnostics {
  const absolutePath = path.resolve(filePath);

  try {
    const stat = fs.statSync(absolutePath);
    let readable = false;

    try {
      fs.accessSync(absolutePath, fs.constants.R_OK);
      readable = true;
    } catch {
      // The diagnostic result records unreadable files without throwing.
    }

    return {
      absolutePath,
      exists: true,
      isFile: stat.isFile(),
      readable,
      sizeBytes: stat.isFile() ? stat.size : null,
    };
  } catch (err) {
    const errorCode =
      err && typeof err === "object" && "code" in err
        ? String(err.code)
        : undefined;

    return {
      absolutePath,
      // Only ENOENT proves the file is missing. Permission and I/O errors
      // leave its existence unknown and must not be presented as "not found".
      exists: errorCode === "ENOENT" ? false : null,
      isFile: false,
      readable: false,
      sizeBytes: null,
      errorCode,
    };
  }
}