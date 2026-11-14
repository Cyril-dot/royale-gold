// Shared error type for auth/permission failures. Kept in its own
// module with NO imports so client components can import it (via
// src/lib/rbac.ts) without pulling the server-only Prisma/pg chain
// into the browser bundle — importing it from src/lib/auth.ts does
// exactly that and breaks the build.
export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
