import { useEffect, useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { adminApi, BlogPostInput } from "@/lib/admin-api";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Save, Globe, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function AdminBlogEditor() {
  const params = useParams<{ id?: string }>();
  const editId = params.id ? parseInt(params.id, 10) : undefined;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const isCreate = !editId;

  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);
  const [slugManual, setSlugManual] = useState(false);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [featuredImageUrl, setFeaturedImageUrl] = useState("");
  const [category, setCategory] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");

  // Load existing post for edit mode
  useEffect(() => {
    if (!editId) return;
    adminApi.getBlogPost(editId)
      .then((p) => {
        setTitle(p.title);
        setSlug(p.slug);
        setExcerpt(p.excerpt ?? "");
        setContent(p.content ?? "");
        setFeaturedImageUrl(p.featuredImageUrl ?? "");
        setCategory(p.category ?? "");
        setMetaTitle(p.metaTitle ?? "");
        setMetaDescription(p.metaDescription ?? "");
        setStatus(p.status as "draft" | "published");
        setSlugManual(true); // don't auto-override slug in edit mode
      })
      .catch(() => toast({ title: "Failed to load post", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [editId]);

  // Auto-generate slug from title in create mode
  useEffect(() => {
    if (!slugManual && isCreate) {
      setSlug(slugify(title));
    }
  }, [title, slugManual, isCreate]);

  const handleSave = async (publishNow?: boolean) => {
    if (!title.trim()) { toast({ title: "Title is required", variant: "destructive" }); return; }
    if (!slug.trim()) { toast({ title: "Slug is required", variant: "destructive" }); return; }

    setSaving(true);
    const finalStatus = publishNow ? "published" : status;
    const data: BlogPostInput = {
      title: title.trim(),
      slug: slug.trim(),
      excerpt: excerpt.trim() || undefined,
      content,
      featuredImageUrl: featuredImageUrl.trim() || undefined,
      category: category.trim() || undefined,
      metaTitle: metaTitle.trim() || title.trim(),
      metaDescription: metaDescription.trim() || excerpt.trim() || undefined,
      status: finalStatus,
    };

    try {
      if (isCreate) {
        const post = await adminApi.createBlogPost(data);
        toast({ title: finalStatus === "published" ? "Post published!" : "Draft saved" });
        navigate(`/admin/blog/${post.id}/edit`);
      } else {
        await adminApi.updateBlogPost(editId!, data);
        setStatus(finalStatus);
        toast({ title: finalStatus === "published" ? "Post published!" : "Changes saved" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  if (loading) return <Skeleton className="h-96 rounded-2xl" />;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/blog")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Blog
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold font-serif">{isCreate ? "New Post" : "Edit Post"}</h1>
        </div>
        <Badge variant={status === "published" ? "default" : "secondary"}>{status}</Badge>
        <Button variant="outline" onClick={() => handleSave(false)} disabled={saving} className="gap-1.5 rounded-xl">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Draft
        </Button>
        <Button onClick={() => handleSave(true)} disabled={saving} className="gap-1.5 rounded-xl">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
          {status === "published" ? "Update" : "Publish"}
        </Button>
      </div>

      {/* Main fields */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="CBSE Class 12 Economics Important Topics 2026"
            className="text-lg h-12 rounded-xl"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="slug">
            URL Slug *
            {!slugManual && isCreate && <span className="text-xs text-muted-foreground ml-2">(auto-generated)</span>}
          </Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">/blog/</span>
            <Input
              id="slug" value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugManual(true); }}
              placeholder="cbse-class-12-economics-important-topics"
              className="rounded-xl font-mono text-sm"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="category">Category</Label>
            <Input
              id="category" value={category} onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. CBSE, Study Tips, Economics"
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="image">Featured Image URL</Label>
            <Input
              id="image" value={featuredImageUrl} onChange={(e) => setFeaturedImageUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="rounded-xl"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="excerpt">Excerpt / Summary</Label>
          <Textarea
            id="excerpt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)}
            placeholder="A short description of this post (shown on listing page and used as default meta description)"
            rows={2}
            className="rounded-xl resize-none"
          />
        </div>
      </div>

      {/* Rich text editor */}
      <div className="space-y-1.5">
        <Label>Content *</Label>
        <RichTextEditor
          content={content}
          onChange={setContent}
          placeholder="Start writing your article here…"
        />
      </div>

      {/* SEO section */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">SEO Settings</span>
          <Separator className="flex-1" />
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="metaTitle">Meta Title <span className="text-muted-foreground text-xs">(defaults to post title)</span></Label>
            <Input
              id="metaTitle" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)}
              placeholder={title || "Page title for search engines"}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="metaDesc">Meta Description <span className="text-muted-foreground text-xs">(defaults to excerpt)</span></Label>
            <Textarea
              id="metaDesc" value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)}
              placeholder={excerpt || "Description shown in Google search results (150-160 chars recommended)"}
              rows={2}
              className="rounded-xl resize-none"
            />
            <p className="text-xs text-muted-foreground">{metaDescription.length}/160 characters</p>
          </div>
        </div>
      </div>
    </div>
  );
}
