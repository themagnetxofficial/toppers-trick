import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { PublicLayout } from "@/components/layout/public-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, ArrowLeft, BookOpen, ArrowRight } from "lucide-react";
import DOMPurify from "dompurify";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface PostFull {
  id: number; slug: string; title: string; excerpt: string | null;
  content: string | null; featuredImageUrl: string | null; category: string | null;
  metaTitle: string | null; metaDescription: string | null; publishedAt: string | null;
}
interface Related {
  id: number; slug: string; title: string; excerpt: string | null;
  featuredImageUrl: string | null; publishedAt: string | null;
}

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<PostFull | null>(null);
  const [related, setRelated] = useState<Related[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    fetch(`${BASE}/api/blog/${slug}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        setPost(data.post);
        setRelated(data.related ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [slug]);

  if (notFound) {
    return (
      <PublicLayout>
        <div className="max-w-2xl mx-auto px-6 py-32 text-center space-y-4">
          <h1 className="text-3xl font-bold font-serif">Post not found</h1>
          <p className="text-muted-foreground">This article may have been removed or never existed.</p>
          <Link href="/blog"><Button variant="outline" className="rounded-xl gap-1"><ArrowLeft className="h-4 w-4" /> Back to Blog</Button></Link>
        </div>
      </PublicLayout>
    );
  }

  if (loading || !post) {
    return (
      <PublicLayout>
        <div className="max-w-3xl mx-auto px-6 py-16 space-y-6">
          <Skeleton className="h-10 w-3/4 rounded-xl" />
          <Skeleton className="h-5 w-1/2 rounded-xl" />
          <Skeleton className="h-64 rounded-2xl" />
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-4 rounded" />)}
          </div>
        </div>
      </PublicLayout>
    );
  }

  const cleanHtml = DOMPurify.sanitize(post.content ?? "");
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <PublicLayout>
      <Helmet>
        <title>{post.metaTitle ?? post.title} | Smart Study Blog</title>
        <meta name="description" content={post.metaDescription ?? post.excerpt ?? ""} />
        <meta property="og:title" content={post.metaTitle ?? post.title} />
        <meta property="og:description" content={post.metaDescription ?? post.excerpt ?? ""} />
        <meta property="og:type" content="article" />
        {post.featuredImageUrl && <meta property="og:image" content={post.featuredImageUrl} />}
        <link rel="canonical" href={`${origin}/blog/${post.slug}`} />
      </Helmet>

      <article className="max-w-3xl mx-auto px-6 py-16">
        {/* Back nav */}
        <Link href="/blog" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
          <ArrowLeft className="h-4 w-4" /> All posts
        </Link>

        {/* Meta */}
        <div className="space-y-4 mb-8">
          {post.category && <Badge variant="secondary">{post.category}</Badge>}
          <h1 className="text-3xl sm:text-4xl font-bold font-serif leading-tight">{post.title}</h1>
          {post.publishedAt && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              {new Date(post.publishedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
            </div>
          )}
          {post.excerpt && <p className="text-lg text-muted-foreground leading-relaxed">{post.excerpt}</p>}
        </div>

        {/* Featured image */}
        {post.featuredImageUrl && (
          <div className="mb-10 rounded-2xl overflow-hidden">
            <img src={post.featuredImageUrl} alt={post.title} className="w-full max-h-80 object-cover" />
          </div>
        )}

        {/* Content */}
        <style>{`
          .blog-article h2 { font-size: 1.6rem; font-weight: 700; font-family: serif; margin: 2rem 0 0.8rem; color: hsl(20 25% 15%); }
          .blog-article h3 { font-size: 1.25rem; font-weight: 600; margin: 1.5rem 0 0.6rem; color: hsl(20 25% 15%); }
          .blog-article p { margin: 1rem 0; line-height: 1.8; color: hsl(20 15% 30%); }
          .blog-article ul { list-style-type: disc; padding-left: 1.5rem; margin: 1rem 0; }
          .blog-article ol { list-style-type: decimal; padding-left: 1.5rem; margin: 1rem 0; }
          .blog-article li { margin: 0.4rem 0; line-height: 1.7; color: hsl(20 15% 30%); }
          .blog-article a { color: hsl(32 95% 45%); text-decoration: underline; text-underline-offset: 3px; }
          .blog-article strong { font-weight: 700; color: hsl(20 25% 15%); }
          .blog-article em { font-style: italic; }
          .blog-article img { max-width: 100%; border-radius: 0.75rem; margin: 1.5rem 0; }
          .blog-article blockquote { border-left: 3px solid hsl(32 95% 55%); padding-left: 1rem; margin: 1.5rem 0; color: hsl(30 15% 45%); font-style: italic; }
        `}</style>
        <div className="blog-article" dangerouslySetInnerHTML={{ __html: cleanHtml }} />

        {/* CTA */}
        <div className="mt-16 rounded-2xl bg-primary/5 border border-primary/20 p-8 text-center space-y-4">
          <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto">
            <BookOpen className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-xl font-bold font-serif">Analyze your own question papers</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Upload your previous-year papers and get AI-powered topic priorities, Hinglish study notes, and a downloadable PDF guide.
          </p>
          <Link href="/sign-up">
            <Button className="rounded-xl gap-1.5 mt-2">
              Try Smart Study Free <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        {/* Related posts */}
        {related.length > 0 && (
          <div className="mt-16 space-y-5">
            <h2 className="text-xl font-bold font-serif">Related Posts</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              {related.map((r) => (
                <Link key={r.id} href={`/blog/${r.slug}`}>
                  <div className="border border-border rounded-2xl p-4 bg-card hover:border-primary/30 hover:shadow-sm transition-all group">
                    {r.featuredImageUrl && (
                      <img src={r.featuredImageUrl} alt={r.title} className="w-full h-28 object-cover rounded-xl mb-3" />
                    )}
                    <h3 className="font-semibold text-sm leading-snug group-hover:text-primary transition-colors">{r.title}</h3>
                    {r.publishedAt && (
                      <p className="text-xs text-muted-foreground mt-1.5">
                        {new Date(r.publishedAt).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </article>
    </PublicLayout>
  );
}
