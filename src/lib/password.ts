/**
 * Password hashing + policy for Overseer named accounts.
 * bcryptjs (pure-JS, no native build — safe on Railway), cost factor 12.
 */

import bcrypt from 'bcryptjs'

const COST = 12
const MIN_LENGTH = 12

export class PasswordPolicyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PasswordPolicyError'
  }
}

/** Throws PasswordPolicyError if the password is too weak. */
export function assertPasswordStrength(plain: string): void {
  if (!plain || plain.length < MIN_LENGTH) {
    throw new PasswordPolicyError(`Password must be at least ${MIN_LENGTH} characters`)
  }
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash)
  } catch {
    return false
  }
}

/**
 * A real bcrypt hash to compare against when a username isn't found, so login
 * timing doesn't leak whether an account exists. Computed once at startup.
 */
export const DUMMY_HASH = bcrypt.hashSync('overseer-timing-equalizer', COST)
