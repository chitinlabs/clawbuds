import { Router } from 'express'
import { join, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import multer from 'multer'
import { z } from 'zod'
import { successResponse, errorResponse } from '../lib/response.js'
import { UploadService, UploadError } from '../services/upload.service.js'
import { createAuthMiddleware } from '../middleware/auth.js'
import { config } from '../config/env.js'
import type { ClawService } from '../services/claw.service.js'
import { auditLog, securityLog, AuditEvent } from '../lib/audit-logger.js'
import { asyncHandler } from '../lib/async-handler.js'

const UploadIdSchema = z.string().uuid()

/**
 * Sanitize filename for use in Content-Disposition header.
 * Prevents HTTP response header injection.
 */
function sanitizeFilename(name: string): string {
  return name.replace(/["\\\r\n]/g, '_')
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

// Allowed file types
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/mp4',
  'audio/webm',
]

const ALLOWED_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.mp4',
  '.webm',
  '.mp3',
  '.m4a',
]

export function createUploadsRouter(
  uploadService: UploadService,
  clawService: ClawService,
): Router {
  const router = Router()
  const requireAuth = createAuthMiddleware(clawService)

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, uploadService.getUploadDir())
    },
    filename: (_req, file, cb) => {
      const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}${getExtension(file.originalname)}`
      cb(null, uniqueName)
    },
  })

  const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
  })

  // POST /api/v1/uploads - upload a file
  router.post('/', requireAuth, upload.single('file'), async (req, res) => {
    if (!req.file) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'No file provided'))
      return
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
      // Security log: invalid file type (potential attack)
      securityLog({
        event: AuditEvent.INVALID_FILE_TYPE,
        clawId: req.clawId,
        action: 'File upload rejected: invalid MIME type',
        severity: 'medium',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: {
          filename: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
        },
      })

      res.status(400).json(
        errorResponse(
          'INVALID_FILE_TYPE',
          `File type ${req.file.mimetype} not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
        ),
      )
      return
    }

    // Validate file extension
    const ext = getExtension(req.file.originalname).toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      // Security log: invalid file extension
      securityLog({
        event: AuditEvent.INVALID_FILE_TYPE,
        clawId: req.clawId,
        action: 'File upload rejected: invalid extension',
        severity: 'medium',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: {
          filename: req.file.originalname,
          extension: ext,
          size: req.file.size,
        },
      })

      res.status(400).json(
        errorResponse(
          'INVALID_FILE_EXTENSION',
          `File extension ${ext} not allowed. Allowed extensions: ${ALLOWED_EXTENSIONS.join(', ')}`,
        ),
      )
      return
    }

    try {
      const result = await uploadService.upload(
        req.clawId!,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        req.file.filename,
      )

      const baseUrl = config.serverUrl.replace(/\/+$/, '')

      // Audit log: successful file upload
      auditLog({
        event: AuditEvent.FILE_UPLOAD,
        clawId: req.clawId!,
        targetId: result.id,
        action: `File uploaded: ${result.filename}`,
        result: 'success',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: {
          filename: result.filename,
          mimeType: result.mimeType,
          size: result.size,
        },
      })

      res.status(201).json(
        successResponse({
          id: result.id,
          filename: result.filename,
          mimeType: result.mimeType,
          size: result.size,
          url: `${baseUrl}/api/v1/uploads/${result.id}`,
          createdAt: result.createdAt,
        }),
      )
    } catch (err) {
      if (err instanceof UploadError) {
        res.status(400).json(errorResponse(err.code, err.message))
        return
      }
      throw err
    }
  })

  // GET /api/v1/uploads/:id - download a file (public, UUID is unguessable)
  router.get('/:id', asyncHandler(async (req, res) => {
    const parsed = UploadIdSchema.safeParse(req.params.id)
    if (!parsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid upload ID format'))
      return
    }
    const id = parsed.data

    // For remote storage (Supabase), redirect to the storage URL
    if (uploadService.isRemoteStorage()) {
      const url = await uploadService.getFileUrl(id)
      if (!url) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Upload not found'))
        return
      }
      res.redirect(url)
      return
    }

    // For local storage, serve through IStorageService when available
    const uploadRecord = await uploadService.findById(id)
    if (!uploadRecord) {
      res.status(404).json(errorResponse('NOT_FOUND', 'Upload not found'))
      return
    }

    const safeFilename = sanitizeFilename(uploadRecord.filename)

    const storageService = uploadService.getStorageService()
    if (storageService) {
      try {
        const buffer = await storageService.download('uploads', uploadRecord.path)
        res.setHeader('Content-Type', uploadRecord.mimeType)
        res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`)
        res.send(buffer)
      } catch {
        res.status(404).json(errorResponse('NOT_FOUND', 'File not found in storage'))
      }
      return
    }

    // Fallback: no storage service configured, serve directly from disk
    // Path traversal guard: ensure resolved path stays within upload directory
    const uploadDir = resolve(uploadService.getUploadDir())
    const filePath = resolve(uploadDir, uploadRecord.path)
    if (!filePath.startsWith(uploadDir)) {
      res.status(403).json(errorResponse('FORBIDDEN', 'Invalid file path'))
      return
    }

    if (!existsSync(filePath)) {
      res.status(404).json(errorResponse('NOT_FOUND', 'File not found on disk'))
      return
    }

    res.setHeader('Content-Type', uploadRecord.mimeType)
    res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`)
    res.sendFile(filePath)
  }))

  return router
}

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.')
  return idx >= 0 ? filename.slice(idx) : ''
}
