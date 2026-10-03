"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Mail,
  ShoppingBag,
  RefreshCw,
  MessageSquare,
  Check,
  ChevronDown,
  Layers,
  ShieldCheck,
  Sparkles,
  ChartNoAxesCombined,
  Plus,
  Minus,
} from "lucide-react";
import { post } from "../lib/api";
import { Feedback, Badge } from "./ui";
const examples = [
  {
    name: "Your next delivery, your way",
    category: "Subscriptions",
    color: "sage",
    brand: "Meadow & Moss",
    image: 0,
  },
  {
    name: "Meet your new daily ritual",
    category: "Shopping",
    color: "peach",
    brand: "Solstice Pantry",
    image: 1,
  },
  {
    name: "A little feedback goes a long way",
    category: "Reviews",
    color: "lavender",
    brand: "Northstar Studio",
    image: 2,
  },
  {
    name: "Find your perfect blend",
    category: "Forms",
    color: "yellow",
    brand: "Juniper Market",
    image: 3,
  },
  {
    name: "A surprise worth opening",
    category: "Engagement",
    color: "sage",
    brand: "Meadow & Moss",
    image: 4,
  },
  {
    name: "Your ritual is waiting",
    category: "Subscriptions",
    color: "peach",
    brand: "Solstice Pantry",
    image: 5,
  },
];
export function Marketing({ section }: { section: string }) {
  const [filter, setFilter] = useState("All"),
    [quantity, setQuantity] = useState(1),
    [demoAction, setDemoAction] = useState(""),
    [volume, setVolume] = useState(5000),
    [annual, setAnnual] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false);
  const send = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    try {
      const r = await post("/contact", {
        email: d.get("email"),
        name: d.get("name"),
        message: d.get("message"),
      });
      setMessage(r.message);
      setError(false);
    } catch (e) {
      setMessage((e as Error).message);
      setError(true);
    }
  };
  return (
    <div className="marketing">
      <nav className="marketing-nav">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Mail size={20} />
          </span>
          inboxflow<span className="brand-dot">®</span>
        </Link>
        <div className="nav-links">
          <Link href="/product">Product</Link>
          <Link href="/examples">Examples</Link>
          <Link href="/integrations">Integrations</Link>
          <Link href="/pricing">Pricing</Link>
        </div>
        <div className="row">
          <Link href="/login" className="nav-login">
            Log in
          </Link>
          <Link href="/register" className="btn primary">
            Get started <ArrowUpRight size={17} />
          </Link>
        </div>
      </nav>
      {section === "home" && (
        <>
          <div className="hero-split">
            <div className="hero-copy">
              <span className="pill">
                <span className="live-dot" /> THE INBOX IS JUST THE BEGINNING
              </span>
              <h1>
                Good things
                <br />
                happen{" "}
                <em>
                  in
                  <br />
                  the inbox.
                </em>
              </h1>
              <p>
                Turn emails into experiences. Let your customers shop, share,
                and manage their subscriptions—without the extra steps.
              </p>
              <div className="row">
                <Link href="/register" className="btn primary large">
                  Build your first email <ArrowUpRight size={19} />
                </Link>
                <Link href="/examples" className="text-link">
                  See it in action <ArrowRight size={17} />
                </Link>
              </div>
              <small>No provider credentials needed for the local demo.</small>
            </div>
            <div className="hero-visual">
              <div className="floating-tag tag-top">
                <RefreshCw size={16} />
                Subscriptions, simplified.
              </div>
              <div className="mail-window">
                <div className="mail-window-bar">
                  <div className="window-dots">
                    <i />
                    <i />
                    <i />
                  </div>
                  <span>A little inbox inspiration</span>
                  <Mail size={15} />
                </div>
                <div className="mail-header">
                  <div className="avatar green">M</div>
                  <div>
                    <strong>Meadow & Moss</strong>
                    <small>to you · just now</small>
                  </div>
                  <span className="star">☆</span>
                </div>
                <div className="demo-email">
                  <div className="demo-brand">MEADOW & MOSS</div>
                  <h2>
                    Your daily ritual.
                    <br />
                    <em>On your terms.</em>
                  </h2>
                  <p>Your next delivery is coming. Make it yours.</p>
                  <div className="demo-product">
                    <img
                      src="/products/product-0.svg"
                      alt="Original Meadow daily greens packaging"
                    />
                    <div>
                      <Badge>Your next delivery</Badge>
                      <h3>Daily greens</h3>
                      <small>Original · 30 servings</small>
                      <div className="quantity">
                        <button
                          aria-label="Decrease demo quantity"
                          onClick={() => setQuantity(Math.max(1, quantity - 1))}
                        >
                          <Minus size={12} />
                        </button>
                        <span>{quantity}</span>
                        <button
                          aria-label="Increase demo quantity"
                          onClick={() =>
                            setQuantity(Math.min(20, quantity + 1))
                          }
                        >
                          <Plus size={12} />
                        </button>
                        <strong>${24 * quantity}.00</strong>
                      </div>
                    </div>
                  </div>
                  <button
                    className="btn primary full"
                    onClick={() =>
                      setDemoAction(
                        "Your demo delivery is delayed by 7 days. This demonstration does not change an account.",
                      )
                    }
                  >
                    {demoAction ? "✓ Delivery updated" : "Make a little room →"}
                  </button>
                  <button
                    className="demo-secondary"
                    onClick={() =>
                      setDemoAction(
                        "Explore 24 products and manage real sandbox subscriptions after signing in.",
                      )
                    }
                  >
                    Explore other rituals
                  </button>
                  {demoAction && <small role="status">{demoAction}</small>}
                </div>
              </div>
              <div className="floating-tag tag-bottom">
                <span className="success-dot">
                  <Check size={14} />
                </span>
                A happier customer. One less click.
              </div>
              <span className="visual-asterisk">✳</span>
            </div>
          </div>
          <div className="trust-strip">
            <span>BUILT FOR THE MOMENTS THAT MATTER</span>
            <div>
              <ShoppingBag /> Shopping
            </div>
            <div>
              <RefreshCw /> Subscriptions
            </div>
            <div>
              <MessageSquare /> Reviews & forms
            </div>
            <div>
              <ShieldCheck /> Secure confirmations
            </div>
          </div>
          <section className="marketing-section">
            <div className="section-intro">
              <span className="eyebrow">
                SMALL INTERACTIONS. BIG POSSIBILITIES.
              </span>
              <h2>
                There’s more to an email
                <br />
                than a link.
              </h2>
              <p>
                A flexible library of interactive blocks, connected to your
                store and designed for the way your customers live.
              </p>
            </div>
            <div className="feature-trio">
              {[
                {
                  icon: ShoppingBag,
                  title: "From interested to in the cart.",
                  body: "Products, variants, and a better path to merchant checkout.",
                  color: "sage",
                },
                {
                  icon: RefreshCw,
                  title: "Let their subscription fit their life.",
                  body: "Skip, delay, swap, and come back with a secure confirmation.",
                  color: "peach",
                },
                {
                  icon: MessageSquare,
                  title: "A conversation, not a click.",
                  body: "Branching surveys, thoughtful reviews, and consent-aware SMS.",
                  color: "lavender",
                },
              ].map((f) => (
                <Link
                  href="/features"
                  className={`feature-card ${f.color}`}
                  key={f.title}
                >
                  <f.icon size={25} />
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                  <ArrowUpRight size={22} />
                </Link>
              ))}
            </div>
          </section>
          <section className="marketing-section dark-section">
            <div>
              <span className="eyebrow">FROM AN IDEA TO AN INBOX</span>
              <h2>
                Your canvas.
                <br />
                Their next great moment.
              </h2>
              <p>
                Build visually. Preview every format. Connect the tools you
                already use.
              </p>
              <Link href="/product" className="btn lime">
                Meet the builder <ArrowRight size={18} />
              </Link>
            </div>
            <div className="builder-teaser">
              <div className="mini-library">
                <Layers />
                <span>Heading</span>
                <span>Products</span>
                <span>Subscription</span>
                <span>Review</span>
              </div>
              <div className="mini-canvas">
                <small>MEADOW & MOSS</small>
                <h3>
                  Good things,
                  <br />
                  delivered.
                </h3>
                <img
                  src="/products/product-1.svg"
                  alt="Original product illustration"
                />
                <span>Make it yours →</span>
              </div>
              <div className="mini-settings">
                <Sparkles /> Made for you.
                <div />
                <div />
                <div />
              </div>
            </div>
          </section>
        </>
      )}
      {["examples", "home"].includes(section) && (
        <section className="marketing-section">
          <div className="row between wrap">
            <div>
              <span className="eyebrow">A LITTLE INSPIRATION</span>
              <h2>
                Made for the everyday.
                <br />
                Anything but ordinary.
              </h2>
              <p>Original examples from fictional demonstration brands.</p>
            </div>
            {section === "home" && (
              <Link href="/examples" className="text-link">
                Explore all examples <ArrowUpRight size={18} />
              </Link>
            )}
          </div>
          <div className="tabs">
            {[
              "All",
              "Shopping",
              "Subscriptions",
              "Forms",
              "Reviews",
              "Engagement",
            ].map((f) => (
              <button
                key={f}
                className={filter === f ? "active" : ""}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="example-grid">
            {examples
              .filter((e) => filter === "All" || filter === e.category)
              .slice(0, section === "home" ? 3 : 6)
              .map((e) => (
                <Link key={e.name} href="/login" className="example-card">
                  <div className={`example-art ${e.color}`}>
                    <div className="sample-email">
                      <small>{e.brand.toUpperCase()}</small>
                      <h3>{e.name}</h3>
                      <img
                        src={`/products/product-${e.image}.svg`}
                        alt={`${e.brand} fictional product`}
                      />
                      <span>Make it yours →</span>
                    </div>
                  </div>
                  <div className="row between">
                    <div>
                      <small>{e.category}</small>
                      <h3>{e.name}</h3>
                    </div>
                    <ArrowUpRight size={20} />
                  </div>
                </Link>
              ))}
          </div>
        </section>
      )}
      {section === "pricing" && (
        <section className="marketing-section center">
          <span className="eyebrow">A PLAN THAT GROWS WITH YOU</span>
          <h1>
            More possibility.
            <br />
            <em>Less guesswork.</em>
          </h1>
          <p>
            Original InboxFlow demonstration plans. Local billing is simulated.
          </p>
          <div className="tabs centered">
            <button
              className={!annual ? "active" : ""}
              onClick={() => setAnnual(false)}
            >
              Monthly
            </button>
            <button
              className={annual ? "active" : ""}
              onClick={() => setAnnual(true)}
            >
              Annual · save 10%
            </button>
          </div>
          <div className="plans">
            {[
              {
                name: "Starter",
                price: 49,
                desc: "A thoughtful first step",
                items: [
                  "10 active templates",
                  "All interactive blocks",
                  "Sandbox integrations",
                ],
              },
              {
                name: "Growth",
                price: 149,
                desc: "Room for your next chapter",
                items: [
                  "100 active templates",
                  "Team and analytics",
                  "Forms and experiments",
                ],
              },
              {
                name: "Scale",
                price: 399,
                desc: "Built for bigger possibilities",
                items: [
                  "1,000 active templates",
                  "Higher volume metering",
                  "Deployment configuration",
                ],
              },
            ].map((p) => (
              <div
                className={`plan ${p.name === "Growth" ? "recommended" : ""}`}
                key={p.name}
              >
                <Badge>{p.name === "Growth" ? "MOST POPULAR" : p.desc}</Badge>
                <h2>{p.name}</h2>
                <div className="plan-price">
                  ${Math.round(p.price * (annual ? 0.9 : 1))}
                  <small>/month</small>
                </div>
                <p>{p.desc}</p>
                {p.items.map((i) => (
                  <div className="row" key={i}>
                    <Check size={16} />
                    {i}
                  </div>
                ))}
                <Link href="/register" className="btn primary full">
                  Choose {p.name} <ArrowRight size={17} />
                </Link>
              </div>
            ))}
          </div>
          <div className="pricing-calculator panel">
            <h3>Your estimated monthly budget</h3>
            <label>
              Interactive events: {volume.toLocaleString()}
              <input
                type="range"
                min="1000"
                max="100000"
                step="1000"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
              />
            </label>
            <strong>
              $
              {Math.round(
                (volume <= 10000 ? 49 : volume <= 50000 ? 149 : 399) *
                  (annual ? 0.9 : 1),
              )}
              /month
            </strong>
            <p>
              Plan recommendation only. Event quotas are not a charge and this
              is not a live quote.
            </p>
          </div>
        </section>
      )}
      {["product", "features", "integrations", "case-studies"].includes(
        section,
      ) && (
        <section className="marketing-section">
          <span className="eyebrow">BUILT TO BRING YOU CLOSER</span>
          <h1>
            {section === "integrations"
              ? "Your stack. A better connection."
              : section === "case-studies"
                ? "Stories from our fictional demo brands."
                : "An email that does a little more."}
          </h1>
          <p>
            InboxFlow combines a working editor, recipient experiences, and
            persistent analytics.
          </p>
          <div className="feature-trio">
            {(section === "integrations"
              ? ["Shopify", "Klaviyo", "Recharge", "Reviews", "SMS", "Billing"]
              : [
                  "Visual email builder",
                  "Commerce experiences",
                  "Subscription management",
                  "Forms and reviews",
                  "Analytics and experiments",
                  "Safe local assistant",
                ]
            ).map((f, i) => (
              <div
                className={`feature-card ${["sage", "peach", "lavender"][i % 3]}`}
                key={f}
              >
                {i % 2 ? <ChartNoAxesCombined /> : <Layers />}
                <h3>{f}</h3>
                <p>
                  {section === "integrations"
                    ? "A persistent sandbox adapter is available locally. Live provider support and approval requirements are documented in the repository."
                    : section === "case-studies"
                      ? "Explore a simulated journey. No customer results or performance claims are presented as real."
                      : "Build, save, and test this workflow in your local workspace."}
                </p>
                <Link href="/login" className="text-link">
                  Explore in the demo <ArrowUpRight size={17} />
                </Link>
              </div>
            ))}
          </div>
          <div className="callout">
            AMP previews are simulations. Real inbox interactivity requires
            sender approval, HTTPS endpoints, and an ESP that supports AMP.
            Static HTML includes hosted confirmation links.
          </div>
        </section>
      )}
      {section === "contact" && (
        <section className="marketing-section contact-section">
          <span className="eyebrow">LET’S MAKE SOMETHING GOOD</span>
          <h1>Start a conversation.</h1>
          <p>Requests are stored locally in this development environment.</p>
          <form className="panel" onSubmit={send}>
            <label>
              Your name
              <input name="name" required maxLength={100} />
            </label>
            <label>
              Work email
              <input type="email" name="email" required />
            </label>
            <label>
              What are you thinking about?
              <textarea name="message" required maxLength={2000} />
            </label>
            <Feedback message={message} error={error} />
            <button className="btn primary">
              Save demo request <ArrowRight size={17} />
            </button>
          </form>
        </section>
      )}
      {["privacy", "terms"].includes(section) && (
        <section className="marketing-section">
          <Badge tone="amber">DRAFT · LEGAL REVIEW REQUIRED</Badge>
          <h1>
            {section === "privacy" ? "Privacy notice" : "Terms of service"}
          </h1>
          <p>
            This local demonstration stores account, interaction, and consent
            records. These draft pages are placeholders and require legal
            review, a named data controller, processor terms, retention policy,
            jurisdiction-specific consent requirements, and support contacts
            before launch.
          </p>
          <p>
            No legal or security certification is claimed. Organization owners
            can export or delete customer data in Settings.
          </p>
        </section>
      )}
      {["home", "pricing", "product"].includes(section) && (
        <section className="marketing-section faq">
          <span className="eyebrow">GOOD QUESTIONS</span>
          <h2>A little clarity.</h2>
          {[
            [
              "Does InboxFlow send my emails?",
              "Your ESP remains responsible for delivery and scheduling. The local sandbox exports drafts and simulates workflows.",
            ],
            [
              "What happens in an unsupported inbox?",
              "The generated static HTML and plaintext include secure links to a hosted experience. The browser preview does not verify real inbox rendering.",
            ],
            [
              "Can I try it without connecting my store?",
              "Yes. The seeded catalog, subscriptions, forms, and events run locally and persist in PostgreSQL.",
            ],
            [
              "Is this affiliated with Zaymo?",
              "No. InboxFlow is independently implemented with an original identity and fictional demonstration brands.",
            ],
          ].map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <ChevronDown size={18} />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </section>
      )}
      <section className="marketing-cta">
        <span className="eyebrow">YOUR NEXT GREAT EMAIL STARTS HERE</span>
        <h2>
          Make their inbox
          <br />a little more <em>human.</em>
        </h2>
        <Link href="/register" className="btn primary large">
          Let’s build something <ArrowUpRight size={19} />
        </Link>
      </section>
      <footer className="marketing-footer">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Mail size={20} />
          </span>
          inboxflow
        </Link>
        <p>Good things happen in the inbox.</p>
        <div className="row wrap">
          {[
            "Product",
            "Examples",
            "Pricing",
            "Contact",
            "Privacy",
            "Terms",
          ].map((v) => (
            <Link href={`/${v.toLowerCase()}`} key={v}>
              {v}
            </Link>
          ))}
        </div>
        <small>
          © 2026 InboxFlow · Independent local demonstration · No affiliation
          with Zaymo
        </small>
      </footer>
    </div>
  );
}
