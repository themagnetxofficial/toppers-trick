const BASE_PATH = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const API = `${BASE_PATH}/api`;

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw Object.assign(new Error(msg), { status: res.status });
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Types ────────────────────────────────────────────────────────────────

export interface AdminStats {
  users: { total: number; thisMonth: number; today: number };
  revenue: { totalPaise: number; thisMonthPaise: number; todayPaise: number };
  analyses: { total: number; thisMonth: number; today: number };
  tokens: { total: number; thisMonth: number; estimatedCostUsdCents: number };
  packs: { starter: number; value: number };
  chart: { date: string; signups: number; revenuePaise: number }[];
}

export interface AdminUser {
  id: number; clerkUserId: string; name: string | null; email: string | null;
  isAdmin: boolean; isSuspended: boolean; createdAt: string;
  creditsRemaining: number; totalSpentPaise: number; analysesCount: number;
}

export interface AdminUserDetail {
  user: { id: number; clerkUserId: string; name: string | null; email: string | null; isAdmin: boolean; isSuspended: boolean; createdAt: string };
  batches: { id: number; creditsTotal: number; creditsRemaining: number; isPaid: boolean; purchasedAt: string; expiresAt: string | null }[];
  payments: { id: number; amount: number; packageName: string | null; razorpayPaymentId: string | null; status: string; createdAt: string }[];
  analyses: { id: number; subject: string; category: string; status: string; createdAt: string }[];
}

export interface AdminPayment {
  id: number; userId: number; amount: number; packageName: string | null;
  razorpayOrderId: string | null; razorpayPaymentId: string | null;
  status: string; createdAt: string; userEmail: string | null; userName: string | null;
}

export interface AdminAnalysis {
  id: number; userId: number | null; subject: string; category: string;
  status: string; createdAt: string; errorMessage: string | null;
  userEmail: string | null; userName: string | null; tokensUsed: number;
}

export interface AdminAnalysisDetail {
  analysis: { id: number; subject: string; category: string; status: string; aiResponseJson: unknown; createdAt: string; errorMessage: string | null };
  user: { id: number; email: string | null; name: string | null } | null;
  tokens: { inputTokens: number; outputTokens: number; estimatedCost: string | null; createdAt: string }[];
}

export interface ContactSubmission {
  id: number; name: string; email: string; subject: string;
  message: string; status: string; createdAt: string;
}

export interface BlogPost {
  id: number; slug: string; title: string; excerpt: string | null;
  content: string | null; featuredImageUrl: string | null; category: string | null;
  metaTitle: string | null; metaDescription: string | null;
  status: string; publishedAt: string | null; createdAt: string; updatedAt: string;
}

export interface BlogPostInput {
  slug: string; title: string; excerpt?: string; content?: string;
  featuredImageUrl?: string; category?: string; metaTitle?: string;
  metaDescription?: string; status: "draft" | "published"; publishedAt?: string;
}

// ── API calls ────────────────────────────────────────────────────────────

export const adminApi = {
  check: () => adminFetch<{ ok: boolean }>("/admin/check"),

  // Stats
  getStats: () => adminFetch<AdminStats>("/admin/stats"),

  // Users
  getUsers: (page = 1, search = "") =>
    adminFetch<{ users: AdminUser[]; total: number; page: number; pageSize: number }>(
      `/admin/users?page=${page}&search=${encodeURIComponent(search)}`
    ),
  getUserDetail: (id: number) => adminFetch<AdminUserDetail>(`/admin/users/${id}`),
  addCredits: (id: number, amount: number) =>
    adminFetch<{ ok: boolean }>(`/admin/users/${id}/credits`, {
      method: "POST", body: JSON.stringify({ amount }),
    }),
  toggleSuspend: (id: number) =>
    adminFetch<{ isSuspended: boolean }>(`/admin/users/${id}/suspend`, { method: "POST" }),
  toggleAdmin: (id: number) =>
    adminFetch<{ isAdmin: boolean }>(`/admin/users/${id}/admin`, { method: "POST" }),

  // Payments
  getPayments: (params?: { status?: string; from?: string; to?: string }) =>
    adminFetch<AdminPayment[]>(`/admin/payments?${new URLSearchParams(params as Record<string, string>)}`),

  // Analyses
  getAnalyses: (status?: string) =>
    adminFetch<AdminAnalysis[]>(`/admin/analyses${status && status !== "all" ? `?status=${status}` : ""}`),
  getAnalysisDetail: (id: number) => adminFetch<AdminAnalysisDetail>(`/admin/analyses/${id}`),

  // Contact
  getContact: () => adminFetch<ContactSubmission[]>("/admin/contact"),
  updateContactStatus: (id: number, status: string) =>
    adminFetch<{ ok: boolean }>(`/admin/contact/${id}`, {
      method: "PATCH", body: JSON.stringify({ status }),
    }),

  // Blog
  getBlogPosts: () => adminFetch<BlogPost[]>("/admin/blog"),
  getBlogPost: (id: number) => adminFetch<BlogPost>(`/admin/blog/${id}`),
  createBlogPost: (data: BlogPostInput) =>
    adminFetch<BlogPost>("/admin/blog", { method: "POST", body: JSON.stringify(data) }),
  updateBlogPost: (id: number, data: BlogPostInput) =>
    adminFetch<BlogPost>(`/admin/blog/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteBlogPost: (id: number) =>
    adminFetch<{ ok: boolean }>(`/admin/blog/${id}`, { method: "DELETE" }),
};
