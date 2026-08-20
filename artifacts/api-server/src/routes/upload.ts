import { Router, IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { requireAuth } from "../lib/auth";
import { getUploadsDir } from "../lib/pdfService";
import { logger } from "../lib/logger";
import { inspectStorageDirectory, inspectStoredFile } from "../lib/fileStorage";

const router: IRouter = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, getUploadsDir());
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowed = [".pdf", ".jpg", ".jpeg", ".png"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF, JPG, and PNG files are allowed"));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 5,
  },
});

router.post(
  "/upload",
  requireAuth,
  upload.array("files", 5),
  async (req, res): Promise<void> => {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      res.status(400).json({ error: "No files uploaded" });
      return;
    }

    const filePaths = files.map((f) => f.path);
    const directory = inspectStorageDirectory(getUploadsDir());
    const storedFiles = filePaths.map(inspectStoredFile);
    const failedVerification = storedFiles.some(
      (file) => !file.exists || !file.isFile || !file.readable,
    );

    logger.info(
      {
        count: files.length,
        storageDirectory: directory,
        storedFiles,
      },
      "Upload files written and verified on disk",
    );

    if (failedVerification) {
      for (const filePath of filePaths) {
        try {
          fs.rmSync(filePath, { force: true });
        } catch {
          // The failure is already captured by the diagnostic log above.
        }
      }

      logger.error(
        { storageDirectory: directory, storedFiles },
        "Upload verification failed after Multer wrote files",
      );
      res.status(500).json({
        error: "The uploaded files could not be saved on the analysis server. Please try again.",
      });
      return;
    }

    res.json({ filePaths });
  }
);

export default router;
