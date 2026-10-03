"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Mail,
  Check,
  ArrowRight,
  RefreshCw,
  ShieldCheck,
  Plus,
  Minus,
  Trash2,
  Star,
  Sparkles,
} from "lucide-react";
import { api, post, dollars } from "../lib/api";
import { Modal, Feedback, Loading, Badge } from "./ui";
export function Experience() {
  return (
    <Suspense>
      <ExperienceInner />
    </Suspense>
  );
}
function ExperienceInner() {
  const params = useSearchParams(),
    path = usePathname(),
    token = params.get("token") || "";
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [confirm, setConfirm] = useState(false),
    [result, setResult] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [action, setAction] = useState("delay"),
    [days, setDays] = useState(7),
    [quantity, setQuantity] = useState(1),
    [variantId, setVariantId] = useState(""),
    [plan, setPlan] = useState(""),
    [lines, setLines] = useState<any[]>([]),
    [answers, setAnswers] = useState<Record<string, any>>({}),
    [rating, setRating] = useState(5),
    [reviewTitle, setReviewTitle] = useState(""),
    [body, setBody] = useState(""),
    [phone, setPhone] = useState(""),
    [consent, setConsent] = useState(false);
  const checkout = path.startsWith("/checkout/");
  useEffect(() => {
    if (!token) return;
    api(`/experience?token=${encodeURIComponent(token)}`)
      .then((d) => {
        setData(d);
        if (d.result && !checkout) setResult(d.result);
        setVariantId(
          d.products[0]?.variants.find((v: any) => v.inventory > 0)?.id || "",
        );
      })
      .catch((e) => setError(e.message));
  }, [token]);
  if (!token)
    return (
      <div className="experience-page">
        <Link href="/" className="brand">
          <Mail />
          inboxflow
        </Link>
        <div className="experience-shell center">
          <ShieldCheck size={40} />
          <h1>A moment made for you.</h1>
          <p>
            A recipient-specific link is required for this experience. Sign in
            to the sandbox and create one from a subscription, form, or product
            workflow.
          </p>
          <Link href="/login" className="btn primary">
            Open demo workspace <ArrowRight size={17} />
          </Link>
        </div>
      </div>
    );
  if (!data)
    return (
      <div className="experience-page">
        <Feedback message={error} error />
        {!error && <Loading />}
      </div>
    );
  const products = data.products,
    variants = products.flatMap((p: any) =>
      p.variants.map((v: any) => ({ ...v, product: p })),
    ),
    variant = variants.find((v: any) => v.id === variantId);
  let input: Record<string, any> = { confirm: true };
  const scope = data.scope;
  const sub = data.subscription;
  const form = data.form?.data;
  if (["subscription", "reactivation", "swap"].includes(scope))
    input = {
      ...input,
      action:
        scope === "reactivation"
          ? "reactivate"
          : scope === "swap"
            ? "swap"
            : action,
      days,
      quantity,
      variantId,
      plan: plan || "monthly",
    };
  if (scope === "cart") input = { ...input, lines };
  if (scope === "form") input = { ...input, answers };
  if (scope === "review")
    input = { ...input, rating, title: reviewTitle, body };
  if (scope === "sms") input = { ...input, phone, consent };
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const r = checkout
        ? await post(`/checkout/${path.split("/").at(-1)}/confirm`, {
            token,
            confirm: true,
          })
        : await post("/experience/action", { token, input });
      setResult(r);
      setMessage(r.message || "Your change is complete.");
      setConfirm(false);
    } catch (e) {
      setError((e as Error).message);
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  };
  const total = lines.reduce(
    (s, l) =>
      s +
      (variants.find((v: any) => v.id === l.variantId)?.price || 0) *
        (1 -
          (l.sellingPlan === "monthly"
            ? 0.1
            : l.sellingPlan === "biweekly"
              ? 0.15
              : 0)) *
        l.quantity,
    0,
  );
  const title = checkout
    ? "Your sandbox checkout"
    : scope === "cart"
      ? "Make your daily ritual yours."
      : scope === "form"
        ? form?.name
        : scope === "review"
          ? "Little feedback. Big difference."
          : scope === "sms"
            ? "A little closer, by text."
            : scope === "unsubscribe"
              ? "Your inbox, your choice."
              : scope === "engagement"
                ? "A little surprise inside."
                : scope === "reactivation"
                  ? "Your ritual is waiting."
                  : "Your next delivery, your way.";
  return (
    <div className="experience-page">
      <div className="row between experience-top">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Mail size={19} />
          </span>
          inboxflow
        </Link>
        <Badge tone="amber">Local sandbox · no real transactions</Badge>
      </div>
      <main className="experience-shell">
        <div className="demo-brand">MEADOW & MOSS</div>
        <h1>{title}</h1>
        <p>
          Good things should fit your life. Take a moment to make this one
          yours.
        </p>
        <Feedback message={error} error />
        <Feedback message={message} />
        {data.used && !result && !checkout && (
          <div className="callout">
            This link has already been used. A new interaction link is needed
            for another change.
          </div>
        )}
        {checkout ? (
          <>
            <div className="callout">
              <ShieldCheck size={20} />
              This is a sandbox checkout. Confirmation records a demo order and
              updates local inventory. No card details or payment are collected.
            </div>
            <button
              className="btn primary full"
              onClick={() => setConfirm(true)}
              disabled={!!result}
            >
              Confirm sandbox order
            </button>
          </>
        ) : result ? (
          <div className="success-screen">
            <span className="success-circle">
              <Check size={28} />
            </span>
            <h2>
              {scope === "cart"
                ? "Your cart is ready."
                : "A little change, all taken care of."}
            </h2>
            <p>{result.message}</p>
            {result.total !== undefined && (
              <strong>{dollars(result.total)}</strong>
            )}
            {result.checkoutUrl && (
              <Link
                href={`${result.checkoutUrl}?token=${encodeURIComponent(token)}`}
                className="btn primary"
              >
                Continue to sandbox checkout <ArrowRight size={16} />
              </Link>
            )}
            {result.subscription && (
              <p>
                Next delivery: {result.subscription.data.nextOrder} ·{" "}
                {result.subscription.status}
              </p>
            )}
            {scope === "sms" && (
              <p>
                Marketing remains disabled until the provider callback confirms
                double opt-in.
              </p>
            )}
          </div>
        ) : (
          <>
            {["subscription", "reactivation", "swap"].includes(scope) &&
              sub && (
                <>
                  <div className="upcoming-order">
                    <img
                      src={
                        products.find((p: any) => p.id === sub.data.productId)
                          ?.image || "/products/product-0.svg"
                      }
                      alt="Subscription product"
                    />
                    <div>
                      <Badge>{sub.status}</Badge>
                      <h2>
                        {products.find((p: any) => p.id === sub.data.productId)
                          ?.title || sub.name}
                      </h2>
                      <p>
                        Quantity {sub.data.quantity} · {sub.data.plan}
                      </p>
                      <strong>Next delivery: {sub.data.nextOrder}</strong>
                      <small>
                        Payment arrangement: {sub.data.paymentStatus}
                      </small>
                    </div>
                  </div>
                  {scope === "subscription" && (
                    <label>
                      What would you like to change?
                      <select
                        value={action}
                        onChange={(e) => setAction(e.target.value)}
                      >
                        <option value="delay">Delay delivery</option>
                        <option value="skip">Skip a delivery</option>
                        <option value="quantity">Update quantity</option>
                        <option value="swap">Swap product / variant</option>
                        <option value="plan">Change delivery plan</option>
                        <option value="one-time">Add one-time item</option>
                        <option value="ship-now">
                          Request immediate shipment
                        </option>
                      </select>
                    </label>
                  )}
                  {action === "delay" && scope === "subscription" && (
                    <label>
                      Delay by {days} days
                      <input
                        type="range"
                        min="1"
                        max="90"
                        value={days}
                        onChange={(e) => setDays(Number(e.target.value))}
                      />
                    </label>
                  )}
                  {action === "quantity" && (
                    <label>
                      Quantity
                      <input
                        type="number"
                        value={quantity}
                        min="1"
                        max="20"
                        onChange={(e) => setQuantity(Number(e.target.value))}
                      />
                    </label>
                  )}
                  {(["swap", "one-time"].includes(action) ||
                    scope === "swap") && (
                    <label>
                      Choose your next ritual
                      <select
                        value={variantId}
                        onChange={(e) => setVariantId(e.target.value)}
                      >
                        {variants
                          .filter((v: any) => v.inventory > 0)
                          .map((v: any) => (
                            <option value={v.id} key={v.id}>
                              {v.product.title} · {v.title} · {dollars(v.price)}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  {action === "plan" && (
                    <label>
                      Delivery plan
                      <select
                        value={plan || "monthly"}
                        onChange={(e) => setPlan(e.target.value)}
                      >
                        <option value="monthly">Every 30 days</option>
                        <option value="biweekly">Every 14 days</option>
                      </select>
                    </label>
                  )}
                  <button
                    className="btn primary full"
                    disabled={data.used}
                    onClick={() => setConfirm(true)}
                  >
                    <RefreshCw size={17} />
                    {scope === "reactivation"
                      ? "Reactivate subscription"
                      : "Review change"}
                  </button>
                </>
              )}
            {scope === "cart" && (
              <>
                <div className="shopping-product">
                  <img
                    src={variant?.product.image || "/products/product-0.svg"}
                    alt={variant?.product.title || "Select a product"}
                  />
                  <div>
                    <label>
                      Choose your product
                      <select
                        value={variantId}
                        onChange={(e) => setVariantId(e.target.value)}
                      >
                        {variants.map((v: any) => (
                          <option
                            value={v.id}
                            disabled={!v.inventory}
                            key={v.id}
                          >
                            {v.product.title} · {v.title} · {dollars(v.price)}
                            {v.inventory ? "" : " · Out of stock"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Purchase option
                      <select
                        value={plan}
                        onChange={(e) => setPlan(e.target.value)}
                      >
                        <option value="">One-time purchase</option>
                        {variant?.product.sellingPlans.map((p: any) => (
                          <option value={p.id} key={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Quantity
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={quantity}
                        onChange={(e) => setQuantity(Number(e.target.value))}
                      />
                    </label>
                    <button
                      className="btn secondary"
                      onClick={() => {
                        if (
                          !variant ||
                          quantity < 1 ||
                          quantity > 20 ||
                          !Number.isInteger(quantity)
                        )
                          return;
                        setLines([
                          ...lines,
                          {
                            variantId,
                            quantity,
                            sellingPlan: plan || undefined,
                            key: crypto.randomUUID(),
                          },
                        ]);
                      }}
                    >
                      Add to your cart <Plus size={16} />
                    </button>
                  </div>
                </div>
                <div className="cart-list">
                  {lines.map((line, i) => (
                    <div className="cart-line" key={line.key}>
                      <div>
                        <strong>
                          {
                            variants.find((v: any) => v.id === line.variantId)
                              ?.product.title
                          }
                        </strong>
                        <small>
                          {line.sellingPlan
                            ? "Subscription: " + line.sellingPlan
                            : "One-time purchase"}
                        </small>
                      </div>
                      <div className="quantity">
                        <button
                          aria-label="Decrease cart quantity"
                          onClick={() =>
                            setLines(
                              lines.map((l, index) =>
                                index === i
                                  ? {
                                      ...l,
                                      quantity: Math.max(1, l.quantity - 1),
                                    }
                                  : l,
                              ),
                            )
                          }
                        >
                          <Minus size={12} />
                        </button>
                        <span>{line.quantity}</span>
                        <button
                          aria-label="Increase cart quantity"
                          onClick={() =>
                            setLines(
                              lines.map((l, index) =>
                                index === i
                                  ? {
                                      ...l,
                                      quantity: Math.min(20, l.quantity + 1),
                                    }
                                  : l,
                              ),
                            )
                          }
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                      <button
                        className="icon-button"
                        aria-label="Remove cart item"
                        onClick={() =>
                          setLines(lines.filter((_, index) => index !== i))
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="row between">
                  <span>Estimated subtotal</span>
                  <strong>{dollars(Math.round(total))}</strong>
                </div>
                <p className="muted">
                  4+ items receive a 10% tier discount at cart confirmation.
                  Inventory is checked on the server.
                </p>
                <button
                  className="btn primary full"
                  onClick={() => setConfirm(true)}
                  disabled={!lines.length || data.used}
                >
                  Review your cart <ArrowRight size={17} />
                </button>
              </>
            )}
            {scope === "form" && form && (
              <>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setConfirm(true);
                  }}
                >
                  {form.questions
                    .filter(
                      (q: any) =>
                        !q.showWhen ||
                        answers[q.showWhen.questionId] === q.showWhen.equals,
                    )
                    .map((q: any) => (
                      <label key={q.id}>
                        {q.label}
                        {q.required ? " *" : ""}
                        {q.type === "single" ? (
                          <select
                            required={q.required}
                            value={answers[q.id] || ""}
                            onChange={(e) =>
                              setAnswers({ ...answers, [q.id]: e.target.value })
                            }
                          >
                            <option value="">Choose an option</option>
                            {q.options.map((o: string) => (
                              <option key={o}>{o}</option>
                            ))}
                          </select>
                        ) : q.type === "multi" ? (
                          <div className="choice-list">
                            {q.options.map((o: string) => (
                              <label key={o}>
                                <input
                                  type="checkbox"
                                  checked={(answers[q.id] || []).includes(o)}
                                  onChange={(e) =>
                                    setAnswers({
                                      ...answers,
                                      [q.id]: e.target.checked
                                        ? [...(answers[q.id] || []), o]
                                        : (answers[q.id] || []).filter(
                                            (v: string) => v !== o,
                                          ),
                                    })
                                  }
                                />
                                {o}
                              </label>
                            ))}
                          </div>
                        ) : q.type === "long" ? (
                          <textarea
                            required={q.required}
                            value={answers[q.id] || ""}
                            maxLength={5000}
                            onChange={(e) =>
                              setAnswers({ ...answers, [q.id]: e.target.value })
                            }
                          />
                        ) : (
                          <input
                            type={
                              q.type === "rating"
                                ? "number"
                                : q.type === "phone"
                                  ? "tel"
                                  : "text"
                            }
                            required={q.required}
                            min={q.type === "rating" ? 1 : undefined}
                            max={q.type === "rating" ? 5 : undefined}
                            value={answers[q.id] ?? ""}
                            onChange={(e) =>
                              setAnswers({
                                ...answers,
                                [q.id]:
                                  q.type === "rating"
                                    ? Number(e.target.value)
                                    : e.target.value,
                              })
                            }
                          />
                        )}
                      </label>
                    ))}
                  <button className="btn primary full" disabled={data.used}>
                    Review your answers <ArrowRight size={17} />
                  </button>
                </form>
              </>
            )}
            {scope === "review" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setConfirm(true);
                }}
              >
                <label>
                  Rating
                  <div className="stars" role="group" aria-label="Rating">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        type="button"
                        aria-label={`${n} stars`}
                        aria-pressed={rating === n}
                        onClick={() => setRating(n)}
                        key={n}
                      >
                        <Star
                          size={28}
                          fill={rating >= n ? "#d6a345" : "none"}
                        />
                      </button>
                    ))}
                  </div>
                </label>
                <label>
                  Review title
                  <input
                    value={reviewTitle}
                    maxLength={120}
                    required
                    onChange={(e) => setReviewTitle(e.target.value)}
                  />
                </label>
                <label>
                  Your review
                  <textarea
                    value={body}
                    required
                    maxLength={5000}
                    onChange={(e) => setBody(e.target.value)}
                  />
                </label>
                <button className="btn primary full" disabled={data.used}>
                  Review submission
                </button>
              </form>
            )}
            {scope === "sms" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setConfirm(true);
                }}
              >
                <label>
                  Phone number
                  <input
                    type="tel"
                    placeholder="+12025550123"
                    pattern="\+[1-9][0-9]{7,14}"
                    value={phone}
                    required
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={consent}
                    required
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>
                    I agree to receive recurring marketing SMS. Message and data
                    rates may apply. Reply STOP to opt out. Consent is not a
                    condition of purchase.
                  </span>
                </label>
                <button
                  className="btn primary full"
                  disabled={!consent || data.used}
                >
                  Review SMS opt-in
                </button>
              </form>
            )}
            {scope === "unsubscribe" && (
              <>
                <p>
                  Confirm to stop marketing email for this recipient. Your
                  preferences will be saved immediately.
                </p>
                <button
                  className="btn primary full"
                  disabled={data.used}
                  onClick={() => setConfirm(true)}
                >
                  Review unsubscribe
                </button>
              </>
            )}
            {scope === "engagement" && (
              <div className="reward-card">
                <Sparkles size={52} />
                <h2>Your next little delight.</h2>
                <p>
                  Discover a deterministic sandbox reward. No prize or real
                  discount is issued.
                </p>
                <button
                  className="btn primary"
                  disabled={data.used}
                  onClick={() => setConfirm(true)}
                >
                  Reveal my reward
                </button>
              </div>
            )}
          </>
        )}
        <div className="experience-footer">
          <ShieldCheck size={14} />
          <span>
            Secure, scoped interaction · Intentional confirmation · Local
            sandbox
          </span>
        </div>
      </main>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={checkout ? "Confirm sandbox order" : "Confirm your action"}
      >
        <p>
          {checkout
            ? "Confirm this local demonstration order. No payment is collected."
            : scope === "subscription"
              ? `Apply “${action}” to ${sub?.name}? ${action === "delay" ? `Delay by ${days} days.` : ""}`
              : scope === "reactivation"
                ? "Reactivate this cancelled subscription in the sandbox?"
                : scope === "cart"
                  ? `Create a cart with ${lines.length} item lines?`
                  : "Submit this action and save your information?"}
        </p>
        <p className="muted">
          This action will be recorded in the local provider and interaction
          history.
        </p>
        <div className="row">
          <button className="btn secondary" onClick={() => setConfirm(false)}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? "Working…" : "Confirm action"}
            <Check size={16} />
          </button>
        </div>
      </Modal>
    </div>
  );
}
