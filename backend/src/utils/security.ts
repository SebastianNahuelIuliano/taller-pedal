
import {
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import jwt from "jsonwebtoken";
import type { UserRole } from "../types/auth.js";

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);

  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const [saltHex, keyHex] = storedHash.split(":");

  if (!saltHex || !keyHex) {
    return false;
  }

  try {
    const salt = Buffer.from(saltHex, "hex");
    const storedKey = Buffer.from(keyHex, "hex");

    if (salt.length !== 16 || storedKey.length !== 64) {
      return false;
    }

    const suppliedKey = await deriveKey(password, salt);

    return timingSafeEqual(storedKey, suppliedKey);
  } catch {
    return false;
  }
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error(
      "JWT_SECRET debe estar configurado y tener al menos 32 bytes"
    );
  }

  return secret;
}

export function createAccessToken(
  userId: string,
  role: UserRole
): string {
  return jwt.sign(
    { role },
    getJwtSecret(),
    {
      subject: userId,
      expiresIn: "8h",
    }
  );
}

export function verifyAccessToken(token: string): jwt.JwtPayload {
  const decoded = jwt.verify(token, getJwtSecret());

  if (typeof decoded === "string") {
    throw new Error("Token inválido");
  }

  return decoded;
}
