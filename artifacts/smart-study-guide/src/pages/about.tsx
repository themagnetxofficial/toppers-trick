import { PublicLayout } from "@/components/layout/public-layout";

export default function AboutPage() {
  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto px-6 py-16 space-y-10">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">About Us</p>
          <h1 className="text-4xl font-bold font-serif">We help students study smarter, not harder</h1>
        </div>

        <div className="prose prose-neutral max-w-none space-y-6 text-foreground/80 leading-relaxed">
          <p className="text-lg text-foreground">
            ToppersTrick is an AI-powered study tool built specifically for Indian school and college students. 
            We know what exam season feels like — the pile of ten-year question papers, the uncertainty about what 
            to focus on, the anxiety of not knowing whether you're preparing right. We built ToppersTrick to fix exactly that.
          </p>

          <p>
            Here's how it works: you upload up to five previous-year question papers for any subject — as PDFs or images. 
            Our AI analyzes the patterns across those papers, identifies which topics appear most frequently, and generates 
            a prioritized study guide just for you. Topics are ranked as High, Medium, or Low priority based on how often 
            they've appeared over the years. You get a detailed Hinglish study guide (because sometimes desi explanations 
            just make more sense) along with a downloadable PDF you can print and stick on your wall.
          </p>

          <h2 className="text-2xl font-bold font-serif pt-4">Our Mission</h2>
          <p>
            Most students don't need to study more — they need to study smarter. We believe every student, regardless 
            of their coaching budget or school resources, deserves access to data-driven exam preparation. ToppersTrick 
            takes what toppers and experienced teachers have always known — past paper trends tell you a lot about what's 
            coming — and makes it instantly available to anyone with a phone and their old question papers.
          </p>

          <h2 className="text-2xl font-bold font-serif pt-4">Who Is It For?</h2>
          <p>
            ToppersTrick is built for students preparing for board exams (CBSE, ICSE, and state boards), as well as 
            undergraduate and postgraduate university examinations. Whether you're in Class 10 or Class 12, or studying 
            for semester exams in college, our tool works across subjects and syllabi — as long as you have past papers 
            to upload.
          </p>

          <p>
            We're a small, India-based team that cares deeply about making quality study tools accessible and affordable. 
            ToppersTrick is designed to be your smart study companion — not a replacement for understanding your subject, 
            but the sharpest possible shortcut for knowing where to focus your energy.
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
