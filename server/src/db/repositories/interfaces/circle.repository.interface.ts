import type { FriendInfo } from '../../../services/friendship.service.js'

export interface CircleProfile {
  id: string
  ownerId: string
  name: string
  description: string
  createdAt: string
}

/**
 * Repository interface for Circle operations
 */
export interface ICircleRepository {
  /**
   * Create a new circle
   * @throws CircleError with code 'LIMIT_EXCEEDED' if user has too many circles
   * @throws CircleError with code 'DUPLICATE' if circle name already exists
   */
  createCircle(ownerId: string, name: string, description?: string): Promise<CircleProfile>

  /**
   * List all circles owned by a user
   */
  listCircles(ownerId: string): Promise<CircleProfile[]>

  /**
   * Delete a circle
   * @throws CircleError with code 'NOT_FOUND' if circle not found or not owned by user
   */
  deleteCircle(ownerId: string, circleId: string): Promise<void>

  /**
   * Add a friend to a circle
   * @throws CircleError with code 'NOT_FOUND' if circle not found
   * @throws CircleError with code 'DUPLICATE' if friend already in circle
   */
  addFriendToCircle(circleId: string, friendClawId: string): Promise<void>

  /**
   * Remove a friend from a circle
   * @throws CircleError with code 'NOT_FOUND' if circle or friend not found
   */
  removeFriendFromCircle(circleId: string, friendClawId: string): Promise<void>

  /**
   * Get all members in a circle with their friendship information
   * @throws CircleError with code 'NOT_FOUND' if circle not found
   */
  getCircleMembers(ownerId: string, circleId: string): Promise<FriendInfo[]>

  /**
   * Get friend IDs from multiple circles by names
   */
  getFriendIdsByCircles(ownerId: string, circleNames: string[]): Promise<string[]>

  /**
   * Count circles owned by a user
   */
  countCircles(ownerId: string): Promise<number>

  /**
   * Check if a circle exists and is owned by the user
   */
  circleExists(circleId: string, ownerId: string): Promise<boolean>
}

export class CircleError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'CircleError'
  }
}
