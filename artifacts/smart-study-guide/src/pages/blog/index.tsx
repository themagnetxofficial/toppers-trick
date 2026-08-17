import { useEffect, useState } from "react";
import { Link } from "wouter";
import { PublicLayout } from "@/components/layout/public-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, ChevronLeft, ChevronRight, BookOpen } from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface BlogCard {
  id: number; slug: string; title: string; excerpt: string | null;
  featuredImageUrl: string | null; category: string | null; publishedAt: string | null;
}

export default function BlogListingPage() {
  const [posts, setPosts] = useState<BlogCard[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const pageSize = 12;

  useEffect(() => {
    setLoading(true);
    fetch(`${BASE}/api/blog?page=${page}`)
      .then((r) => r.json())
      .then((data) => { setPosts(data.posts ?? []); setTotal(data.total ?? 0); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <PublicLayout>
      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="space-y-3 mb-12">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Blog</p>
          <h1 className="text-4xl font-bold font-serif">Study Smart</h1>
          <p className="text-muted-foreground text-lg max-w-xl">
            Tips, topic guides, and exam strategies for Indian students — from board exams to university finals.
          </p>
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-24 space-y-4">
            <BookOpen className="h-12 w-12 text-muted-foreground mx-auto" />
            <h2 className="text-xl font-bold font-serif">No posts yet</h2>
            <p className="text-muted-foreground">We're working on it — check back soon!</p>
          </div>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {posts.map((post) => (
                <Link key={post.id} href={`/blog/${post.slug}`}>
                  <article className="group border border-border rounded-2xl overflow-hidden bg-card hover:shadow-md hover:border-primary/30 transition-all duration-200 h-full flex flex-col">
                    {post.featuredImageUrl ? (
                      <div className="h-44 overflow-hidden bg-muted">
                        <img
                          src={post.featuredImageUrl}
                          alt={post.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      </div>
                    ) : (
                      <div className="h-44 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                        <BookOpen className="h-10 w-10 text-primary/30" />
                      </div>
                    )}
                    <div className="p-5 flex flex-col flex-1">
                      {post.category && (
                        <Badge variant="secondary" className="text-xs w-fit mb-3">{post.category}</Badge>
                      )}
                      <h2 className="font-bold font-serif text-base leading-snug group-hover:text-primary transition-colors flex-1">
                        {post.title}
                      </h2>
                      {post.excerpt && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{post.excerpt}</p>
                      )}
                      {post.publishedAt && (
                        <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {new Date(post.publishedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </div>
                      )}
                    </div>
                  </article>
                </Link>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-10">
                <Button variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="rounded-xl">
                  <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
                <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
                <Button variant="outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="rounded-xl">
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </PublicLayout>
  );
}
