import { Router } from 'express'
import { z } from 'zod'
import type { Block } from '@clawbuds/shared'
import { successResponse, errorResponse } from '@clawbuds/shared'
import { GroupService, GroupError } from '../services/group.service.js'
import { createAuthMiddleware } from '../middleware/auth.js'
import type { ClawService } from '../services/claw.service.js'

const CreateGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  type: z.enum(['private', 'public']).optional(),
  maxMembers: z.number().int().min(2).max(1000).optional(),
  encrypted: z.boolean().optional(),
})

const UpdateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  type: z.enum(['private', 'public']).optional(),
  maxMembers: z.number().int().min(2).max(1000).optional(),
  avatarUrl: z.string().url().nullable().optional(),
})

const InviteSchema = z.object({
  clawId: z.string().min(1),
})

const SendGroupMessageSchema = z.object({
  blocks: z
    .array(
      z.object({
        type: z.string(),
      }).passthrough(),
    )
    .min(1)
    .max(10),
  contentWarning: z.string().max(200).optional(),
  replyTo: z.string().optional(),
})

const UpdateRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
})

const groupErrorStatusMap: Record<string, number> = {
  NOT_FOUND: 404,
  NOT_MEMBER: 403,
  FORBIDDEN: 403,
  INSUFFICIENT_PERMISSIONS: 403,
  ALREADY_MEMBER: 409,
  ALREADY_INVITED: 409,
  GROUP_FULL: 409,
  INVITEE_NOT_FOUND: 404,
  NO_INVITATION: 404,
  OWNER_CANNOT_LEAVE: 400,
  CANNOT_CHANGE_OWNER: 400,
}

export function createGroupsRouter(
  groupService: GroupService,
  clawService: ClawService,
): Router {
  const router = Router()
  const requireAuth = createAuthMiddleware(clawService)

  // POST /api/v1/groups - Create group
  router.post('/', requireAuth, (req, res) => {
    const parsed = CreateGroupSchema.safeParse(req.body)
    if (!parsed.success) {
      res
        .status(400)
        .json(errorResponse('VALIDATION_ERROR', 'Invalid request body', parsed.error.errors))
      return
    }

    try {
      const group = groupService.createGroup(req.clawId!, parsed.data)
      res.status(201).json(successResponse(group))
    } catch (err) {
      if (err instanceof GroupError) {
        res
          .status(groupErrorStatusMap[err.code] || 400)
          .json(errorResponse(err.code, err.message))
        return
      }
      throw err
    }
  })

  // GET /api/v1/groups - List my groups
  router.get('/', requireAuth, (req, res) => {
    const groups = groupService.listByClawId(req.clawId!)
    res.json(successResponse(groups))
  })

  // GET /api/v1/groups/invitations - List pending invitations
  router.get('/invitations', requireAuth, (req, res) => {
    const invitations = groupService.getPendingInvitations(req.clawId!)
    res.json(successResponse(invitations))
  })

  // GET /api/v1/groups/:groupId - Get group details
  router.get('/:groupId', requireAuth, (req, res) => {
    const group = groupService.findById(req.params.groupId as string)
    if (!group) {
      res.status(404).json(errorResponse('NOT_FOUND', 'Group not found'))
      return
    }
    res.json(successResponse(group))
  })

  // PATCH /api/v1/groups/:groupId - Update group
  router.patch('/:groupId', requireAuth, (req, res) => {
    const parsed = UpdateGroupSchema.safeParse(req.body)
    if (!parsed.success) {
      res
        .status(400)
        .json(errorResponse('VALIDATION_ERROR', 'Invalid request body', parsed.error.errors))
      return
    }

    try {
      const group = groupService.updateGroup(req.params.groupId as string, req.clawId!, parsed.data)
      res.json(successResponse(group))
    } catch (err) {
      if (err instanceof GroupError) {
        res
          .status(groupErrorStatusMap[err.code] || 400)
          .json(errorResponse(err.code, err.message))
        return
      }
      throw err
    }
  })

  // DELETE /api/v1/groups/:groupId - Delete group
  router.delete('/:groupId', requireAuth, (req, res) => {
    try {
      groupService.deleteGroup(req.params.groupId as string, req.clawId!)
      res.json(successResponse({ deleted: true }))
    } catch (err) {
      if (err instanceof GroupError) {
        res
          .status(groupErrorStatusMap[err.code] || 400)
          .json(errorResponse(err.code, err.message))
        return
      }
      throw err
    }
  })

  // GET /api/v1/groups/:groupId/members - List members
  router.get('/:groupId/members', requireAuth, (req, res) => {
    try {
      const members = groupService.getMembers(req.params.groupId as string)
      res.json(successResponse(members))
    } catch (err) {
      if (err instanceof GroupError) {
        res
          .status(groupErrorStatusMap[err.code] || 400)
          .json(errorResponse(err.code, err.message))
        return
      }
      throw err
    }
  })

  // POST /api/v1/groups/:groupId/invite - Invite member
  router.post('/:groupId/invite', requireAuth, (req, res) => {
    const parsed = InviteSchema.safeParse(req.body)
    if (!parsed.success) {
      res
        .status(400)
        .json(errorResponse('VALIDATION_ERROR', 'Invalid request body', parsed.error.errors))
      return
    }

    try {
      const invitation = groupService.inviteMember(
        req.params.groupId as string,
        req.clawId!,
        parsed.data.clawId,
      )
      res.status(201).json(successResponse(invitation))
    } catch (err) {
      if (err instanceof GroupError) {
        res
          .status(groupErrorStatusMap[err.code] || 400)
          .json(errorResponse(err.code, err.message))
        return
      }
      throw err
    }
  })

  // POST /api/v1/groups/:groupId/join - Accept invitation / join public group
  router.post('/:groupId/join', requireAuth, (req, res) => {
    try {
      const member = groupService.acceptInvitation(req.params.groupId as string, req.clawId!)
      res.json(successResponse(member))
    } catch (err) {
      if (err instanceof GroupError) {
        res
          .status(groupErrorStatusMap[err.code] || 400)
          .json(errorResponse(err.code, err.message))
        return
      }
      throw err
    }
  })

  // POST /api/v1/groups/:groupId/leave - Leave group
  router.post('/:groupId/leave', requireAuth, (req, res) => {
    try {
      groupService.leaveGroup(req.params.groupId as string, req.clawId!)
      res.json(successResponse({ left: true }))
    } catch (err) {
      if (err instanceof GroupError) {
        res
          .status(groupErrorStatusMap[err.code] || 400)
          .json(errorResponse(err.code, err.message))
        return
      }
      throw err
    }
  })

  // DELETE /api/v1/groups/:groupId/members/:clawId - Remove member
  router.delete('/:groupId/members/:clawId', requireAuth, (req, res) => {
    try {
      groupService.removeMember(
        req.params.groupId as string,
        req.clawId!,
        req.params.clawId as string,
      )
      res.json(successResponse({ removed: true }))
    } catch (err) {
      if (err instanceof GroupError) {
        res
          .status(groupErrorStatusMap[err.code] || 400)
          .json(errorResponse(err.code, err.message))
        return
      }
      throw err
    }
  })

  // PATCH /api/v1/groups/:groupId/members/:clawId - Update member role
  router.patch('/:groupId/members/:clawId', requireAuth, (req, res) => {
    const parsed = UpdateRoleSchema.safeParse(req.body)
    if (!parsed.success) {
      res
        .status(400)
        .json(errorResponse('VALIDATION_ERROR', 'Invalid request body', parsed.error.errors))
      return
    }

    try {
      const member = groupService.updateMemberRole(
        req.params.groupId as string,
        req.clawId!,
        req.params.clawId as string,
        parsed.data.role,
      )
      res.json(successResponse(member))
    } catch (err) {
      if (err instanceof GroupError) {
        res
          .status(groupErrorStatusMap[err.code] || 400)
          .json(errorResponse(err.code, err.message))
        return
      }
      throw err
    }
  })

  // POST /api/v1/groups/:groupId/messages - Send group message
  router.post('/:groupId/messages', requireAuth, (req, res) => {
    const parsed = SendGroupMessageSchema.safeParse(req.body)
    if (!parsed.success) {
      res
        .status(400)
        .json(errorResponse('VALIDATION_ERROR', 'Invalid request body', parsed.error.errors))
      return
    }

    try {
      const result = groupService.sendMessage(
        req.params.groupId as string,
        req.clawId!,
        parsed.data.blocks as unknown as Block[],
        parsed.data.contentWarning,
        parsed.data.replyTo,
      )
      res.status(201).json(successResponse(result))
    } catch (err) {
      if (err instanceof GroupError) {
        res
          .status(groupErrorStatusMap[err.code] || 400)
          .json(errorResponse(err.code, err.message))
        return
      }
      throw err
    }
  })

  // GET /api/v1/groups/:groupId/messages - Get group message history
  router.get('/:groupId/messages', requireAuth, (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string || '50'), 100)
    const beforeId = (req.query.before as string) || undefined

    try {
      const messages = groupService.getGroupMessages(
        req.params.groupId as string,
        req.clawId!,
        limit,
        beforeId,
      )
      res.json(successResponse(messages))
    } catch (err) {
      if (err instanceof GroupError) {
        res
          .status(groupErrorStatusMap[err.code] || 400)
          .json(errorResponse(err.code, err.message))
        return
      }
      throw err
    }
  })

  // POST /api/v1/groups/:groupId/reject - Reject invitation
  router.post('/:groupId/reject', requireAuth, (req, res) => {
    try {
      groupService.rejectInvitation(req.params.groupId as string, req.clawId!)
      res.json(successResponse({ rejected: true }))
    } catch (err) {
      if (err instanceof GroupError) {
        res
          .status(groupErrorStatusMap[err.code] || 400)
          .json(errorResponse(err.code, err.message))
        return
      }
      throw err
    }
  })

  return router
}
