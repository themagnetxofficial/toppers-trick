import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGetMyCredits, useCreatePaymentOrder, useVerifyPayment, useListPayments } from "@workspace/api-client-react";
import { Coins, Check, Shield, Zap, Loader2, History, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function PricingPage() {
  const { data: credits, refetch: refetchCredits } = useGetMyCredits();
  const { data: history } = useListPayments();
  const createOrder = useCreatePaymentOrder();
  const verifyPayment = useVerifyPayment();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);

  // Load Razorpay script
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => setRazorpayLoaded(true);
    document.body.appendChild(script);
    
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const handlePurchase = () => {
    if (!razorpayLoaded) {
      toast.error("Payment gateway is loading. Please try again in a few seconds.");
      return;
    }

    setIsProcessing(true);
    createOrder.mutate(undefined, {
      onSuccess: (order) => {
        const options = {
          key: order.key,
          amount: order.amount,
          currency: order.currency,
          name: "Smart Study Guide",
          description: "10 AI Paper Analyses",
          order_id: order.orderId,
          handler: function (response: any) {
            // Verify payment
            verifyPayment.mutate({
              data: {
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              }
            }, {
              onSuccess: () => {
                toast.success("Payment successful! 10 credits added to your account.");
                refetchCredits();
                setIsProcessing(false);
              },
              onError: () => {
                toast.error("Payment verification failed. Please contact support.");
                setIsProcessing(false);
              }
            });
          },
          prefill: {
            name: "Student", // We could fetch from profile
          },
          theme: {
            color: "#F59E0B" // Saffron Orange
          },
          modal: {
            ondismiss: function() {
              setIsProcessing(false);
            }
          }
        };

        // @ts-ignore
        const rzp = new window.Razorpay(options);
        rzp.open();
      },
      onError: () => {
        toast.error("Failed to initialize payment. Please try again.");
        setIsProcessing(false);
      }
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center space-y-4 pt-4">
        <h1 className="text-4xl font-bold font-serif text-foreground">Get More Analyses</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          You currently have <strong className="text-primary">{credits?.creditsRemaining || 0} credits</strong>. 
          Each analysis costs 1 credit.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
        {/* Pricing Card */}
        <Card className="border-primary shadow-xl shadow-primary/10 relative overflow-hidden bg-gradient-to-b from-card to-primary/5">
          <div className="absolute top-0 right-0 p-4">
            <Badge variant="default" className="shadow-sm">Most Popular</Badge>
          </div>
          <CardContent className="p-8 sm:p-10 flex flex-col h-full">
            <div className="mb-8">
              <h2 className="text-2xl font-bold font-serif mb-2 text-foreground">Exam Season Pack</h2>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-5xl font-bold text-foreground">₹129</span>
                <span className="text-muted-foreground font-medium">/ pack</span>
              </div>
              <p className="text-foreground/80 font-medium flex items-center gap-2">
                <Coins className="w-5 h-5 text-primary" />
                Adds 10 Credits (10 Analyses)
              </p>
            </div>

            <div className="space-y-4 mb-8 flex-1">
              {[
                "10 full subject analyses",
                "Priority AI processing",
                "Unlimited paper uploads per subject",
                "PDF study guide generation",
                "Credits never expire"
              ].map((feature, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-foreground/90 font-medium">{feature}</span>
                </div>
              ))}
            </div>

            <Button 
              size="lg" 
              className="w-full h-14 text-lg rounded-xl font-bold shadow-lg shadow-primary/20 hover:shadow-primary/40"
              onClick={handlePurchase}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>Buy 10 Credits for ₹129</>
              )}
            </Button>
            <p className="text-center text-xs text-muted-foreground mt-4 flex items-center justify-center gap-1">
              <Shield className="w-3 h-3" /> Secure payment via Razorpay
            </p>
          </CardContent>
        </Card>

        {/* Info/FAQ side */}
        <div className="space-y-6 flex flex-col justify-center">
          <div className="bg-secondary/50 rounded-2xl p-6 border border-border">
            <h3 className="text-lg font-bold font-serif mb-2 flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" /> Why pay?
            </h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Analyzing long question papers requires heavy AI processing power. We charge a tiny fee to cover these server costs so you can get the best possible study strategy.
            </p>
          </div>
          
          <div className="bg-secondary/50 rounded-2xl p-6 border border-border">
            <h3 className="text-lg font-bold font-serif mb-2 flex items-center gap-2">
              <Coins className="w-5 h-5 text-primary" /> Do credits expire?
            </h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              No! Any credits you purchase will remain in your account forever. Buy them now for this semester, use the leftovers next semester.
            </p>
          </div>
        </div>
      </div>

      {/* Payment History */}
      {history && history.length > 0 && (
        <div className="max-w-3xl mx-auto mt-16 space-y-6 pt-8 border-t border-border">
          <h2 className="text-2xl font-bold font-serif flex items-center gap-2">
            <History className="w-6 h-6 text-primary" /> Payment History
          </h2>
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
            {history.map((payment, i) => (
              <div key={payment.id} className={`p-4 flex items-center justify-between ${i !== history.length - 1 ? 'border-b border-border' : ''}`}>
                <div>
                  <p className="font-medium text-foreground flex items-center gap-2">
                    ₹{payment.amount / 100}
                    {payment.status === 'success' ? (
                      <Badge variant="success" className="text-[10px] h-5 px-1.5 py-0">Success</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px] h-5 px-1.5 py-0">Failed</Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(payment.createdAt), 'MMM d, yyyy • h:mm a')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-foreground">10 Credits</p>
                  {payment.razorpayPaymentId && (
                    <p className="text-[10px] text-muted-foreground font-mono mt-1">ID: {payment.razorpayPaymentId.slice(-8)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
