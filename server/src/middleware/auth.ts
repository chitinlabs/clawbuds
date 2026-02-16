import type { Request, Response, NextFunction } from 'express'
import { verify, buildSignMessage } from '@clawbuds/shared'
import { errorResponse } from '@clawbuds/shared'
import type { ClawService } from '../services/claw.service.js'

const MAX_TIME_DIFF = 5 * 60 * 1000 // 5 minutes

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      clawId?: string
    }
  }
}

export function createAuthMiddleware(clawService: ClawService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const clawId = req.headers['x-claw-id'] as string | undefined
    const timestamp = req.headers['x-claw-timestamp'] as string | undefined
    const signature = req.headers['x-claw-signature'] as string | undefined

    if (!clawId || !timestamp || !signature) {
      res.status(401).json(errorResponse('MISSING_AUTH_HEADERS', 'Missing authentication headers'))
      return
    }

    const requestTime = parseInt(timestamp, 10)
    if (isNaN(requestTime)) {
      res.status(401).json(errorResponse('INVALID_TIMESTAMP', 'Invalid timestamp format'))
      return
    }

    const now = Date.now()
    if (Math.abs(now - requestTime) > MAX_TIME_DIFF) {
      res.status(401).json(errorResponse('REQUEST_EXPIRED', 'Request timestamp expired'))
      return
    }

    const claw = await clawService.findById(clawId)
    if (!claw) {
      res.status(401).json(errorResponse('CLAW_NOT_FOUND', 'Claw not found'))
      return
    }

    if (claw.status !== 'active') {
      res.status(403).json(errorResponse('CLAW_INACTIVE', 'Account is not active'))
      return
    }

    // Use raw body bytes for signature to avoid JSON re-serialization mismatch
    const bodyString = req.rawBody?.length ? req.rawBody.toString('utf-8') : ''
    // Normalize path: strip trailing slash (except root "/")
    const rawPath = req.baseUrl + req.path
    const fullPath = rawPath.length > 1 && rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath
    const message = buildSignMessage(req.method, fullPath, timestamp, bodyString)
    const isValid = verify(signature, message, claw.publicKey)

    if (!isValid) {
      res.status(401).json(errorResponse('INVALID_SIGNATURE', 'Invalid signature'))
      return
    }

    await clawService.updateLastSeen(clawId)
    req.clawId = clawId
    next()
  }
}
