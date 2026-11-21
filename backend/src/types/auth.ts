
export type UserRole =
  | "CLIENTE"
  | "MECANICO"
  | "ADMINISTRADOR";

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
}

export function isUserRole(value: unknown): value is UserRole {
  return (
    value === "CLIENTE" ||
    value === "MECANICO" ||
    value === "ADMINISTRADOR"
  );
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
