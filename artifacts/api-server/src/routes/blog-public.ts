import { Router, IRouter } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
import { db, blogPostsTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Helper: normalises the db.execute result
async function sq<T extends Record<string, unknown>>(query: ReturnType<typeof sql>): Promise<T[]> {
  const result = await db.execute(query);
  return ((result as any).rows ?? result) as T[];
}

// GET /blog — published posts listing
router.get("/blog", async (req, res): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const pageSize = 12;
    const offset = (page - 1) * pageSize;
    const category = req.query.category ? String(req.query.category) : undefined;

    const whereClause = category
      ? and(eq(blogPostsTable.status, "published"), eq(blogPostsTable.category, category))
      : eq(blogPostsTable.status, "published");

    const [posts, countRows] = await Promise.all([
      db.select({
        id: blogPostsTable.id, slug: blogPostsTable.slug, title: blogPostsTable.title,
        excerpt: blogPostsTable.excerpt, featuredImageUrl: blogPostsTable.featuredImageUrl,
        category: blogPostsTable.category, publishedAt: blogPostsTable.publishedAt,
      })
        .from(blogPostsTable)
        .where(whereClause)
        .orderBy(desc(blogPostsTable.publishedAt))
        .limit(pageSize)
        .offset(offset),
      sq<{ total: string }>(
        category
          ? sql`SELECT count(*)::text as total FROM blog_posts WHERE status = 'published' AND category = ${category}`
          : sql`SELECT count(*)::text as total FROM blog_posts WHERE status = 'published'`
      ),
    ]);

    const total = parseInt(countRows[0]?.total ?? "0", 10);
    res.json({ posts, total, page, pageSize });
  } catch (err) {
    logger.error({ err }, "Blog listing error");
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

// GET /blog/sitemap — list of published posts
router.get("/blog/sitemap", async (_req, res): Promise<void> => {
  try {
    const posts = await db.select({
      slug: blogPostsTable.slug, updatedAt: blogPostsTable.updatedAt,
    }).from(blogPostsTable).where(eq(blogPostsTable.status, "published"));
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: "Failed" });
  }
});

// GET /blog/:slug — single published post
router.get("/blog/:slug", async (req, res): Promise<void> => {
  try {
    const [post] = await db
      .select()
      .from(blogPostsTable)
      .where(and(eq(blogPostsTable.slug, req.params.slug), eq(blogPostsTable.status, "published")));

    if (!post) { res.status(404).json({ error: "Post not found" }); return; }

    const related = await db.select({
      id: blogPostsTable.id, slug: blogPostsTable.slug, title: blogPostsTable.title,
      excerpt: blogPostsTable.excerpt, featuredImageUrl: blogPostsTable.featuredImageUrl,
      publishedAt: blogPostsTable.publishedAt,
    })
      .from(blogPostsTable)
      .where(
        and(
          eq(blogPostsTable.status, "published"),
          post.category ? eq(blogPostsTable.category, post.category) : undefined,
          sql`${blogPostsTable.id} != ${post.id}`,
        )
      )
      .orderBy(desc(blogPostsTable.publishedAt))
      .limit(3);

    res.json({ post, related });
  } catch (err) {
    logger.error({ err }, "Blog post error");
    res.status(500).json({ error: "Failed to fetch post" });
  }
});

export default router;
