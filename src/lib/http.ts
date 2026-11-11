import { NextResponse } from "next/server";
import { AuthError } from "./auth";

export function ok(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** Turn thrown AuthError / unexpected errors into JSON responses. */
export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof AuthError) return fail(err.message, err.status);
  console.error(err);
  return fail("Internal server error", 500);
}

export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
