// P2 Batch 2 (O30): the public CMS read — one page by slug, active
// only. 404 when the page is inactive or missing. No auth required.
//
// MUST stay dynamic (await connection() below): without it Next bakes
// the response at build time (○ static) and CMS edits never reach the
// public page until a rebuild. (export const dynamic is incompatible
// with this repo's cacheComponents setting.)
import { connection } from "next/server";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { getPublicCmsPage } from "@/lib/cms";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  await connection();
  try {
    const { slug } = await params;
    const page = await getPublicCmsPage(slug.toLowerCase());
    if (!page) return fail("Page not found", 404);
    return ok({ page });
  } catch (err) {
    return toErrorResponse(err);
  }
}
