/**
 * AES-256-GCM encryption/decryption for credential payloads.
 *
 * Runs entirely in Node.js — plaintext NEVER touches the database tier
 * (avoids pgcrypto RPC where plaintext could appear in SQL statement logs).
 *
 * Format: base64( iv[12] + authTag[16] + ciphertext )
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12   // 96-bit IV recommended for GCM
const TAG_LENGTH = 16  // 128-bit auth tag

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * @param plaintext - The JSON string to encrypt
 * @param keyHex   - 64-char hex string (32 bytes = 256-bit key)
 */
export function encryptCredentialPayload(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex')
  if (key.length !== 32) throw new Error('Encryption key must be 32 bytes (64 hex chars)')

  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  // iv (12) + authTag (16) + ciphertext → base64
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

/**
 * Decrypt a base64-encoded AES-256-GCM ciphertext.
 * Throws if tampered (auth tag mismatch) or key is wrong.
 */
export function decryptCredentialPayload(encryptedBase64: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex')
  if (key.length !== 32) throw new Error('Encryption key must be 32 bytes (64 hex chars)')

  const combined = Buffer.from(encryptedBase64, 'base64')
  if (combined.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error('Invalid ciphertext: too short')
  }

  const iv = combined.subarray(0, IV_LENGTH)
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const ciphertext = combined.subarray(IV_LENGTH + TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  decipher.setAuthTag(authTag)

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8')
}
