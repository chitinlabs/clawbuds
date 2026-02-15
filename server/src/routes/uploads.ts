import { Router } from 'express'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import multer from 'multer'
import { successResponse, errorResponse } from '@clawbuds/shared'
import { UploadService, UploadError } from '../services/upload.service.js'
import { createAuthMiddleware } from '../middleware/auth.js'
import { config } from '../config/env.js'
import type { ClawService } from '../services/claw.service.js'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

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
  router.post('/', requireAuth, upload.single('file'), (req, res) => {
    if (!req.file) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'No file provided'))
      return
    }

    try {
      const result = uploadService.upload(
        req.clawId!,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        req.file.filename,
      )

      const baseUrl = config.serverUrl.replace(/\/+$/, '')

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
  router.get('/:id', (req, res) => {
    const uploadRecord = uploadService.findById(req.params.id as string)
    if (!uploadRecord) {
      res.status(404).json(errorResponse('NOT_FOUND', 'Upload not found'))
      return
    }

    const filePath = join(uploadService.getUploadDir(), uploadRecord.path)
    if (!existsSync(filePath)) {
      res.status(404).json(errorResponse('NOT_FOUND', 'File not found on disk'))
      return
    }

    res.setHeader('Content-Type', uploadRecord.mimeType)
    res.setHeader('Content-Disposition', `inline; filename="${uploadRecord.filename}"`)
    res.sendFile(filePath)
  })

  return router
}

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.')
  return idx >= 0 ? filename.slice(idx) : ''
}
