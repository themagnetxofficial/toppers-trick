import { useEffect, useState } from "react";
import { Link } from "wouter";
import { adminApi, BlogPost } from "@/lib/admin-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Edit, Trash2, Globe, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AdminBlogList() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    adminApi.getBlogPosts().then(setPosts).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: number, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await adminApi.deleteBlogPost(id);
      setPosts((prev) => prev.filter((p) => p.id !== id));
      toast({ title: "Post deleted" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleTogglePublish = async (post: BlogPost) => {
    const newStatus = post.status === "published" ? "draft" : "published";
    try {
      const updated = await adminApi.updateBlogPost(post.id, {
        slug: post.slug, title: post.title, status: newStatus,
        excerpt: post.excerpt ?? undefined, content: post.content ?? undefined,
        featuredImageUrl: post.featuredImageUrl ?? undefined,
        category: post.category ?? undefined,
        metaTitle: post.metaTitle ?? undefined,
        metaDescription: post.metaDescription ?? undefined,
      });
      setPosts((prev) => prev.map((p) => p.id === post.id ? updated : p));
      toast({ title: newStatus === "published" ? "Post published" : "Post unpublished" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const published = posts.filter(p => p.status === "published").length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-serif">Blog Posts</h1>
          <p className="text-muted-foreground text-sm">{posts.length} total · {published} published</p>
        </div>
        <Link href="/admin/blog/new">
          <Button className="gap-1.5 rounded-xl">
            <Plus className="h-4 w-4" /> New Post
          </Button>
        </Link>
      </div>

      <div className="space-y-2">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)
          : posts.length === 0
          ? (
            <div className="text-center py-16 space-y-3">
              <FileText className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-muted-foreground">No posts yet. Create your first blog post!</p>
              <Link href="/admin/blog/new">
                <Button variant="outline" className="gap-1 rounded-xl">
                  <Plus className="h-4 w-4" /> Write a post
                </Button>
              </Link>
            </div>
          )
          : posts.map((p) => (
              <div key={p.id} className="flex items-center gap-4 border border-border rounded-2xl px-5 py-4 bg-card hover:bg-muted/10 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{p.title}</span>
                    {p.category && (
                      <Badge variant="secondary" className="text-xs">{p.category}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    /{p.slug} · Updated {new Date(p.updatedAt).toLocaleDateString("en-IN")}
                    {p.publishedAt && ` · Published ${new Date(p.publishedAt).toLocaleDateString("en-IN")}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={p.status === "published" ? "default" : "secondary"} className="text-xs">
                    {p.status}
                  </Badge>
                  {p.status === "published" && (
                    <a href={`/blog/${p.slug}`} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="View live">
                        <Globe className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                  )}
                  <Button variant="outline" size="sm" className="h-7 text-xs"
                    onClick={() => handleTogglePublish(p)}>
                    {p.status === "published" ? "Unpublish" : "Publish"}
                  </Button>
                  <Link href={`/admin/blog/${p.id}/edit`}>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(p.id, p.title)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
      </div>
    </div>
  );
}
