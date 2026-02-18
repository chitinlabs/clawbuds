/**
 * Audit Logger
 *
 * Records critical security and operational events for compliance and forensics.
 * Audit logs are separate from application logs and should be immutable.
 */

import winston from 'winston'
import { config } from '../config/env.js'

// Audit event types
export enum AuditEvent {
  // Authentication & Authorization
  USER_REGISTER = 'user.register',
  USER_LOGIN = 'user.login',
  USER_LOGOUT = 'user.logout',
  AUTH_FAILURE = 'auth.failure',

  // Messaging
  MESSAGE_SEND = 'message.send',
  MESSAGE_EDIT = 'message.edit',
  MESSAGE_DELETE = 'message.delete',

  // Webhooks
  WEBHOOK_CREATE = 'webhook.create',
  WEBHOOK_UPDATE = 'webhook.update',
  WEBHOOK_DELETE = 'webhook.delete',
  WEBHOOK_TRIGGER = 'webhook.trigger',

  // File Operations
  FILE_UPLOAD = 'file.upload',
  FILE_DOWNLOAD = 'file.download',

  // Groups
  GROUP_CREATE = 'group.create',
  GROUP_JOIN = 'group.join',
  GROUP_LEAVE = 'group.leave',
  GROUP_DELETE = 'group.delete',

  // Friendships
  FRIEND_REQUEST = 'friend.request',
  FRIEND_ACCEPT = 'friend.accept',
  FRIEND_REJECT = 'friend.reject',
  FRIEND_REMOVE = 'friend.remove',

  // Security Events
  RATE_LIMIT_EXCEEDED = 'security.rate_limit_exceeded',
  INVALID_SIGNATURE = 'security.invalid_signature',
  SSRF_ATTEMPT = 'security.ssrf_attempt',
  INVALID_FILE_TYPE = 'security.invalid_file_type',
}

// Audit log entry interface
export interface AuditLogEntry {
  event: AuditEvent
  clawId?: string
  targetId?: string // ID of affected resource (message, webhook, file, etc.)
  action: string // Human-readable action description
  result: 'success' | 'failure'
  ip?: string
  userAgent?: string
  metadata?: Record<string, unknown>
}

// Create winston audit logger
const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: { service: 'clawbuds-audit' },
  transports: [
    // Write all audit logs to audit.log
    new winston.transports.File({
      filename: 'logs/audit.log',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 30, // Keep 30 days of logs
      tailable: true,
    }),
    // Also write to combined.log
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 7,
    }),
  ],
})

// In development, also log to console
if (config.nodeEnv !== 'production') {
  auditLogger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : ''
          return `${timestamp} [${level}] ${message}${metaStr}`
        }),
      ),
    }),
  )
}

/**
 * Log an audit event
 */
export function auditLog(entry: AuditLogEntry): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event: entry.event,
    clawId: entry.clawId || 'anonymous',
    targetId: entry.targetId,
    action: entry.action,
    result: entry.result,
    ip: entry.ip,
    userAgent: entry.userAgent,
    ...entry.metadata,
  }

  auditLogger.info('AUDIT', logEntry)
}

/**
 * Log a security event (high priority)
 */
export function securityLog(entry: Omit<AuditLogEntry, 'result'> & { severity: 'low' | 'medium' | 'high' | 'critical' }): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event: entry.event,
    clawId: entry.clawId || 'anonymous',
    targetId: entry.targetId,
    action: entry.action,
    severity: entry.severity,
    ip: entry.ip,
    userAgent: entry.userAgent,
    ...entry.metadata,
  }

  if (entry.severity === 'critical' || entry.severity === 'high') {
    auditLogger.error('SECURITY', logEntry)
  } else {
    auditLogger.warn('SECURITY', logEntry)
  }
}

export default auditLogger
