import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from '@clerk/react';
import { shadcn } from '@clerk/themes';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { setBaseUrl } from "@workspace/api-client-react";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "@/components/ui/toaster";
import { Shell } from "@/components/layout/shell";

import LandingPage from "./pages/landing";
import DashboardPage from "./pages/dashboard";
import AnalyzePage from "./pages/analyze";
import AnalysisResultPage from "./pages/analysis-result";
import HistoryPage from "./pages/history";
import PricingPage from "./pages/pricing";
import ProfilePage from "./pages/profile";
import OnboardingPage from "./pages/onboarding";
import AboutPage from "./pages/about";
import ContactPage from "./pages/contact";
import TermsPage from "./pages/terms";
import PrivacyPage from "./pages/privacy";
import RefundPage from "./pages/refund";
import NotFound from "./pages/not-found";
import { AdminArea } from "./pages/admin/index";
import BlogListingPage from "./pages/blog/index";
import BlogPostPage from "./pages/blog/post";

declare const __CLERK_PUBLISHABLE_KEY__: string;

const queryClient = new QueryClient();

// Vite injects exactly one environment-appropriate Clerk key. This keeps the
// development key out of production assets and the live key out of preview.
const clerkPubKey = __CLERK_PUBLISHABLE_KEY__;

// REQUIRED — copy verbatim. Empty in dev, auto-set in prod.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
setBaseUrl(basePath || null);

// Strip base for Wouter
function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.png`, 
  },
  variables: {
    colorPrimary: "hsl(32, 95%, 55%)",
    colorForeground: "hsl(20, 25%, 15%)",
    colorMutedForeground: "hsl(30, 15%, 45%)",
    colorDanger: "hsl(0, 84%, 60%)",
    colorBackground: "hsl(40, 33%, 98%)",
    colorInput: "hsl(35, 20%, 88%)",
    colorInputForeground: "hsl(20, 25%, 15%)",
    colorNeutral: "hsl(35, 20%, 88%)",
    fontFamily: "Outfit, sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#FAFAFA] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-lg border border-[#EBEBEB]",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-2xl font-bold font-serif text-[#1C1815]",
    headerSubtitle: "text-[#665D55]",
    socialButtonsBlockButton: "!border !border-[#C5BDB5] !bg-white hover:!bg-[#F5F0EB] !opacity-100 !filter-none !shadow-sm",
    socialButtonsBlockButtonText: "!text-[#1C1815] font-medium",
    formFieldLabel: "text-[#1C1815] font-medium",
    footerActionLink: "text-[#F58F0A] hover:text-[#D47908] font-medium",
    footerActionText: "text-[#665D55]",
    dividerText: "text-[#665D55]",
    identityPreviewEditButton: "text-[#F58F0A]",
    formFieldSuccessText: "text-green-600",
    alertText: "text-[#1C1815]",
    formButtonPrimary: "bg-[#F58F0A] hover:bg-[#D47908] text-white font-semibold",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType<any> }) {
  return (
    <>
      <Show when="signed-in">
        <Shell>
          <Component />
        </Shell>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      signUpForceRedirectUrl={`${basePath}/onboarding`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/onboarding">
            <Show when="signed-in"><OnboardingPage /></Show>
            <Show when="signed-out"><Redirect to="/sign-in" /></Show>
          </Route>

          {/* Public pages — no auth required */}
          <Route path="/about" component={AboutPage} />
          <Route path="/contact" component={ContactPage} />
          <Route path="/terms" component={TermsPage} />
          <Route path="/privacy" component={PrivacyPage} />
          <Route path="/refund" component={RefundPage} />

          <Route path="/dashboard"><ProtectedRoute component={DashboardPage} /></Route>
          <Route path="/analyze"><ProtectedRoute component={AnalyzePage} /></Route>
          <Route path="/analyses/:id"><ProtectedRoute component={AnalysisResultPage} /></Route>
          <Route path="/history"><ProtectedRoute component={HistoryPage} /></Route>
          <Route path="/pricing"><ProtectedRoute component={PricingPage} /></Route>
          <Route path="/profile"><ProtectedRoute component={ProfilePage} /></Route>

          {/* Admin area */}
          <Route path="/admin/*?" component={AdminArea} />

          {/* Public blog */}
          <Route path="/blog/:slug" component={BlogPostPage} />
          <Route path="/blog" component={BlogListingPage} />

          <Route component={NotFound} />
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <HelmetProvider>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
        <Toaster />
      </WouterRouter>
    </HelmetProvider>
  );
}

export default App;