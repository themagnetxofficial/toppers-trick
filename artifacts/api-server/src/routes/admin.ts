import { Router, IRouter } from "express";
import { eq, desc, and, gte, sql, ilike, or } from "drizzle-orm";
import {
  db,
  usersTable,
  analysesTable,
  paymentsTable,
  creditBatchesTable,
  tokenUsageLogsTable,
  blogPostsTable,
  contactSubmissionsTable,
} from "@workspace/db";
import { requireAdmin } from "../lib/adminAuth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Helper: normalises the db.execute result (which can be { rows: T[] } or T[] depending on drizzle version)
async function sq<T extends Record<string, unknown>>(query: ReturnType<typeof sql>): Promise<T[]> {
  const result = await db.execute(query);
  return ((result as any).rows ?? result) as T[];
}

// All admin routes require admin auth
router.use(requireAdmin);

// ─── Health check for frontend auth guard ─────────────────────────────────
router.get("/admin/check", (_req, res) => res.json({ ok: true }));

// ─── Dashboard Stats ─────────────────────────────────────────────────────
router.get("/admin/stats", async (_req, res): Promise<void> => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [userStats] = await sq<{ total: string; this_month: string; today: string }>(sql`
      SELECT
        count(*)::text as total,
        sum(case when created_at >= ${startOfMonth} then 1 else 0 end)::text as this_month,
        sum(case when created_at >= ${startOfToday} then 1 else 0 end)::text as today
      FROM users
    `);

    const [revenueStats] = await sq<{ total_paise: string; month_paise: string; today_paise: string }>(sql`
      SELECT
        coalesce(sum(amount), 0)::text as total_paise,
        coalesce(sum(case when created_at >= ${startOfMonth} then amount else 0 end), 0)::text as month_paise,
        coalesce(sum(case when created_at >= ${startOfToday} then amount else 0 end), 0)::text as today_paise
      FROM payments WHERE status = 'success'
    `);

    const [analysisStats] = await sq<{ total: string; this_month: string; today: string }>(sql`
      SELECT
        count(*)::text as total,
        sum(case when created_at >= ${startOfMonth} then 1 else 0 end)::text as this_month,
        sum(case when created_at >= ${startOfToday} then 1 else 0 end)::text as today
      FROM analyses
    `);

    const [tokenStats] = await sq<{ total_tokens: string; month_tokens: string }>(sql`
      SELECT
        coalesce(sum(input_tokens + output_tokens), 0)::text as total_tokens,
        coalesce(sum(case when created_at >= ${startOfMonth} then input_tokens + output_tokens else 0 end), 0)::text as month_tokens
      FROM token_usage_logs
    `);

    const [packStats] = await sq<{ starter: string; value_pack: string }>(sql`
      SELECT
        sum(case when amount in (6900, 8900) then 1 else 0 end)::text as starter,
        sum(case when amount in (12900, 16900) then 1 else 0 end)::text as value_pack
      FROM payments WHERE status = 'success'
    `);

    // Last 30 days chart data
    const signupsChart = await sq<{ day: string; count: string }>(sql`
      SELECT
        date_trunc('day', created_at)::date::text as day,
        count(*)::text as count
      FROM users
      WHERE created_at >= ${thirtyDaysAgo}
      GROUP BY day ORDER BY day
    `);

    const revenueChart = await sq<{ day: string; revenue_paise: string }>(sql`
      SELECT
        date_trunc('day', created_at)::date::text as day,
        coalesce(sum(amount), 0)::text as revenue_paise
      FROM payments
      WHERE status = 'success' AND created_at >= ${thirtyDaysAgo}
      GROUP BY day ORDER BY day
    `);

    // Merge chart data into a unified array (last 30 days)
    const chartMap = new Map<string, { signups: number; revenuePaise: number }>();
    for (let i = 0; i < 30; i++) {
      const d = new Date(thirtyDaysAgo.getTime() + i * 86400000);
      const key = d.toISOString().slice(0, 10);
      chartMap.set(key, { signups: 0, revenuePaise: 0 });
    }
    for (const row of signupsChart) {
      const entry = chartMap.get(row.day);
      if (entry) entry.signups = parseInt(row.count, 10);
    }
    for (const row of revenueChart) {
      const entry = chartMap.get(row.day);
      if (entry) entry.revenuePaise = parseInt(row.revenue_paise, 10);
    }
    const chart = Array.from(chartMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    const totalTokens = parseInt(tokenStats?.total_tokens ?? "0", 10);
    const monthTokens = parseInt(tokenStats?.month_tokens ?? "0", 10);

    res.json({
      users: {
        total: parseInt(userStats?.total ?? "0", 10),
        thisMonth: parseInt(userStats?.this_month ?? "0", 10),
        today: parseInt(userStats?.today ?? "0", 10),
      },
      revenue: {
        totalPaise: parseInt(revenueStats?.total_paise ?? "0", 10),
        thisMonthPaise: parseInt(revenueStats?.month_paise ?? "0", 10),
        todayPaise: parseInt(revenueStats?.today_paise ?? "0", 10),
      },
      analyses: {
        total: parseInt(analysisStats?.total ?? "0", 10),
        thisMonth: parseInt(analysisStats?.this_month ?? "0", 10),
        today: parseInt(analysisStats?.today ?? "0", 10),
      },
      tokens: {
        total: totalTokens,
        thisMonth: monthTokens,
        estimatedCostUsdCents: Math.round((totalTokens / 1_000_000) * 625),
      },
      packs: {
        starter: parseInt(packStats?.starter ?? "0", 10),
        value: parseInt(packStats?.value_pack ?? "0", 10),
      },
      chart,
    });
  } catch (err) {
    logger.error({ err }, "Admin stats error");
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// ─── Users ───────────────────────────────────────────────────────────────
router.get("/admin/users", async (req, res): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const pageSize = 25;
    const offset = (page - 1) * pageSize;
    const search = String(req.query.search ?? "").trim();

    const searchCondition = search
      ? or(ilike(usersTable.email, `%${search}%`), ilike(usersTable.name, `%${search}%`))
      : undefined;

    const users = await db
      .select()
      .from(usersTable)
      .where(searchCondition)
      .orderBy(desc(usersTable.createdAt))
      .limit(pageSize)
      .offset(offset);

    const [countRow] = await sq<{ total: string }>(
      search
        ? sql`SELECT count(*)::text as total FROM users WHERE email ILIKE ${"%" + search + "%"} OR name ILIKE ${"%" + search + "%"}`
        : sql`SELECT count(*)::text as total FROM users`
    );

    const enriched = await Promise.all(
      users.map(async (u) => {
        const [creditRow] = await sq<{ remaining: string }>(sql`
          SELECT coalesce(sum(credits_remaining), 0)::text as remaining
          FROM credit_batches
          WHERE user_id = ${u.id}
            AND credits_remaining > 0
            AND (expires_at IS NULL OR expires_at > now())
        `);
        const [spendRow] = await sq<{ total: string }>(sql`
          SELECT coalesce(sum(amount), 0)::text as total
          FROM payments WHERE user_id = ${u.id} AND status = 'success'
        `);
        const [analysesRow] = await sq<{ cnt: string }>(sql`
          SELECT count(*)::text as cnt FROM analyses WHERE user_id = ${u.id}
        `);
        return {
          ...u,
          creditsRemaining: parseInt(creditRow?.remaining ?? "0", 10),
          totalSpentPaise: parseInt(spendRow?.total ?? "0", 10),
          analysesCount: parseInt(analysesRow?.cnt ?? "0", 10),
        };
      })
    );

    res.json({
      users: enriched,
      total: parseInt(countRow?.total ?? "0", 10),
      page,
      pageSize,
    });
  } catch (err) {
    logger.error({ err }, "Admin users list error");
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.get("/admin/users/:id", async (req, res): Promise<void> => {
  try {
    const userId = parseInt(req.params.id, 10);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const [batches, payments, analyses] = await Promise.all([
      db.select().from(creditBatchesTable).where(eq(creditBatchesTable.userId, userId)).orderBy(desc(creditBatchesTable.purchasedAt)),
      db.select().from(paymentsTable).where(eq(paymentsTable.userId, userId)).orderBy(desc(paymentsTable.createdAt)),
      db.select().from(analysesTable).where(eq(analysesTable.userId, userId)).orderBy(desc(analysesTable.createdAt)).limit(50),
    ]);

    res.json({ user, batches, payments, analyses });
  } catch (err) {
    logger.error({ err }, "Admin user detail error");
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

router.post("/admin/users/:id/credits", async (req, res): Promise<void> => {
  try {
    const userId = parseInt(req.params.id, 10);
    const amount = parseInt(req.body.amount, 10);
    if (!amount || amount < 1 || amount > 100) {
      res.status(400).json({ error: "Amount must be 1-100" }); return;
    }
    await db.insert(creditBatchesTable).values({
      userId, creditsTotal: amount, creditsRemaining: amount, isPaid: false, expiresAt: null,
    });
    logger.info({ userId, amount }, "Admin manually added credits");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Admin add credits error");
    res.status(500).json({ error: "Failed to add credits" });
  }
});

router.post("/admin/users/:id/suspend", async (req, res): Promise<void> => {
  try {
    const userId = parseInt(req.params.id, 10);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    await db.update(usersTable).set({ isSuspended: !user.isSuspended }).where(eq(usersTable.id, userId));
    res.json({ isSuspended: !user.isSuspended });
  } catch (err) {
    logger.error({ err }, "Admin suspend user error");
    res.status(500).json({ error: "Failed to update user" });
  }
});

router.post("/admin/users/:id/admin", async (req, res): Promise<void> => {
  try {
    const userId = parseInt(req.params.id, 10);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    await db.update(usersTable).set({ isAdmin: !user.isAdmin }).where(eq(usersTable.id, userId));
    res.json({ isAdmin: !user.isAdmin });
  } catch (err) {
    logger.error({ err }, "Admin toggle admin error");
    res.status(500).json({ error: "Failed to update user" });
  }
});

// ─── Payments ────────────────────────────────────────────────────────────
router.get("/admin/payments", async (req, res): Promise<void> => {
  try {
    const status = req.query.status ? String(req.query.status) : undefined;
    const fromRaw = req.query.from ? new Date(String(req.query.from)) : undefined;
    const toRaw = req.query.to ? new Date(String(req.query.to)) : undefined;
    const from = fromRaw && !isNaN(fromRaw.getTime()) ? fromRaw : undefined;
    const to = toRaw && !isNaN(toRaw.getTime()) ? toRaw : undefined;

    const conditions = [];
    if (status && status !== "all") conditions.push(eq(paymentsTable.status, status));
    if (from) conditions.push(gte(paymentsTable.createdAt, from));
    if (to) {
      const toEnd = new Date(to);
      toEnd.setDate(toEnd.getDate() + 1);
      conditions.push(sql`${paymentsTable.createdAt} < ${toEnd}`);
    }

    const payments = await db
      .select({ payment: paymentsTable, userEmail: usersTable.email, userName: usersTable.name })
      .from(paymentsTable)
      .leftJoin(usersTable, eq(paymentsTable.userId, usersTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(paymentsTable.createdAt))
      .limit(500);

    res.json(payments.map((r) => ({ ...r.payment, userEmail: r.userEmail, userName: r.userName })));
  } catch (err) {
    logger.error({ err }, "Admin payments error");
    res.status(500).json({ error: "Failed to fetch payments" });
  }
});

// ─── Analyses ────────────────────────────────────────────────────────────
router.get("/admin/analyses", async (req, res): Promise<void> => {
  try {
    const status = req.query.status ? String(req.query.status) : undefined;

    const rows = await db
      .select({
        analysis: {
          id: analysesTable.id, subject: analysesTable.subject, category: analysesTable.category,
          status: analysesTable.status, createdAt: analysesTable.createdAt, errorMessage: analysesTable.errorMessage,
        },
        userEmail: usersTable.email, userName: usersTable.name, userId: usersTable.id,
      })
      .from(analysesTable)
      .leftJoin(usersTable, eq(analysesTable.userId, usersTable.id))
      .where(status && status !== "all" ? eq(analysesTable.status, status) : undefined)
      .orderBy(desc(analysesTable.createdAt))
      .limit(500);

    const enriched = await Promise.all(rows.map(async (r) => {
      const [tokens] = await sq<{ total: string }>(sql`
        SELECT coalesce(sum(input_tokens + output_tokens), 0)::text as total
        FROM token_usage_logs WHERE analysis_id = ${r.analysis.id}
      `);
      return {
        ...r.analysis, userEmail: r.userEmail, userName: r.userName, userId: r.userId,
        tokensUsed: parseInt(tokens?.total ?? "0", 10),
      };
    }));

    res.json(enriched);
  } catch (err) {
    logger.error({ err }, "Admin analyses list error");
    res.status(500).json({ error: "Failed to fetch analyses" });
  }
});

router.get("/admin/analyses/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const [analysis] = await db.select().from(analysesTable).where(eq(analysesTable.id, id));
    if (!analysis) { res.status(404).json({ error: "Not found" }); return; }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, analysis.userId));
    const tokens = await db.select().from(tokenUsageLogsTable).where(eq(tokenUsageLogsTable.analysisId, id));
    res.json({ analysis, user, tokens });
  } catch (err) {
    logger.error({ err }, "Admin analysis detail error");
    res.status(500).json({ error: "Failed to fetch analysis" });
  }
});

// ─── Contact Submissions ──────────────────────────────────────────────────
router.get("/admin/contact", async (_req, res): Promise<void> => {
  try {
    const submissions = await db.select().from(contactSubmissionsTable).orderBy(desc(contactSubmissionsTable.createdAt));
    res.json(submissions);
  } catch (err) {
    logger.error({ err }, "Admin contact list error");
    res.status(500).json({ error: "Failed to fetch submissions" });
  }
});

router.patch("/admin/contact/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status } = req.body;
    if (!["pending", "resolved"].includes(status)) {
      res.status(400).json({ error: "Invalid status" }); return;
    }
    await db.update(contactSubmissionsTable).set({ status }).where(eq(contactSubmissionsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Admin contact update error");
    res.status(500).json({ error: "Failed to update" });
  }
});

// ─── Blog Management ──────────────────────────────────────────────────────
router.get("/admin/blog", async (_req, res): Promise<void> => {
  try {
    const posts = await db.select({
      id: blogPostsTable.id, slug: blogPostsTable.slug, title: blogPostsTable.title,
      status: blogPostsTable.status, category: blogPostsTable.category,
      publishedAt: blogPostsTable.publishedAt, createdAt: blogPostsTable.createdAt,
      updatedAt: blogPostsTable.updatedAt,
    }).from(blogPostsTable).orderBy(desc(blogPostsTable.updatedAt));
    res.json(posts);
  } catch (err) {
    logger.error({ err }, "Admin blog list error");
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

router.get("/admin/blog/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const [post] = await db.select().from(blogPostsTable).where(eq(blogPostsTable.id, id));
    if (!post) { res.status(404).json({ error: "Not found" }); return; }
    res.json(post);
  } catch (err) {
    logger.error({ err }, "Admin blog get error");
    res.status(500).json({ error: "Failed to fetch post" });
  }
});

router.post("/admin/blog", async (req, res): Promise<void> => {
  try {
    const { slug, title, excerpt, content, featuredImageUrl, category, metaTitle, metaDescription, status, publishedAt } = req.body;
    if (!title?.trim() || !slug?.trim()) {
      res.status(400).json({ error: "Title and slug are required" }); return;
    }
    const [post] = await db.insert(blogPostsTable).values({
      slug: slug.trim(), title: title.trim(),
      excerpt: excerpt?.trim() ?? null, content: content ?? null,
      featuredImageUrl: featuredImageUrl?.trim() ?? null, category: category?.trim() ?? null,
      metaTitle: metaTitle?.trim() ?? null, metaDescription: metaDescription?.trim() ?? null,
      status: status ?? "draft",
      publishedAt: status === "published" ? (publishedAt ? new Date(publishedAt) : new Date()) : null,
    }).returning();
    res.status(201).json(post);
  } catch (err: any) {
    if (err?.message?.includes("unique")) { res.status(409).json({ error: "Slug already exists" }); return; }
    logger.error({ err }, "Admin blog create error");
    res.status(500).json({ error: "Failed to create post" });
  }
});

router.put("/admin/blog/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const { slug, title, excerpt, content, featuredImageUrl, category, metaTitle, metaDescription, status, publishedAt } = req.body;
    const [existing] = await db.select().from(blogPostsTable).where(eq(blogPostsTable.id, id));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    const wasPublished = existing.status === "published";
    const nowPublishing = status === "published";
    const [post] = await db.update(blogPostsTable).set({
      slug: slug?.trim() ?? existing.slug, title: title?.trim() ?? existing.title,
      excerpt: excerpt?.trim() ?? existing.excerpt, content: content ?? existing.content,
      featuredImageUrl: featuredImageUrl?.trim() ?? existing.featuredImageUrl,
      category: category?.trim() ?? existing.category,
      metaTitle: metaTitle?.trim() ?? existing.metaTitle,
      metaDescription: metaDescription?.trim() ?? existing.metaDescription,
      status: status ?? existing.status,
      publishedAt: nowPublishing && !wasPublished
        ? (publishedAt ? new Date(publishedAt) : new Date()) : existing.publishedAt,
      updatedAt: new Date(),
    }).where(eq(blogPostsTable.id, id)).returning();
    res.json(post);
  } catch (err: any) {
    if (err?.message?.includes("unique")) { res.status(409).json({ error: "Slug already exists" }); return; }
    logger.error({ err }, "Admin blog update error");
    res.status(500).json({ error: "Failed to update post" });
  }
});

router.delete("/admin/blog/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.delete(blogPostsTable).where(eq(blogPostsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Admin blog delete error");
    res.status(500).json({ error: "Failed to delete post" });
  }
});

export default router;
