"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Mail,
  LayoutDashboard,
  Layers,
  MousePointer2,
  ShoppingBag,
  ListFilter,
  Megaphone,
  GitBranch,
  Plug,
  ChartNoAxesCombined,
  FlaskConical,
  FileChartColumn,
  Sparkles,
  Users,
  CreditCard,
  Settings,
  LogOut,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  Activity,
  RefreshCw,
  Copy,
  Eye,
  Download,
  Check,
  ShieldCheck,
  ChevronDown,
  Menu,
  Trash2,
} from "lucide-react";
import { api, post, download, dollars } from "../lib/api";
import {
  newBlock,
  documentSchema,
  blockTypes,
} from "../../../../packages/shared/src/index";
import { Editor } from "./editor";
import { FormBuilder } from "./form-builder";
import {
  SectionHead,
  Metric,
  Badge,
  Loading,
  Empty,
  Modal,
  Feedback,
  useFeedback,
} from "./ui";
const nav = [
  ["home", "Overview", LayoutDashboard],
  ["templates", "Email templates", Mail],
  ["forms", "Forms & quizzes", MousePointer2],
  ["products", "Products", ShoppingBag],
  ["feeds", "Product feeds", ListFilter],
  ["campaigns", "Campaigns", Megaphone],
  ["flows", "Flows", GitBranch],
  ["blocks", "Interactive blocks", Layers],
  ["integrations", "Integrations", Plug],
  ["analytics", "Analytics", ChartNoAxesCombined],
  ["experiments", "A/B tests", FlaskConical],
  ["reports", "Reports", FileChartColumn],
  ["ai", "Ask AI", Sparkles],
  ["team", "Team", Users],
  ["billing", "Billing", CreditCard],
  ["settings", "Settings", Settings],
] as const;
export function Dashboard({ route }: { route: string[] }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <Workspace route={route} />
    </QueryClientProvider>
  );
}
function Workspace({ route }: { route: string[] }) {
  const router = useRouter(),
    [me, setMe] = useState<any>(null),
    [error, setError] = useState(""),
    [menu, setMenu] = useState(false);
  const page = route[0] || "home";
  const f = useFeedback();
  useEffect(() => {
    api("/auth/me")
      .then(setMe)
      .catch((e) => {
        if (e.status === 401) router.replace("/login");
        else setError(e.message);
      });
  }, [router]);
  if (!me) return error ? <Feedback message={error} error /> : <Loading />;
  const org = me.organizations.find((o: any) => o.id === me.org),
    canEdit = ["owner", "admin", "editor"].includes(me.role),
    canAdmin = ["owner", "admin"].includes(me.role);
  const editor = page === "builder" && route[1];
  return (
    <div
      className={`app-shell ${menu ? "menu-open" : ""} ${editor ? "editor-shell" : ""}`}
    >
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Mail size={19} />
          </span>
          inboxflow
        </Link>
        <div className="organization-switch">
          <span className="avatar green">{org.name[0]}</span>
          <select
            aria-label="Switch organization"
            value={me.org}
            onChange={(e) =>
              f.run(async () => {
                await post("/auth/switch", { organizationId: e.target.value });
                location.href = "/app";
              })
            }
          >
            {me.organizations.map((o: any) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(([key, label, Icon], i) => (
            <div key={key}>
              {i === 9 && <div className="nav-label">INSIGHTS</div>}
              {i === 13 && <div className="nav-label">ORGANIZATION</div>}
              <Link
                href={`/app/${key === "home" ? "" : key}`}
                className={page === key ? "active" : ""}
                onClick={() => setMenu(false)}
              >
                <Icon size={18} />
                <span>{label}</span>
                {key === "ai" && <span className="new-badge">LOCAL</span>}
              </Link>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sandbox-card">
            <span className="live-dot" /> Your sandbox is ready
            <p>
              Make a little inbox magic.
              <br />
              No live sending or payments.
            </p>
            <Link href="/app/integrations">
              View connections <ArrowUpRight size={14} />
            </Link>
          </div>
          <Link href="/app/account" className="user-link">
            <span className="avatar cream">
              {me.user.name
                .split(" ")
                .map((v: string) => v[0])
                .slice(0, 2)
                .join("")}
            </span>
            <div>
              <strong>{me.user.name}</strong>
              <small>{me.role}</small>
            </div>
            <Settings size={16} />
          </Link>
        </div>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Toggle navigation"
            onClick={() => setMenu(!menu)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            Workspace <span>/</span>{" "}
            {editor
              ? "Email builder"
              : nav.find((n) => n[0] === page)?.[1] || "Account"}
          </div>
          <div className="row">
            <Badge tone="gray">{me.demo ? "DEMO DATA" : "WORKSPACE"}</Badge>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={() =>
                f.run(async () => {
                  await post("/auth/logout");
                  router.push("/login");
                })
              }
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>
        <Feedback message={f.message} error={f.error} />
        {editor ? (
          <Editor key={me.org + route[1]} id={route[1]} canEdit={canEdit} />
        ) : (
          <main className="dashboard-content">
            {page === "home" && <Overview me={me} />}{" "}
            {page === "templates" && <Templates canEdit={canEdit} />}{" "}
            {page === "forms" &&
              (route[1] ? (
                <FormBuilder id={route[1]} canEdit={canEdit} />
              ) : (
                <Records kind="form" canEdit={canEdit} />
              ))}{" "}
            {page === "products" && <Products canEdit={canEdit} />}{" "}
            {["feeds", "campaigns", "flows", "experiments", "reports"].includes(
              page,
            ) && (
              <Records
                kind={
                  (
                    {
                      feeds: "feed",
                      campaigns: "campaign",
                      flows: "flow",
                      experiments: "experiment",
                      reports: "report",
                    } as any
                  )[page]
                }
                canEdit={canEdit}
              />
            )}{" "}
            {page === "integrations" && <Integrations canAdmin={canAdmin} />}{" "}
            {page === "analytics" && <Analytics />} {page === "ai" && <AskAI />}{" "}
            {page === "team" && (
              <Team canAdmin={canAdmin} owner={me.role === "owner"} />
            )}{" "}
            {page === "billing" && <Billing owner={me.role === "owner"} />}{" "}
            {page === "settings" && (
              <OrganizationSettings canAdmin={canAdmin} />
            )}{" "}
            {page === "account" && <Account me={me} />}{" "}
            {page === "blocks" && <Blocks canEdit={canEdit} />}
          </main>
        )}
      </div>
    </div>
  );
}
function Overview({ me }: { me: any }) {
  const {
    data: stats,
    isLoading,
    error,
  } = useQuery({ queryKey: ["analytics"], queryFn: () => api("/analytics") });
  const { data: templates = [] } = useQuery({
    queryKey: ["templates"],
    queryFn: () => api<any[]>("/templates"),
  });
  if (isLoading) return <Loading />;
  if (error) return <Feedback message={error.message} error />;
  return (
    <>
      <SectionHead
        eyebrow="A LITTLE MOMENTUM, EVERY DAY"
        title={`Good things ahead, ${me.user.name.split(" ")[0]}.`}
        description="Here’s what’s happening in your inbox experiences."
        action={
          <Link href="/app/templates" className="btn primary">
            <Plus size={17} />
            Create an email
          </Link>
        }
      />
      <div className="welcome-banner">
        <div>
          <Badge>YOUR NEXT GREAT EMAIL</Badge>
          <h2>Make their inbox a little more human.</h2>
          <p>
            Products to discover. Deliveries to make their own.
            <br />
            Small interactions that bring your customers closer.
          </p>
          <Link href="/app/templates" className="text-link">
            Explore your templates <ArrowRight size={16} />
          </Link>
        </div>
        <div className="banner-art">
          <div className="banner-envelope">
            <Mail size={45} />
          </div>
          <span>✳</span>
          <div className="floating-tag">
            <Check size={13} />A good connection.
          </div>
        </div>
      </div>
      <Stats data={stats} />
      <div className="overview-grid">
        <div className="panel chart-panel">
          <div className="row between">
            <div>
              <h3>A little more engagement</h3>
              <p>Recorded interactions over time</p>
            </div>
            <Badge tone="gray">
              {stats.demo ? "SEEDED DEMO" : "EVENT DATA"}
            </Badge>
          </div>
          <Chart data={stats.series} />
          <div className="chart-legend">
            <i />
            Interactive actions <small>Measured events · {stats.window}</small>
          </div>
        </div>
        <div className="panel getting-started">
          <span className="eyebrow">MAKE YOURSELF AT HOME</span>
          <h3>Your next three steps.</h3>
          {[
            [
              "Connect your stack",
              "Sandbox providers are ready",
              "integrations",
              Plug,
            ],
            [
              "Make an email your own",
              "Start from a saved template",
              "templates",
              Mail,
            ],
            [
              "See the customer experience",
              "Confirm a subscription change",
              "flows",
              MousePointer2,
            ],
          ].map(([a, b, path, Icon]: any, i) => (
            <Link href={`/app/${path}`} key={a}>
              <span className="step-count">{i + 1}</span>
              <div>
                <strong>{a}</strong>
                <small>{b}</small>
              </div>
              <Icon size={17} />
            </Link>
          ))}
          <div className="small-note">
            <ShieldCheck size={15} />
            Safe to explore. Everything here is local.
          </div>
        </div>
      </div>
      <div className="row between section-label">
        <h2>Made for your next moment</h2>
        <Link href="/app/templates" className="text-link">
          All templates <ArrowRight size={16} />
        </Link>
      </div>
      <div className="template-grid">
        {templates.slice(0, 3).map((t: any, i: number) => (
          <TemplateCard template={t} key={t.id} color={i} />
        ))}
      </div>
      <Recent data={stats.recent} />
    </>
  );
}
function Stats({ data }: { data: any }) {
  return (
    <div className="metrics-grid">
      <Metric
        label="Total interactions"
        value={data.interactions.toLocaleString()}
        caption="From recorded action events"
        icon={<MousePointer2 size={17} />}
      />
      <Metric
        label="Engagement rate"
        value={
          data.engagementRate === null
            ? "—"
            : `${(data.engagementRate * 100).toFixed(1)}%`
        }
        caption="Unique engaged delivered message pairs"
        icon={<Activity size={17} />}
      />
      <Metric
        label="Confirmed revenue"
        value={dollars(data.revenue)}
        caption={
          data.demo
            ? "Sandbox transactions · not causal lift"
            : "Confirmed transactions · not causal lift"
        }
        icon={<ShoppingBag size={17} />}
      />
      <Metric
        label="Reactivations"
        value={data.counts.subscription_reactivated || 0}
        caption="Confirmed subscription actions"
        icon={<RefreshCw size={17} />}
      />
    </div>
  );
}
function Chart({ data, revenue = false }: { data: any[]; revenue?: boolean }) {
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 15, right: 15, left: -25, bottom: 0 }}
        >
          <defs>
            <linearGradient id="engagementGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#77975e" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#77975e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 5"
            vertical={false}
            stroke="#e9eee6"
          />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => v.slice(5)}
            tick={{ fontSize: 11, fill: "#839086" }}
            axisLine={false}
            tickLine={false}
            minTickGap={35}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#839086" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(v: any) => (revenue ? dollars(v) : v)}
            contentStyle={{ borderRadius: 12, border: "1px solid #e4e8df" }}
          />
          <Area
            type="monotone"
            dataKey={revenue ? "revenue" : "interactions"}
            stroke="#547745"
            strokeWidth={2.5}
            fill="url(#engagementGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
function TemplateCard({
  template: t,
  color = 0,
  children,
}: {
  template: any;
  color?: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="template-card">
      <Link
        href={`/app/builder/${t.id}`}
        className={`template-art ${["sage", "peach", "lavender"][color % 3]}`}
      >
        <div className="template-mini">
          <small>MEADOW & MOSS</small>
          <h3>
            {t.document?.blocks.find((b: any) =>
              ["hero", "heading"].includes(b.type),
            )?.content || t.name}
          </h3>
          <img
            src={`/products/product-${color % 6}.svg`}
            alt="Fictional demo product"
          />
          <span>Make it yours →</span>
        </div>
        <Badge tone="white">
          {t.document?.blocks.find(
            (b: any) =>
              !["hero", "heading", "paragraph", "footer"].includes(b.type),
          )?.type || "Email"}
        </Badge>
      </Link>
      <div className="template-card-info">
        <div className="row between">
          <Badge tone="gray">{t.status}</Badge>
          <small>v{t.revision}</small>
        </div>
        <Link href={`/app/builder/${t.id}`}>
          <h3>{t.name}</h3>
        </Link>
        <small>
          {t.document?.blocks.length || 0} blocks · Edited{" "}
          {new Date(t.updated_at).toLocaleDateString()}
        </small>
        {children}
      </div>
    </div>
  );
}
function Templates({ canEdit }: { canEdit: boolean }) {
  const [templates, setTemplates] = useState<any[]>([]),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("All"),
    [modal, setModal] = useState(false),
    [name, setName] = useState(""),
    [deleteId, setDeleteId] = useState("");
  const f = useFeedback(),
    router = useRouter();
  const load = () => api("/templates").then(setTemplates);
  useEffect(() => {
    void f.run(load, "");
  }, []);
  const create = () =>
    f.run(async () => {
      const doc = documentSchema.parse({
        name,
        subject: name,
        blocks: [newBlock("hero"), newBlock("paragraph"), newBlock("footer")],
      });
      const row = await post("/templates", doc);
      router.push(`/app/builder/${row.id}`);
    }, "Template created");
  return (
    <>
      <SectionHead
        eyebrow="YOUR INBOX CANVAS"
        title="Email templates"
        description="Good ideas, ready to make your own."
        action={
          <button
            className="btn primary"
            onClick={() => setModal(true)}
            disabled={!canEdit}
          >
            <Plus size={17} />
            Create template
          </button>
        }
      />
      <Feedback message={f.message} error={f.error} />
      <div className="toolbar">
        <div className="tabs">
          {["All", "Draft", "Published"].map((v) => (
            <button
              className={filter === v ? "active" : ""}
              onClick={() => setFilter(v)}
              key={v}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="search-input">
          <Search size={16} />
          <input
            aria-label="Search templates"
            placeholder="Find your next great email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="template-grid">
        {templates
          .filter(
            (t) =>
              t.name.toLowerCase().includes(query.toLowerCase()) &&
              (filter === "All" || t.status === filter.toLowerCase()),
          )
          .map((t, i) => (
            <TemplateCard key={t.id} template={t} color={i}>
              <div className="row template-actions">
                <Link href={`/app/builder/${t.id}`} className="text-link">
                  Edit template <ArrowUpRight size={14} />
                </Link>
                <button
                  className="icon-button"
                  aria-label={`Clone ${t.name}`}
                  disabled={!canEdit}
                  onClick={() =>
                    f.run(async () => {
                      await post("/templates", {
                        ...t.document,
                        name: t.name + " · copy",
                      });
                      await load();
                    }, "Template cloned")
                  }
                >
                  <Copy size={15} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Delete ${t.name}`}
                  disabled={!canEdit}
                  onClick={() => setDeleteId(t.id)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </TemplateCard>
          ))}
      </div>
      {!templates.length && (
        <Empty
          title="Your first email is waiting."
          body="Create a template, then add your first interactive block."
        />
      )}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Create an email template"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <label>
            Template name
            <input
              value={name}
              required
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button className="btn primary">
            Create template <ArrowRight size={16} />
          </button>
        </form>
      </Modal>
      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId("")}
        title="Delete template?"
      >
        <p>This removes the template and its saved versions.</p>
        <button
          className="btn danger"
          onClick={() =>
            f.run(async () => {
              await api(`/templates/${deleteId}`, { method: "DELETE" });
              setDeleteId("");
              await load();
            }, "Template deleted")
          }
        >
          Delete template
        </button>
      </Modal>
    </>
  );
}
function Recent({ data }: { data: any[] }) {
  return (
    <div className="panel recent-panel">
      <div className="row between">
        <h3>Every little interaction counts.</h3>
        <Link href="/app/analytics" className="text-link">
          View analytics <ArrowUpRight size={15} />
        </Link>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Action</th>
              <th>Message</th>
              <th>Revenue</th>
              <th>Recorded</th>
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 8).map((e: any) => (
              <tr key={e.id}>
                <td>
                  <span className="event-dot" />
                  {e.event_type.replaceAll("_", " ")}
                </td>
                <td>{e.template_id || "Hosted experience"}</td>
                <td>{e.revenue ? dollars(e.revenue) : "—"}</td>
                <td>{new Date(e.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.length && (
        <Empty
          title="Your activity starts here"
          body="Confirm a recipient action to record your first event."
        />
      )}
    </div>
  );
}
function Analytics() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics"],
    queryFn: () => api("/analytics"),
  });
  const [revenue, setRevenue] = useState(false);
  if (isLoading) return <Loading />;
  if (error) return <Feedback message={error.message} error />;
  return (
    <>
      <SectionHead
        eyebrow="MORE THAN A CLICK"
        title="Meaningful moments, measured."
        description="Metrics are calculated from persisted events, including sandbox actions."
        action={
          <a href="/api/analytics.csv" className="btn secondary">
            <Download size={16} />
            Export CSV
          </a>
        }
      />
      <Stats data={data} />
      <div className="panel">
        <div className="row between">
          <h3>Your interaction story</h3>
          <div className="tabs">
            <button
              className={!revenue ? "active" : ""}
              onClick={() => setRevenue(false)}
            >
              Interactions
            </button>
            <button
              className={revenue ? "active" : ""}
              onClick={() => setRevenue(true)}
            >
              Revenue
            </button>
          </div>
        </div>
        <Chart data={data.series} revenue={revenue} />
        <p className="muted">
          {data.window}. Opens are reported only when supplied by the ESP.
          Attributed sales do not establish causal lift.
        </p>
      </div>
      <div className="panel">
        <h3>Message performance</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Interactions</th>
                <th>Conversions</th>
                <th>Confirmed revenue</th>
              </tr>
            </thead>
            <tbody>
              {data.campaigns.map((c: any) => (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td>{c.interactions}</td>
                  <td>{c.conversions}</td>
                  <td>{dollars(c.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Recent data={data.recent} />
    </>
  );
}
function Products({ canEdit }: { canEdit: boolean }) {
  const [products, setProducts] = useState<any[]>([]),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("All"),
    [product, setProduct] = useState<any>(null),
    [link, setLink] = useState("");
  const f = useFeedback();
  const load = () => api("/products").then(setProducts);
  useEffect(() => {
    void f.run(load, "");
  }, []);
  return (
    <>
      <SectionHead
        eyebrow="YOUR STORE, CONNECTED"
        title="Good things to discover."
        description="Product data, variants, prices, and inventory from your product service."
        action={
          <button
            className="btn primary"
            disabled={!canEdit}
            onClick={() =>
              f.run(async () => {
                const r = await post("/products/sync");
                await load();
                f.clear();
                return r;
              }, "Catalog synchronized")
            }
          >
            <RefreshCw size={16} />
            Sync catalog
          </button>
        }
      />
      <Feedback message={f.message} error={f.error} />
      <div className="toolbar">
        <div className="tabs">
          {["All", "Wellness", "Nutrition", "Pantry"].map((c) => (
            <button
              key={c}
              className={c === category ? "active" : ""}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="search-input">
          <Search size={16} />
          <input
            aria-label="Search products"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your catalog"
          />
        </div>
      </div>
      <div className="product-grid">
        {products
          .filter(
            (p) =>
              p.title.toLowerCase().includes(query.toLowerCase()) &&
              (category === "All" || p.category === category),
          )
          .map((p, i) => (
            <button
              className="product-card"
              key={p.id}
              onClick={() => {
                setProduct(p);
                setLink("");
              }}
            >
              <div className={["sage", "peach", "lavender"][i % 3]}>
                <img src={p.image} alt={p.title} />
              </div>
              <div className="row between">
                <small>{p.category}</small>
                <Badge tone={p.inventory ? "green" : "amber"}>
                  {p.inventory ? "In stock" : "Out of stock"}
                </Badge>
              </div>
              <h3>{p.title}</h3>
              <div className="row between">
                <strong>{dollars(p.price)}</strong>
                <small>
                  {p.variants.length} variants <ArrowUpRight size={12} />
                </small>
              </div>
            </button>
          ))}
      </div>
      {!products.length && (
        <Empty
          title="Bring your catalog into the inbox"
          body="Sync the sandbox catalog to start building commerce emails."
        />
      )}
      <Modal
        open={!!product}
        onClose={() => setProduct(null)}
        title={product?.title || "Product"}
      >
        {product && (
          <>
            <img
              className="product-detail-image"
              src={product.image}
              alt={product.title}
            />
            <p>{product.description}</p>
            <table>
              <thead>
                <tr>
                  <th>Variant</th>
                  <th>Price</th>
                  <th>Inventory</th>
                </tr>
              </thead>
              <tbody>
                {product.variants.map((v: any) => (
                  <tr key={v.id}>
                    <td>{v.title}</td>
                    <td>{dollars(v.price)}</td>
                    <td>{v.inventory}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Subscription plans:{" "}
              {product.sellingPlans.map((p: any) => p.name).join(", ")}
            </p>
            <button
              className="btn primary"
              disabled={!canEdit}
              onClick={() =>
                f.run(async () => {
                  const r = await post("/action-tokens", {
                    recipientId: "profile-1",
                    scope: "cart",
                    targetId: product.id,
                  });
                  setLink(r.url);
                }, "Recipient link created")
              }
            >
              Create demo shopping link
            </button>
            {link && (
              <Link href={link} className="btn secondary" target="_blank">
                Open shopping experience <ArrowUpRight size={16} />
              </Link>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
function Records({ kind, canEdit }: { kind: string; canEdit: boolean }) {
  const [records, setRecords] = useState<any[]>([]),
    [templates, setTemplates] = useState<any[]>([]),
    [testProfiles, setTestProfiles] = useState<any[]>([]),
    [testRecipient, setTestRecipient] = useState("profile-1"),
    [modal, setModal] = useState(false),
    [name, setName] = useState(""),
    [templateId, setTemplateId] = useState(""),
    [trigger, setTrigger] = useState("Upcoming subscription billing"),
    [strategy, setStrategy] = useState("best-sellers"),
    [metric, setMetric] = useState("interactions"),
    [feedIds, setFeedIds] = useState(""),
    [feedCategory, setFeedCategory] = useState(""),
    [feedExclude, setFeedExclude] = useState(""),
    [feedLimit, setFeedLimit] = useState(6),
    [editing, setEditing] = useState<any>(null),
    [configuration, setConfiguration] = useState(""),
    [detail, setDetail] = useState<any>(null),
    [results, setResults] = useState<any>(null),
    [link, setLink] = useState("");
  const f = useFeedback(),
    router = useRouter();
  const label = (
    {
      form: "Forms & quizzes",
      campaign: "Campaigns",
      flow: "Flows",
      feed: "Product feeds",
      experiment: "A/B tests",
      report: "Reports",
    } as any
  )[kind];
  const load = async () => {
    setRecords(await api(`/records/${kind}`));
    const ts = await api("/templates");
    setTemplates(ts);
    setTemplateId(ts[0]?.id || "");
    const profiles = await api("/records/profile");
    setTestProfiles(profiles);
    setTestRecipient(profiles[0]?.id || "");
  };
  useEffect(() => {
    void f.run(load, "");
  }, [kind]);
  const create = () =>
    f.run(async () => {
      let data: any;
      if (kind === "form")
        data = {
          name,
          questions: [
            {
              id: "q1",
              label: "What would you like us to know?",
              type: "short",
              required: true,
              options: [],
            },
          ],
          success: "Thanks for sharing!",
          outcomes: [],
        };
      if (kind === "feed")
        data = {
          strategy,
          limit: feedLimit,
          ids: feedIds
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          category: feedCategory || undefined,
          exclude: feedExclude
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        };
      if (kind === "report")
        data = {
          metric,
          description: "Saved view of persisted account metrics",
        };
      if (kind === "experiment")
        data = {
          templateId,
          metric: "purchase_confirmed",
          salt: crypto.randomUUID(),
        };
      if (kind === "campaign")
        data = { templateId, trigger, eligible: { consent: true } };
      if (kind === "flow")
        data = {
          templateId,
          trigger,
          eligibility: { consent: true, status: "active" },
        };
      const r = await post(`/records/${kind}`, { name, data });
      setModal(false);
      await load();
      if (kind === "form") router.push(`/app/forms/${r.id}`);
    }, `${label} saved`);
  return (
    <>
      <SectionHead
        eyebrow={
          kind === "flow"
            ? "THE RIGHT MOMENT, THE RIGHT MESSAGE"
            : "MAKE EVERY CONNECTION COUNT"
        }
        title={label}
        description={
          kind === "flow"
            ? "Model and simulate consent-aware journeys. Your ESP handles live delivery."
            : kind === "experiment"
              ? "Stable recipient cohorts and Wilson confidence intervals."
              : "Create, configure, and inspect persistent records."
        }
        action={
          <button
            className="btn primary"
            disabled={!canEdit}
            onClick={() => {
              setName("");
              setModal(true);
            }}
          >
            <Plus size={16} />
            Create {kind}
          </button>
        }
      />
      <Feedback message={f.message} error={f.error} />
      {records.length ? (
        <>
          <label>
            Test recipient
            <select
              value={testRecipient}
              onChange={(e) => setTestRecipient(e.target.value)}
            >
              <option value="">Choose a profile</option>
              {testProfiles.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="panel">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Configuration</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.name}</strong>
                      </td>
                      <td>
                        <Badge tone="gray">{r.status}</Badge>
                      </td>
                      <td>
                        {r.data.trigger ||
                          r.data.strategy ||
                          r.data.metric ||
                          `${r.data.questions?.length || 0} questions`}
                      </td>
                      <td>{new Date(r.updated_at).toLocaleDateString()}</td>
                      <td>
                        <div className="row">
                          <button
                            className="icon-button"
                            aria-label={`Inspect ${r.name}`}
                            onClick={() => {
                              setDetail(r);
                              setResults(null);
                              setLink("");
                            }}
                          >
                            <Eye size={16} />
                          </button>
                          {kind === "form" && (
                            <Link
                              className="text-link"
                              href={`/app/forms/${r.id}`}
                            >
                              Edit
                            </Link>
                          )}
                          {kind !== "form" && (
                            <button
                              className="btn secondary small"
                              disabled={!canEdit}
                              onClick={() => {
                                setEditing(r);
                                setConfiguration(
                                  JSON.stringify(r.data, null, 2),
                                );
                              }}
                            >
                              Configure
                            </button>
                          )}
                          {["flow", "experiment", "feed", "report"].includes(
                            kind,
                          ) && (
                            <button
                              className="btn secondary small"
                              onClick={() =>
                                f.run(async () => {
                                  setDetail(r);
                                  setResults(
                                    await (kind === "flow"
                                      ? post(`/flows/${r.id}/simulate`, {
                                          recipientId: testRecipient,
                                        })
                                      : kind === "feed"
                                        ? post(`/feeds/${r.id}/preview`)
                                        : kind === "report"
                                          ? api("/analytics")
                                          : api(
                                              `/experiments/${r.id}/results`,
                                            )),
                                  );
                                }, "")
                              }
                            >
                              {kind === "flow"
                                ? "Simulate"
                                : kind === "feed"
                                  ? "Preview"
                                  : kind === "report"
                                    ? "Run report"
                                    : "Results"}
                            </button>
                          )}
                          <button
                            className="icon-button"
                            aria-label={`Delete ${r.name}`}
                            disabled={!canEdit}
                            onClick={() => {
                              setDetail({ ...r, deleteRequested: true });
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <Empty
          title={`Make your first ${kind}.`}
          body="Create a persistent record to begin this workflow."
        />
      )}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={`Create ${kind}`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <label>
            Name
            <input
              value={name}
              required
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {["campaign", "flow", "experiment"].includes(kind) && (
            <label>
              Email template
              <select
                value={templateId}
                required
                onChange={(e) => setTemplateId(e.target.value)}
              >
                {templates.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {["campaign", "flow"].includes(kind) && (
            <label>
              Trigger
              <select
                value={trigger}
                onChange={(e) => setTrigger(e.target.value)}
              >
                {[
                  "Welcome series",
                  "Abandoned cart recovery",
                  "Checkout recovery",
                  "Replenishment reminder",
                  "Upcoming subscription billing",
                  "Subscription upgrade",
                  "Subscription winback",
                  "Review request",
                  "Post-purchase survey",
                  "SMS opt-in",
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          )}
          {kind === "feed" && (
            <label>
              Recommendation strategy
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
              >
                {[
                  "best-sellers",
                  "manual",
                  "collection",
                  "previous",
                  "related",
                  "abandoned",
                  "viewed",
                  "rules",
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          )}
          {kind === "feed" && (
            <>
              <label>
                Product IDs
                <input
                  value={feedIds}
                  onChange={(e) => setFeedIds(e.target.value)}
                  placeholder="product-1, product-2"
                />
              </label>
              <label>
                Collection or category
                <input
                  value={feedCategory}
                  onChange={(e) => setFeedCategory(e.target.value)}
                  placeholder="Wellness"
                />
              </label>
              <label>
                Exclude product IDs
                <input
                  value={feedExclude}
                  onChange={(e) => setFeedExclude(e.target.value)}
                  placeholder="Already subscribed items"
                />
              </label>
              <label>
                Maximum products
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={feedLimit}
                  onChange={(e) => setFeedLimit(Number(e.target.value))}
                />
              </label>
            </>
          )}
          {kind === "report" && (
            <label>
              Metric
              <select
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
              >
                {[
                  "interactions",
                  "revenue",
                  "subscription_reactivated",
                  "conversions",
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          )}
          <p className="muted">
            Saved as a draft. No live sending, billing, or provider action
            occurs.
          </p>
          <button className="btn primary">
            Create {kind} <ArrowRight size={16} />
          </button>
        </form>
      </Modal>
      <Modal
        open={!!detail}
        onClose={() => {
          setDetail(null);
          setResults(null);
        }}
        title={detail?.name || "Details"}
      >
        {detail &&
          (detail.deleteRequested ? (
            <>
              <p>Delete this {kind}? Associated records may be removed.</p>
              <button
                className="btn danger"
                onClick={() =>
                  f.run(async () => {
                    await api(`/records/${kind}/${detail.id}`, {
                      method: "DELETE",
                    });
                    setDetail(null);
                    await load();
                  }, "Record deleted")
                }
              >
                Confirm deletion
              </button>
            </>
          ) : (
            <>
              <Badge tone="gray">
                {detail.status} · v{detail.revision}
              </Badge>
              {detail.data.questions && (
                <p>
                  {detail.data.questions.length} questions ·{" "}
                  {detail.data.questions.filter((q: any) => q.showWhen).length}{" "}
                  conditional questions
                </p>
              )}
              {detail.data.trigger && (
                <div className="workflow-steps">
                  {[
                    "Trigger: " + detail.data.trigger,
                    "Eligibility: marketing consent",
                    "Message: " + detail.data.templateId,
                    "ESP draft / simulation",
                    "Recipient interaction",
                    "Recorded analytics",
                  ].map((s, i) => (
                    <div key={s}>
                      <span>{i + 1}</span>
                      {s}
                    </div>
                  ))}
                </div>
              )}
              {kind === "form" && (
                <button
                  className="btn primary"
                  onClick={() =>
                    f.run(async () => {
                      const r = await post("/action-tokens", {
                        recipientId: "profile-1",
                        scope: "form",
                        targetId: detail.id,
                      });
                      setLink(r.url);
                    }, "Link created")
                  }
                >
                  Create recipient preview
                </button>
              )}
              {kind === "experiment" && (
                <button
                  className="btn primary"
                  onClick={() =>
                    f.run(async () => {
                      await post(`/experiments/${detail.id}/assign`, {
                        recipientId: "profile-1",
                      });
                      setResults(
                        await api(`/experiments/${detail.id}/results`),
                      );
                    }, "Stable assignment recorded")
                  }
                >
                  Assign demo recipient
                </button>
              )}
              {results?.cohorts && (
                <>
                  <table>
                    <thead>
                      <tr>
                        <th>Cohort</th>
                        <th>Sample</th>
                        <th>Conversions</th>
                        <th>Rate · 95% CI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.cohorts.map((c: any) => (
                        <tr key={c.cohort}>
                          <td>{c.cohort}</td>
                          <td>{c.sample}</td>
                          <td>{c.conversions}</td>
                          <td>
                            {(c.rate * 100).toFixed(1)}% ·{" "}
                            {(c.low * 100).toFixed(1)}–
                            {(c.high * 100).toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="muted">{results.method}</p>
                </>
              )}
              {results?.data?.steps &&
                results.data.steps.map((s: any) => (
                  <div className="version-row" key={s.step}>
                    <strong>{s.step}</strong>
                    <Badge>{s.status}</Badge>
                    <span>{s.detail}</span>
                  </div>
                ))}
              {Array.isArray(results) && (
                <div>
                  {results.map((p) => (
                    <div className="cart-line" key={p.id}>
                      <strong>{p.title}</strong>
                      <span>{dollars(p.price)}</span>
                    </div>
                  ))}
                  {!results.length && (
                    <p>
                      No products match. Configure selection IDs or category
                      through the API for a personalized feed.
                    </p>
                  )}
                </div>
              )}
              {kind === "report" && results && (
                <>
                  <strong>
                    {detail.data.metric === "revenue"
                      ? dollars(results.revenue)
                      : results[detail.data.metric] ||
                        results.counts?.[detail.data.metric] ||
                        0}
                  </strong>
                  <Chart data={results.series} />
                  <a href="/api/analytics.csv" className="btn secondary">
                    Export CSV
                  </a>
                </>
              )}
              {link && (
                <Link href={link} target="_blank" className="btn secondary">
                  Open recipient experience <ArrowUpRight size={16} />
                </Link>
              )}
              <details>
                <summary>Record details</summary>
                <pre className="source-preview">
                  {JSON.stringify(detail.data, null, 2)}
                </pre>
              </details>
            </>
          ))}
      </Modal>
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`Configure ${kind}`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void f.run(async () => {
              await api(`/records/${kind}/${editing.id}`, {
                method: "PUT",
                body: JSON.stringify({
                  name: editing.name,
                  data: JSON.parse(configuration),
                  revision: editing.revision,
                  status: editing.status,
                }),
              });
              setEditing(null);
              await load();
            }, "Configuration saved");
          }}
        >
          <label>
            Name
            <input
              required
              value={editing?.name || ""}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </label>
          <label>
            Status
            <select
              value={editing?.status || "draft"}
              onChange={(e) =>
                setEditing({ ...editing, status: e.target.value })
              }
            >
              <option>draft</option>
              <option>active</option>
              <option>published</option>
            </select>
          </label>
          <label>
            Configuration
            <textarea
              className="source-preview"
              rows={14}
              value={configuration}
              onChange={(e) => setConfiguration(e.target.value)}
            />
          </label>
          <p className="muted">
            Configure IDs, eligibility, provider associations, and rules. The
            API validates all fields before saving.
          </p>
          <button className="btn primary">Save configuration</button>
        </form>
      </Modal>
    </>
  );
}
function Integrations({ canAdmin }: { canAdmin: boolean }) {
  const [connections, setConnections] = useState<any[]>([]),
    [klaviyo, setKlaviyo] = useState<any[]>([]),
    [modal, setModal] = useState(""),
    [mode, setMode] = useState("sandbox"),
    [credential, setCredential] = useState(""),
    [shop, setShop] = useState("");
  const f = useFeedback(),
    router = useRouter();
  const load = async () => {
    setConnections(await api("/integrations"));
    setKlaviyo(await api("/klaviyo/templates"));
  };
  useEffect(() => {
    void f.run(load, "");
  }, []);
  return (
    <>
      <SectionHead
        eyebrow="YOUR STACK, WORKING TOGETHER"
        title="Better, connected."
        description="Persistent sandbox adapters are ready. Live read adapters require your own credentials."
      />
      <Feedback message={f.message} error={f.error} />
      <div className="integration-grid">
        {[
          [
            "shopify",
            "Shopify",
            "Your product catalog and merchant checkout",
            "S",
          ],
          [
            "klaviyo",
            "Klaviyo",
            "Templates, drafts, and profile properties",
            "K",
          ],
          [
            "recharge",
            "Recharge",
            "Subscription management and upcoming orders",
            "↻",
          ],
          ["reviews", "Reviews", "Persistent sandbox review receipts", "★"],
          ["sms", "SMS", "Consent records and double opt-in callbacks", "✉"],
          ["billing", "Billing", "A local subscription billing simulator", "$"],
        ].map(([id, name, desc, symbol], i) => {
          const c = connections.find((c) => c.provider === id);
          return (
            <div className="integration-card" key={id}>
              <div className="row between">
                <span
                  className={`integration-logo ${["sage", "peach", "lavender"][i % 3]}`}
                >
                  {symbol}
                </span>
                <Badge tone={c?.status === "connected" ? "green" : "gray"}>
                  {c?.status || "Not connected"}
                </Badge>
              </div>
              <h3>{name}</h3>
              <p>{desc}</p>
              <small>{c?.mode || "Sandbox available"}</small>
              <div className="row">
                <button
                  className="btn secondary"
                  disabled={!canAdmin}
                  onClick={() => {
                    setModal(id);
                    setMode("sandbox");
                    setCredential("");
                  }}
                >
                  Connect / configure
                </button>
                {c?.status === "connected" && (
                  <button
                    className="icon-button"
                    aria-label={`Disconnect ${name}`}
                    disabled={!canAdmin}
                    onClick={() =>
                      f.run(async () => {
                        await api(`/integrations/${id}`, { method: "DELETE" });
                        await load();
                      }, "Integration disconnected")
                    }
                  >
                    <Plug size={16} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="panel">
        <div className="row between">
          <h3>Klaviyo sandbox template library</h3>
          <Badge tone="gray">LOCAL PROVIDER STATE</Badge>
        </div>
        {klaviyo.map((t) => (
          <div className="version-row" key={t.id}>
            <div>
              <strong>{t.name}</strong>
              <small>Provider version {t.revision}</small>
            </div>
            <button
              className="btn secondary"
              onClick={() =>
                f.run(async () => {
                  const r = await post(`/klaviyo/import/${t.id}`);
                  router.push(`/app/builder/${r.id}`);
                }, "Imported")
              }
            >
              Import & edit <ArrowUpRight size={16} />
            </button>
          </div>
        ))}
        <p className="muted">
          Sandbox export stores HTML, AMP, plaintext, and MIME. Live Klaviyo
          template creation supports HTML; AMP delivery needs separate account
          support. Existing live templates are never overwritten.
        </p>
      </div>
      <Modal
        open={!!modal}
        onClose={() => setModal("")}
        title={`Connect ${modal}`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void f.run(async () => {
              await post(`/integrations/${modal}/connect`, {
                mode,
                credential: credential || undefined,
                shop: shop || undefined,
              });
              setModal("");
              setCredential("");
              await load();
            }, "Connection saved");
          }}
        >
          <label>
            Connection mode
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="sandbox">Local sandbox</option>
              {["shopify", "klaviyo"].includes(modal) && (
                <option value="live">Live read access · own credentials</option>
              )}
            </select>
          </label>
          {mode === "live" && (
            <>
              <label>
                Provider secret
                <input
                  type="password"
                  required
                  value={credential}
                  onChange={(e) => setCredential(e.target.value)}
                  autoComplete="off"
                />
              </label>
              {modal === "shopify" && (
                <label>
                  Shop domain
                  <input
                    placeholder="your-shop.myshopify.com"
                    value={shop}
                    required
                    onChange={(e) => setShop(e.target.value)}
                  />
                </label>
              )}
              <p>
                Connection validates read access. Credentials are encrypted at
                rest. Live mutation controls are disabled.
              </p>
              {modal === "shopify" && (
                <button
                  type="button"
                  className="btn secondary"
                  disabled={!shop || !canAdmin}
                  onClick={() =>
                    f.run(async () => {
                      const r = await post("/integrations/shopify/oauth", {
                        shop,
                      });
                      location.assign(r.url);
                    }, "Opening Shopify authorization")
                  }
                >
                  Authorize Shopify development app
                </button>
              )}
            </>
          )}
          <button className="btn primary">
            Connect {modal} <Check size={16} />
          </button>
        </form>
      </Modal>
    </>
  );
}
function AskAI() {
  const [question, setQuestion] = useState(""),
    [answer, setAnswer] = useState<any>(null),
    [busy, setBusy] = useState(false);
  const f = useFeedback();
  const ask = (q: string) =>
    f.run(async () => {
      setBusy(true);
      try {
        setAnswer(await post("/analytics/ask", { question: q }));
        setQuestion(q);
      } finally {
        setBusy(false);
      }
    }, "");
  return (
    <>
      <SectionHead
        eyebrow="A LITTLE CLARITY, ON DEMAND"
        title="Let’s make sense of your moments."
        description="A limited rule-based assistant queries allowlisted, read-only account metrics."
      />
      <div className="ai-shell">
        <span className="assistant-symbol">
          <Sparkles size={28} />
        </span>
        <h2>Your data has a story.</h2>
        <p>Ask about revenue, conversions, campaigns, or reactivations.</p>
        <div className="suggestions">
          {[
            "Which campaigns have the most conversions?",
            "What is our confirmed revenue?",
            "How many subscriptions were reactivated?",
          ].map((q) => (
            <button key={q} onClick={() => void ask(q)}>
              {q}
              <ArrowUpRight size={16} />
            </button>
          ))}
        </div>
        <form
          className="ai-input"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(question);
          }}
        >
          <input
            aria-label="Analytics question"
            placeholder="What would you like to understand?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            required
            maxLength={1000}
          />
          <button className="btn primary" disabled={busy}>
            {busy ? "Reading…" : "Ask"}
            <ArrowRight size={16} />
          </button>
        </form>
        <Feedback message={f.message} error={f.error} />
        {answer && (
          <div className="ai-answer">
            <Badge tone="gray">{answer.mode}</Badge>
            <h3>{answer.answer}</h3>
            <p className="muted">{answer.window}</p>
            <Chart data={answer.series} />
            <table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Conversions</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {answer.rows.map((r: any) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{r.conversions}</td>
                    <td>{dollars(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <a className="btn secondary" href="/api/analytics.csv">
              <Download size={16} />
              Export CSV
            </a>
          </div>
        )}
        <p className="small-note">
          Generative AI is unavailable without a configured provider. This
          assistant does not run arbitrary SQL.
        </p>
      </div>
    </>
  );
}
function Team({ canAdmin, owner }: { canAdmin: boolean; owner: boolean }) {
  const [data, setData] = useState<any>(null),
    [open, setOpen] = useState(false),
    [email, setEmail] = useState(""),
    [role, setRole] = useState("editor"),
    [url, setUrl] = useState("");
  const f = useFeedback();
  const load = () => api("/team").then(setData);
  useEffect(() => {
    void f.run(load, "");
  }, []);
  return (
    <>
      <SectionHead
        title="Good work, together."
        description="Invite teammates and give each person the right access."
        action={
          <button
            className="btn primary"
            disabled={!canAdmin}
            onClick={() => setOpen(true)}
          >
            <Plus size={16} />
            Invite teammate
          </button>
        }
      />
      <Feedback message={f.message} error={f.error} />
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Teammate</th>
              <th>Email</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {data?.members.map((m: any) => (
              <tr key={m.id}>
                <td>
                  <strong>{m.name}</strong>
                </td>
                <td>{m.email}</td>
                <td>
                  {owner && m.role !== "owner" ? (
                    <select
                      value={m.role}
                      aria-label={`Role for ${m.name}`}
                      onChange={(e) =>
                        f.run(async () => {
                          await api(`/team/${m.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ role: e.target.value }),
                          });
                          await load();
                        }, "Role updated")
                      }
                    >
                      {["admin", "editor", "analyst", "viewer"].map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  ) : (
                    <Badge tone="gray">{m.role}</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>Pending invitations</h3>
        {data?.invitations
          .filter((i: any) => !i.accepted_at)
          .map((i: any) => (
            <div className="version-row" key={i.id}>
              <span>{i.email}</span>
              <Badge tone="gray">{i.role}</Badge>
              <small>
                Expires {new Date(i.expires_at).toLocaleDateString()}
              </small>
            </div>
          ))}
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Invite a teammate"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void f.run(async () => {
              const r = await post("/team/invite", { email, role });
              setUrl(r.inviteUrl);
              await load();
            }, "Invitation created. Copy the link; no email was sent.");
          }}
        >
          <label>
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Role
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {(owner
                ? ["admin", "editor", "analyst", "viewer"]
                : ["editor", "analyst", "viewer"]
              ).map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <button className="btn primary">Create invitation</button>
        </form>
        {url && (
          <label>
            Invitation link
            <input readOnly value={url} onFocus={(e) => e.target.select()} />
          </label>
        )}
      </Modal>
    </>
  );
}
function Billing({ owner }: { owner: boolean }) {
  const [data, setData] = useState<any>(null),
    [plan, setPlan] = useState<any>(null);
  const f = useFeedback();
  const load = () => api("/billing").then(setData);
  useEffect(() => {
    void f.run(load, "");
  }, []);
  return (
    <>
      <SectionHead
        title="A little room to grow."
        description="Original InboxFlow plans. All billing in this environment is simulated."
      />
      <Feedback message={f.message} error={f.error} />
      {data && (
        <>
          <div className="panel row between">
            <div>
              <Badge tone="amber">LOCAL BILLING SIMULATOR</Badge>
              <h2>
                {data.subscription.data.plan} · {data.subscription.data.status}
              </h2>
              <p>
                {data.usage.activeSubscribers} active subscribers · event usage
                tracked independently.
              </p>
              <p>
                {data.quota.active} of {data.quota.limit} published templates.
              </p>
            </div>
            <CreditCard size={38} />
          </div>
          <div className="plans">
            {data.plans.map((p: any) => (
              <div className="plan" key={p.id}>
                <h2>{p.name}</h2>
                <div className="plan-price">
                  ${p.price}
                  <small>/month</small>
                </div>
                <p>{p.templates} active templates</p>
                <p>All block categories · persisted analytics</p>
                <button
                  className="btn primary full"
                  disabled={!owner || data.subscription.data.plan === p.id}
                  onClick={() => setPlan(p)}
                >
                  {data.subscription.data.plan === p.id
                    ? "Current plan"
                    : `Choose ${p.name}`}
                </button>
              </div>
            ))}
          </div>
          <div className="panel">
            <h3>Usage metering</h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Event type</th>
                    <th>Recorded usage</th>
                  </tr>
                </thead>
                <tbody>
                  {data.usage.events.map((r: any) => (
                    <tr key={r.event_type}>
                      <td>{r.event_type}</td>
                      <td>{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <Modal
        open={!!plan}
        onClose={() => setPlan(null)}
        title="Confirm simulated plan change"
      >
        <p>Change to {plan?.name}? No real charge or Stripe request occurs.</p>
        <button
          className="btn primary"
          onClick={() =>
            f.run(async () => {
              await post("/billing/change", { plan: plan.id, confirm: true });
              setPlan(null);
              await load();
            }, "Sandbox plan changed")
          }
        >
          Confirm plan
        </button>
        {data?.stripeTestAvailable && (
          <button
            className="btn secondary"
            disabled={!owner}
            onClick={() =>
              f.run(async () => {
                const r = await post(
                  "/billing/stripe-test-checkout",
                  { plan: plan.id, confirm: true },
                  { "Idempotency-Key": crypto.randomUUID() },
                );
                location.assign(r.url);
              }, "Opening Stripe test checkout")
            }
          >
            Use Stripe test checkout
          </button>
        )}
      </Modal>
    </>
  );
}
function OrganizationSettings({ canAdmin }: { canAdmin: boolean }) {
  const [data, setData] = useState<any>(null),
    [audit, setAudit] = useState<any[]>([]),
    [profiles, setProfiles] = useState<any[]>([]),
    [credentials, setCredentials] = useState<any[]>([]),
    [keyName, setKeyName] = useState(""),
    [key, setKey] = useState(""),
    [deleteProfile, setDeleteProfile] = useState(""),
    [privacyConfirm, setPrivacyConfirm] = useState(false);
  const f = useFeedback();
  const load = async () => {
    setData(await api("/settings"));
    if (canAdmin) {
      setAudit(await api("/audit"));
      setProfiles(await api("/records/profile"));
      setCredentials(await api("/credentials"));
    }
  };
  useEffect(() => {
    void f.run(load, "");
  }, []);
  return (
    <>
      <SectionHead
        title="Make this workspace yours."
        description="Organization preferences, access credentials, and customer privacy."
      />
      <Feedback message={f.message} error={f.error} />
      {data && (
        <div className="settings-grid">
          <form
            className="panel"
            onSubmit={(e) => {
              e.preventDefault();
              void f.run(async () => {
                await api("/settings", {
                  method: "PATCH",
                  body: JSON.stringify({
                    name: data.name,
                    settings: {
                      liveFlowSync: !!data.settings.liveFlowSync,
                      retentionDays: data.settings.retentionDays || 365,
                    },
                  }),
                });
              }, "Organization settings saved");
            }}
          >
            <h3>Organization</h3>
            <label>
              Name
              <input
                value={data.name}
                disabled={!canAdmin}
                onChange={(e) => setData({ ...data, name: e.target.value })}
                required
              />
            </label>
            <label>
              Retention days
              <input
                type="number"
                min="7"
                max="3650"
                value={data.settings.retentionDays || 365}
                onChange={(e) =>
                  setData({
                    ...data,
                    settings: {
                      ...data.settings,
                      retentionDays: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={!!data.settings.liveFlowSync}
                disabled={!canAdmin}
                onChange={(e) =>
                  setData({
                    ...data,
                    settings: {
                      ...data.settings,
                      liveFlowSync: e.target.checked,
                    },
                  })
                }
              />
              <span>
                Organization opt-in for future live flow sync. Automatic live
                sync is currently unavailable.
              </span>
            </label>
            <button className="btn primary" disabled={!canAdmin}>
              Save settings
            </button>
          </form>
          <div className="panel">
            <h3>Privacy & customer data</h3>
            <p>
              Export tenant customer records or delete a profile and associated
              local data. Legal review is required before launch.
            </p>
            <button
              className="btn secondary"
              disabled={!canAdmin}
              onClick={() =>
                f.run(
                  async () =>
                    download(
                      "customer-data.json",
                      JSON.stringify(await api("/privacy/export"), null, 2),
                      "application/json",
                    ),
                  "Export ready",
                )
              }
            >
              <Download size={16} />
              Export customer data
            </button>
            <label>
              Customer profile
              <select
                value={deleteProfile}
                onChange={(e) => setDeleteProfile(e.target.value)}
              >
                <option value="">Choose a profile</option>
                {profiles.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn danger"
              disabled={!canAdmin || !deleteProfile}
              onClick={() => setPrivacyConfirm(true)}
            >
              Delete selected profile
            </button>
          </div>
          {canAdmin && (
            <div className="panel">
              <h3>API credentials</h3>
              <p>Keys provide tenant-scoped, read-only metrics access.</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void f.run(async () => {
                    const r = await post("/credentials", { name: keyName });
                    setKey(r.key);
                    setCredentials(await api("/credentials"));
                  }, "Key created and shown once");
                }}
              >
                <label>
                  Key name
                  <input
                    value={keyName}
                    required
                    onChange={(e) => setKeyName(e.target.value)}
                  />
                </label>
                <button className="btn secondary">Create API key</button>
              </form>
              {key && (
                <label>
                  Save this key securely
                  <input
                    readOnly
                    value={key}
                    onFocus={(e) => e.target.select()}
                  />
                </label>
              )}
              {credentials.map((c) => (
                <div className="version-row" key={c.id}>
                  <span>{c.name}</span>
                  <Badge tone="gray">{c.status}</Badge>
                  <button
                    className="icon-button"
                    disabled={c.status === "revoked"}
                    aria-label={`Revoke ${c.name}`}
                    onClick={() =>
                      f.run(async () => {
                        await api(`/credentials/${c.id}`, { method: "DELETE" });
                        setCredentials(await api("/credentials"));
                      }, "Key revoked")
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {canAdmin && (
        <div className="panel">
          <h3>Audit trail</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Recorded</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td>{a.action}</td>
                    <td>{a.actor_id.slice(0, 16)}</td>
                    <td>{new Date(a.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Modal
        open={privacyConfirm}
        onClose={() => setPrivacyConfirm(false)}
        title="Delete customer data"
      >
        {f.error && <Feedback message={f.message} error />}
        <p>
          Delete the selected profile, its responses, consent, interaction
          tokens, and associated local records? This cannot be undone.
        </p>
        <button
          className="btn danger"
          onClick={() =>
            f.run(async () => {
              await api(`/privacy/profile/${deleteProfile}`, {
                method: "DELETE",
              });
              setPrivacyConfirm(false);
              setDeleteProfile("");
              await load();
            }, "Profile and associated local records deleted")
          }
        >
          Confirm customer deletion
        </button>
      </Modal>
    </>
  );
}
function Account({ me }: { me: any }) {
  const [name, setName] = useState(me.user.name),
    [organization, setOrganization] = useState("");
  const f = useFeedback();
  return (
    <>
      <SectionHead
        title="A space that feels like you."
        description="Your profile and organizations."
      />
      <Feedback message={f.message} error={f.error} />
      <div className="settings-grid">
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            void f.run(async () => {
              await api("/account", {
                method: "PATCH",
                body: JSON.stringify({ name }),
              });
            }, "Profile saved");
          }}
        >
          <h3>Account settings</h3>
          <label>
            Your name
            <input
              value={name}
              required
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Email
            <input value={me.user.email} readOnly />
          </label>
          <button className="btn primary">Save profile</button>
        </form>
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            void f.run(async () => {
              await post("/organizations", { name: organization });
              location.reload();
            }, "Organization created");
          }}
        >
          <h3>Create another organization</h3>
          <label>
            Organization name
            <input
              value={organization}
              required
              onChange={(e) => setOrganization(e.target.value)}
            />
          </label>
          <button className="btn secondary">
            <Plus size={16} />
            Create organization
          </button>
        </form>
      </div>
    </>
  );
}
function Blocks({ canEdit }: { canEdit: boolean }) {
  const [filter, setFilter] = useState("All"),
    [selected, setSelected] = useState("");
  const f = useFeedback(),
    router = useRouter();
  return (
    <>
      <SectionHead
        title="There’s a block for that."
        description="Reusable blocks with editor settings, generated email output, and hosted recipient experiences."
      />
      <Feedback message={f.message} error={f.error} />
      <div className="toolbar">
        <div className="tabs">
          {["All", "Content", "Commerce", "Capture", "Engagement"].map((t) => (
            <button
              className={filter === t ? "active" : ""}
              key={t}
              onClick={() => setFilter(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="block-gallery">
        {blockTypes
          .filter(
            (t) =>
              filter === "All" ||
              (filter === "Content"
                ? [
                    "heading",
                    "paragraph",
                    "hero",
                    "button",
                    "image",
                    "columns",
                    "divider",
                    "spacer",
                    "footer",
                  ].includes(t)
                : filter === "Commerce"
                  ? [
                      "product",
                      "product-grid",
                      "product-carousel",
                      "cart",
                      "subscription",
                      "reactivation",
                      "swap",
                      "action",
                    ].includes(t)
                  : filter === "Capture"
                    ? ["form", "quiz", "review", "sms"].includes(t)
                    : [
                        "image-carousel",
                        "flip",
                        "reveal",
                        "spin",
                        "animation",
                      ].includes(t)),
          )
          .map((t) => (
            <button
              className="panel block-tile"
              key={t}
              onClick={() => setSelected(t)}
            >
              <span>
                {t === "subscription" ? "↻" : t.includes("product") ? "◈" : "✦"}
              </span>
              <h3>{t.replaceAll("-", " ")}</h3>
              <p>Configure · preview · persist</p>
              <ArrowUpRight size={18} />
            </button>
          ))}
      </div>
      <Modal
        open={!!selected}
        onClose={() => setSelected("")}
        title={selected.replaceAll("-", " ")}
      >
        <p>
          Static HTML includes a hosted fallback. AMP is generated where
          supported; branching, rewards, and advanced actions use the secure
          hosted experience.
        </p>
        <button
          className="btn primary"
          disabled={!canEdit}
          onClick={() =>
            f.run(async () => {
              const b = newBlock(selected as any);
              if (selected.includes("product")) b.productIds = ["product-1"];
              if (selected === "form" || selected === "quiz")
                b.formId = "form-ritual";
              const r = await post(
                "/templates",
                documentSchema.parse({
                  name: `${selected} experience`,
                  subject: "A little moment made for you",
                  blocks: [newBlock("hero"), b, newBlock("footer")],
                }),
              );
              router.push(`/app/builder/${r.id}`);
            }, "Template created")
          }
        >
          Build with this block <Plus size={16} />
        </button>
      </Modal>
    </>
  );
}
