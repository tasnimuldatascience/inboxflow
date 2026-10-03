"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  Undo2,
  Redo2,
  Eye,
  Upload,
  Download,
  Copy,
  Trash2,
  GripVertical,
  Monitor,
  Smartphone,
  Save,
  History,
  Sparkles,
  Plus,
  ChevronUp,
  ChevronDown,
  Bookmark,
  Layers,
} from "lucide-react";
import { api, post, download, dollars } from "../lib/api";
import { useEditor } from "../lib/editor-store";
import {
  newBlock,
  type EmailBlock,
  type Product,
  type EmailDocument,
} from "../../../../packages/shared/src/index";
import { Modal, Feedback, Loading, Badge } from "./ui";
export function Editor({
  id,
  canEdit = true,
}: {
  id: string;
  canEdit?: boolean;
}) {
  const store = useEditor(),
    { document: doc, selected, dirty, generation } = store;
  const [revision, setRevision] = useState(1),
    [status, setStatus] = useState("draft"),
    [products, setProducts] = useState<Product[]>([]),
    [profiles, setProfiles] = useState<any[]>([]),
    [recipient, setRecipient] = useState(""),
    [loaded, setLoaded] = useState(false),
    [forms, setForms] = useState<any[]>([]),
    [saved, setSaved] = useState<any[]>([]),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false),
    [mobile, setMobile] = useState(false),
    [preview, setPreview] = useState<any>(null),
    [previewMode, setPreviewMode] = useState("html"),
    [versions, setVersions] = useState<any[] | null>(null),
    [tab, setTab] = useState("Content"),
    [command, setCommand] = useState(""),
    [proposal, setProposal] = useState<any>(null),
    [saving, setSaving] = useState(false),
    [blockFilter, setBlockFilter] = useState("All");
  const saveLock = useRef(false),
    revisionRef = useRef(revision);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  useEffect(() => {
    let active = true;
    Promise.all([
      api(`/templates/${id}`),
      api("/products"),
      api("/records/form"),
      api("/records/saved-block"),
      api("/records/profile"),
    ])
      .then(([t, p, f, s, ps]) => {
        if (!active) return;
        useEditor.getState().load(t.document);
        setLoaded(true);
        setRevision(t.revision);
        revisionRef.current = t.revision;
        setStatus(t.status);
        setProducts(p);
        setForms(f);
        setSaved(s);
        setProfiles(ps);
        setRecipient(
          ps.find((p: any) => p.id === "profile-1")?.id || ps[0]?.id || "",
        );
      })
      .catch((e) => {
        setMessage(e.message);
        setError(true);
      });
    return () => {
      active = false;
    };
  }, [id]);
  const save = useCallback(
    async (publish = false) => {
      if (saveLock.current || !canEdit) return false;
      const state = useEditor.getState();
      if (!state.document || !loaded) return false;
      if (!state.dirty && !publish) return true;
      saveLock.current = true;
      setSaving(true);
      try {
        const row = await api(`/templates/${id}`, {
          method: "PUT",
          body: JSON.stringify({
            document: state.document,
            revision: revisionRef.current,
            status: publish ? "published" : status,
          }),
        });
        revisionRef.current = row.revision;
        setRevision(row.revision);
        setStatus(row.status);
        state.markSaved(state.generation);
        setError(false);
        setMessage(
          publish
            ? "Published locally. Export a draft to your ESP when ready."
            : "All changes saved.",
        );
        return true;
      } catch (e) {
        setError(true);
        setMessage((e as Error).message);
        return false;
      } finally {
        saveLock.current = false;
        setSaving(false);
      }
    },
    [id, canEdit, loaded, status],
  );
  useEffect(() => {
    if (!dirty || !canEdit) return;
    const timer = setTimeout(() => void save(), 1400);
    return () => clearTimeout(timer);
  }, [generation, dirty, save, canEdit]);
  const block = doc?.blocks.find((b) => b.id === selected);
  const execute = async (fn: () => Promise<unknown>) => {
    try {
      setMessage("");
      await fn();
      setError(false);
    } catch (e) {
      setError(true);
      setMessage((e as Error).message);
    }
  };
  const renderPreview = () =>
    execute(async () => {
      if (!(await save()))
        throw Error("Save your changes successfully before previewing.");
      const result = await post(`/templates/${id}/render`, {
        recipientId: recipient || undefined,
      });
      setPreview(result);
      setPreviewMode("html");
    });
  const add = (type: EmailBlock["type"], index?: number) => {
    if (!canEdit) return;
    const b = newBlock(type);
    if (type.includes("product") || type === "cart")
      b.productIds = products.slice(0, 3).map((p) => p.id);
    if (["form", "quiz"].includes(type)) b.formId = forms[0]?.id;
    store.edit((d) => d.blocks.splice(index ?? d.blocks.length, 0, b));
    store.select(b.id);
  };
  const patch = (part: Partial<EmailBlock>) => {
    if (!block || !canEdit) return;
    store.edit((d) => {
      const i = d.blocks.findIndex((b) => b.id === block.id);
      d.blocks[i] = { ...d.blocks[i], ...part };
    });
  };
  const reorder = (event: DragEndEvent) => {
    if (!canEdit || !event.over || event.active.id === event.over.id) return;
    if (event.active.data.current?.type) {
      const index = doc?.blocks.findIndex((b) => b.id === event.over!.id);
      add(
        event.active.data.current.type,
        index === undefined || index < 0 ? undefined : index,
      );
      return;
    }
    store.edit((d) => {
      const from = d.blocks.findIndex((b) => b.id === event.active.id),
        to = d.blocks.findIndex((b) => b.id === event.over!.id);
      if (from < 0 || to < 0) return;
      const [b] = d.blocks.splice(from, 1);
      d.blocks.splice(to, 0, b);
    });
  };
  if (!loaded || !doc)
    return (
      <>
        <Feedback message={message} error={error} />
        {!error && <Loading />}
      </>
    );
  const categories: Record<string, string[]> = {
    Content: [
      "heading",
      "paragraph",
      "image",
      "button",
      "divider",
      "spacer",
      "columns",
      "hero",
      "footer",
    ],
    Commerce: [
      "product",
      "product-grid",
      "product-carousel",
      "cart",
      "subscription",
      "reactivation",
      "swap",
      "action",
    ],
    Capture: ["form", "quiz", "review", "sms"],
    Engagement: ["image-carousel", "flip", "reveal", "spin", "animation"],
  };
  return (
    <div className="editor">
      <div className="editor-toolbar">
        <Link
          href="/app/templates"
          className="icon-button"
          aria-label="Back to templates"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="editor-name">
          <input
            aria-label="Template name"
            value={doc.name}
            disabled={!canEdit}
            onChange={(e) => {
              if (e.target.value)
                store.edit((d) => {
                  d.name = e.target.value;
                });
            }}
          />
          <small>
            {saving ? "Saving…" : dirty ? "Unsaved changes" : "✓ Saved"} · v
            {revision} · {status}
          </small>
        </div>
        <div className="row editor-tools">
          <button
            className="icon-button"
            aria-label="Undo"
            onClick={store.undo}
            disabled={!store.past.length || !canEdit}
          >
            <Undo2 size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Redo"
            onClick={store.redo}
            disabled={!store.future.length || !canEdit}
          >
            <Redo2 size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Version history"
            onClick={() =>
              execute(async () =>
                setVersions(await api(`/templates/${id}/versions`)),
              )
            }
          >
            <History size={18} />
          </button>
          <button
            className="btn secondary"
            onClick={renderPreview}
            disabled={!canEdit}
          >
            <Eye size={16} />
            Preview
          </button>
          <button
            className="btn secondary"
            onClick={() => void save()}
            disabled={!canEdit || saving}
          >
            <Save size={16} />
            Save
          </button>
          <button
            className="btn primary"
            onClick={() => void save(true)}
            disabled={!canEdit || saving}
          >
            <Upload size={16} />
            Publish
          </button>
        </div>
      </div>
      <Feedback message={message} error={error} />
      <DndContext
        sensors={sensors}
        collisionDetection={(args) =>
          closestCenter({
            ...args,
            droppableContainers: args.droppableContainers.filter((container) =>
              doc.blocks.length
                ? doc.blocks.some((block) => block.id === container.id)
                : container.id === "canvas-drop",
            ),
          })
        }
        onDragEnd={reorder}
      >
        <div className="editor-workspace">
          <aside className="block-library">
            <div className="row between">
              <h3>Make it your own</h3>
              <Layers size={18} />
            </div>
            <p>
              Click or drag a block to add it. Drag canvas blocks to reorder.
            </p>
            <label className="sr-only" htmlFor="block-category">
              Block category
            </label>
            <select
              id="block-category"
              value={blockFilter}
              onChange={(e) => setBlockFilter(e.target.value)}
            >
              <option>All</option>
              {Object.keys(categories).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            {Object.entries(categories)
              .filter(([c]) => blockFilter === "All" || c === blockFilter)
              .map(([category, types]) => (
                <section key={category}>
                  <div className="eyebrow">{category}</div>
                  <div className="block-buttons">
                    {types.map((type) => (
                      <LibraryBlock
                        key={type}
                        type={type as EmailBlock["type"]}
                        canEdit={canEdit}
                        add={() => add(type as EmailBlock["type"])}
                      />
                    ))}
                  </div>
                </section>
              ))}
            {!!saved.length && (
              <section>
                <div className="eyebrow">SAVED BLOCKS</div>
                {saved.map((s) => (
                  <button
                    className="saved-block"
                    disabled={!canEdit}
                    key={s.id}
                    onClick={() => {
                      store.edit((d) =>
                        d.blocks.push({ ...s.data, id: crypto.randomUUID() }),
                      );
                    }}
                  >
                    {s.name}
                    <Plus size={13} />
                  </button>
                ))}
              </section>
            )}
            <Link href="/app/templates" className="text-link">
              Browse templates →
            </Link>
          </aside>
          <main className="editor-center">
            <div className="canvas-controls">
              <span>EMAIL CANVAS</span>
              <select
                aria-label="Preview recipient"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
              >
                <option value="">Anonymous preview</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <div className="segmented">
                <button
                  onClick={() => setMobile(false)}
                  className={!mobile ? "active" : ""}
                  aria-label="Desktop canvas"
                >
                  <Monitor size={17} />
                </button>
                <button
                  onClick={() => setMobile(true)}
                  className={mobile ? "active" : ""}
                  aria-label="Mobile canvas"
                >
                  <Smartphone size={17} />
                </button>
              </div>
              <Badge tone="gray">Hosted simulation</Badge>
            </div>
            <div
              className={`email-canvas ${mobile ? "mobile" : ""}`}
              style={{ background: doc.theme.background }}
            >
              <CanvasDrop>
                <SortableContext
                  items={doc.blocks.map((b) => b.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {doc.blocks.map((b, i) => (
                    <SortableBlock
                      key={b.id}
                      block={b}
                      selected={b.id === selected}
                      products={products}
                      canEdit={canEdit}
                      select={() => store.select(b.id)}
                      onContent={(content) => {
                        store.edit((d) => {
                          d.blocks[i].content = content;
                        });
                      }}
                    />
                  ))}
                </SortableContext>
              </CanvasDrop>
              {!doc.blocks.length && (
                <div className="empty">
                  <h3>Every great email starts somewhere.</h3>
                  <p>Add your first block from the library.</p>
                  <button className="btn secondary" onClick={() => add("hero")}>
                    Add a hero
                  </button>
                </div>
              )}
            </div>
          </main>
          <aside className="block-settings">
            <div className="tabs compact">
              {["Content", "Styling", "Visibility", "Refine"].map((t) => (
                <button
                  key={t}
                  className={tab === t ? "active" : ""}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            {tab === "Refine" ? (
              <>
                <span className="assistant-symbol">
                  <Sparkles size={24} />
                </span>
                <h3>A little help, right here.</h3>
                <p>
                  Deterministic local assistant. Preview typed operations before
                  applying them.
                </p>
                <label>
                  Your edit command
                  <textarea
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    placeholder="headline: Your daily ritual, on your terms"
                  />
                </label>
                <button
                  className="btn primary full"
                  disabled={!canEdit || !command}
                  onClick={() =>
                    execute(async () =>
                      setProposal(
                        await post(`/templates/${id}/refine`, {
                          command,
                          selected: selected || undefined,
                          document: doc,
                        }),
                      ),
                    )
                  }
                >
                  Preview suggestion <Sparkles size={16} />
                </button>
                {proposal && (
                  <div className="proposal">
                    <small>{proposal.mode}</small>
                    <p>{proposal.explanation}</p>
                    <pre>{JSON.stringify(proposal.operations, null, 2)}</pre>
                    <button
                      className="btn primary full"
                      disabled={!proposal.operations.length}
                      onClick={() => {
                        store.operate(proposal.operations);
                        setProposal(null);
                        setMessage("Suggestion applied. Undo is available.");
                      }}
                    >
                      Apply operations
                    </button>
                  </div>
                )}
              </>
            ) : block ? (
              <>
                <div className="row between">
                  <h3>{block.type.replaceAll("-", " ")}</h3>
                  <Badge tone="gray">Selected</Badge>
                </div>
                {tab === "Content" && (
                  <>
                    <label>
                      Content
                      <textarea
                        value={block.content}
                        disabled={!canEdit}
                        onChange={(e) => patch({ content: e.target.value })}
                      />
                    </label>
                    {block.type === "image" && (
                      <label>
                        Upload image
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          disabled={!canEdit}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            void execute(async () => {
                              if (file.size > 2000000)
                                throw Error("Images must be smaller than 2 MB");
                              const base64 = await new Promise<string>(
                                (resolve, reject) => {
                                  const reader = new FileReader();
                                  reader.onload = () =>
                                    resolve(
                                      String(reader.result).split(",")[1],
                                    );
                                  reader.onerror = () =>
                                    reject(Error("Image could not be read"));
                                  reader.readAsDataURL(file);
                                },
                              );
                              const asset = await post("/assets", {
                                name: file.name,
                                base64,
                              });
                              patch({ url: asset.url });
                              setMessage(
                                "Image uploaded and added to this block.",
                              );
                            });
                          }}
                        />
                      </label>
                    )}
                    {["image", "button"].includes(block.type) && (
                      <label>
                        URL
                        <input
                          value={block.url || ""}
                          onChange={(e) => {
                            if (
                              e.target.value.startsWith("https://") ||
                              e.target.value.startsWith("/")
                            )
                              patch({ url: e.target.value });
                          }}
                          placeholder="https://…"
                        />
                      </label>
                    )}
                    {[
                      "product",
                      "product-grid",
                      "product-carousel",
                      "cart",
                      "review",
                      "swap",
                    ].includes(block.type) && (
                      <label>
                        Product selection
                        <div className="product-selection">
                          {products.map((p) => (
                            <label key={p.id}>
                              <input
                                type="checkbox"
                                checked={block.productIds.includes(p.id)}
                                onChange={(e) =>
                                  patch({
                                    productIds: e.target.checked
                                      ? [...block.productIds, p.id]
                                      : block.productIds.filter(
                                          (id) => id !== p.id,
                                        ),
                                  })
                                }
                              />
                              <span>
                                {p.title}
                                <small>{dollars(p.price)}</small>
                              </span>
                            </label>
                          ))}
                        </div>
                      </label>
                    )}
                    {["form", "quiz"].includes(block.type) && (
                      <label>
                        Form
                        <select
                          value={block.formId || ""}
                          onChange={(e) => patch({ formId: e.target.value })}
                        >
                          <option value="">Select a form</option>
                          {forms.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label>
                      Success message
                      <input
                        value={block.success}
                        onChange={(e) => patch({ success: e.target.value })}
                      />
                    </label>
                    <label>
                      Error message
                      <input
                        value={block.failure}
                        onChange={(e) => patch({ failure: e.target.value })}
                      />
                    </label>
                    <label>
                      Confirmation wording
                      <input
                        value={block.confirmation}
                        onChange={(e) =>
                          patch({ confirmation: e.target.value })
                        }
                      />
                    </label>
                  </>
                )}
                {tab === "Styling" && (
                  <>
                    {(["color", "background"] as const).map((key) => (
                      <label key={key}>
                        {key}
                        <div className="row">
                          <input
                            aria-label={key}
                            type="color"
                            value={block.style[key]}
                            onChange={(e) =>
                              patch({
                                style: {
                                  ...block.style,
                                  [key]: e.target.value,
                                },
                              })
                            }
                          />
                          <code>{block.style[key]}</code>
                        </div>
                      </label>
                    ))}
                    {(["fontSize", "padding", "radius", "height"] as const).map(
                      (key) => (
                        <label key={key}>
                          {
                            (
                              {
                                fontSize: "Font size",
                                padding: "Padding",
                                radius: "Corner radius",
                                height: "Height",
                              } as any
                            )[key]
                          }{" "}
                          · {block.style[key]}px
                          <input
                            type="range"
                            min={
                              key === "fontSize"
                                ? 10
                                : key === "height"
                                  ? 10
                                  : 0
                            }
                            max={
                              key === "fontSize"
                                ? 72
                                : key === "padding"
                                  ? 80
                                  : key === "radius"
                                    ? 40
                                    : 800
                            }
                            value={block.style[key]}
                            onChange={(e) =>
                              patch({
                                style: {
                                  ...block.style,
                                  [key]: Number(e.target.value),
                                },
                              })
                            }
                          />
                        </label>
                      ),
                    )}
                    <label>
                      Alignment
                      <select
                        value={block.style.align}
                        onChange={(e) =>
                          patch({
                            style: {
                              ...block.style,
                              align: e.target.value as any,
                            },
                          })
                        }
                      >
                        <option>left</option>
                        <option>center</option>
                        <option>right</option>
                      </select>
                    </label>
                  </>
                )}
                {tab === "Visibility" && (
                  <>
                    <label>
                      Show this block to
                      <select
                        value={block.visibility}
                        onChange={(e) =>
                          patch({ visibility: e.target.value as any })
                        }
                      >
                        <option value="all">All recipients</option>
                        <option value="subscribers">Active subscribers</option>
                        <option value="non-subscribers">Non-subscribers</option>
                      </select>
                    </label>
                    <p>
                      Recipient subscription state is resolved when generating
                      personalized previews.
                    </p>
                  </>
                )}
                <div className="block-actions">
                  <button
                    className="btn secondary"
                    disabled={!canEdit}
                    onClick={() => {
                      const b = {
                        ...structuredClone(block),
                        id: crypto.randomUUID(),
                      };
                      store.edit((d) =>
                        d.blocks.splice(
                          d.blocks.findIndex((v) => v.id === block.id) + 1,
                          0,
                          b,
                        ),
                      );
                      store.select(b.id);
                    }}
                  >
                    <Copy size={15} />
                    Duplicate
                  </button>
                  <button
                    className="btn secondary"
                    disabled={!canEdit}
                    onClick={() =>
                      execute(async () => {
                        await post("/records/saved-block", {
                          name: block.content.slice(0, 80) || block.type,
                          data: block,
                        });
                        setSaved(await api("/records/saved-block"));
                        setMessage("Block saved to your library.");
                      })
                    }
                  >
                    <Bookmark size={15} />
                    Save block
                  </button>
                  <div className="row">
                    <button
                      className="btn secondary"
                      aria-label="Move block up"
                      onClick={() => {
                        const index = doc.blocks.findIndex(
                          (b) => b.id === selected,
                        );
                        if (index > 0)
                          store.operate([
                            { op: "move", blockId: block.id, index: index - 1 },
                          ]);
                      }}
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      className="btn secondary"
                      aria-label="Move block down"
                      onClick={() => {
                        const index = doc.blocks.findIndex(
                          (b) => b.id === selected,
                        );
                        store.operate([
                          { op: "move", blockId: block.id, index: index + 1 },
                        ]);
                      }}
                    >
                      <ChevronDown size={16} />
                    </button>
                    <button
                      className="btn danger"
                      disabled={!canEdit}
                      onClick={() => {
                        store.operate([{ op: "remove", blockId: block.id }]);
                        store.select(null);
                      }}
                    >
                      <Trash2 size={15} />
                      Remove
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="empty">
                <h3>A blank canvas of possibilities.</h3>
                <p>
                  Select a block to edit its content, style, and visibility.
                </p>
                <label>
                  Subject line
                  <input
                    value={doc.subject}
                    disabled={!canEdit}
                    onChange={(e) => {
                      if (e.target.value)
                        store.edit((d) => {
                          d.subject = e.target.value;
                        });
                    }}
                  />
                </label>
                <label>
                  Preview text
                  <input
                    value={doc.preheader}
                    onChange={(e) =>
                      store.edit((d) => {
                        d.preheader = e.target.value;
                      })
                    }
                  />
                </label>
              </div>
            )}
          </aside>
        </div>
      </DndContext>
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title="Preview & export"
      >
        {preview && (
          <>
            <div className="tabs">
              {[
                ["html", "Outlook / static HTML"],
                ["apple", "Apple Mail · static HTML"],
                ["amp", "Gmail / Yahoo AMP source"],
                ["text", "Plain text"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={previewMode === key ? "active" : ""}
                  onClick={() => setPreviewMode(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <Badge
              tone={preview.ampValidation.status === "PASS" ? "green" : "amber"}
            >
              AMP validator: {preview.ampValidation.status}
            </Badge>
            <p>
              All client previews are simulations. AMP source is validated
              separately; no real inbox test is claimed.
            </p>
            {["html", "apple"].includes(previewMode) ? (
              <iframe
                title="Email preview"
                sandbox=""
                srcDoc={preview.html}
                className="email-preview"
              />
            ) : (
              <pre className="source-preview">{preview[previewMode]}</pre>
            )}
            {preview.ampValidation.errors.map((e: any, i: number) => (
              <p className="validation-error" key={i}>
                {e.message}
              </p>
            ))}
            {preview.warnings.map((w: string) => (
              <p className="muted" key={w}>
                {w}
              </p>
            ))}
            <div className="row wrap">
              <button
                className="btn primary"
                onClick={() =>
                  download("email.eml", preview.mime, "message/rfc822")
                }
              >
                <Download size={16} />
                Download MIME
              </button>
              <button
                className="btn secondary"
                onClick={() =>
                  download("email.html", preview.html, "text/html")
                }
              >
                HTML
              </button>
              <button
                className="btn secondary"
                onClick={() =>
                  download("email.amp.html", preview.amp, "text/html")
                }
              >
                AMP
              </button>
              <button
                className="btn secondary"
                onClick={() => download("email.txt", preview.text)}
              >
                Plain text
              </button>
              <button
                className="btn secondary"
                onClick={() =>
                  execute(async () => {
                    const r = await post(
                      `/klaviyo/export/${id}`,
                      {},
                      { "Idempotency-Key": crypto.randomUUID() },
                    );
                    setMessage(
                      `Sandbox Klaviyo draft exported: ${r.providerId}`,
                    );
                    setPreview(null);
                  })
                }
              >
                <Upload size={16} />
                Export sandbox draft
              </button>
            </div>
            {Object.entries(preview.links).map(([id, url]) => (
              <Link
                key={id}
                href={url as string}
                target="_blank"
                className="text-link"
              >
                Open recipient experience ↗
              </Link>
            ))}
          </>
        )}
      </Modal>
      <Modal
        open={!!versions}
        onClose={() => setVersions(null)}
        title="Version history"
      >
        {versions?.map((v) => (
          <div className="version-row" key={v.revision}>
            <div>
              <strong>Version {v.revision}</strong>
              <small>{new Date(v.created_at).toLocaleString()}</small>
            </div>
            <button
              className="btn secondary"
              disabled={!canEdit}
              onClick={() => {
                store.edit((d) =>
                  Object.assign(d, v.document as EmailDocument),
                );
                setVersions(null);
                setMessage(
                  "Version restored to canvas. Saving creates a new revision.",
                );
              }}
            >
              Restore
            </button>
          </div>
        ))}
      </Modal>
    </div>
  );
}
function LibraryBlock({
  type,
  canEdit,
  add,
}: {
  type: EmailBlock["type"];
  canEdit: boolean;
  add: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: `library-${type}`, data: { type }, disabled: !canEdit });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 50 : undefined,
      }}
      aria-label={`Add ${type} block`}
      disabled={!canEdit}
      onClick={add}
    >
      <span>
        {type.startsWith("product")
          ? "◈"
          : type === "heading"
            ? "T"
            : type === "subscription"
              ? "↻"
              : "✦"}
      </span>
      {type.replaceAll("-", " ")}
    </button>
  );
}
function CanvasDrop({ children }: { children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: "canvas-drop" });
  return (
    <div ref={setNodeRef} style={{ minHeight: 40 }}>
      {children}
    </div>
  );
}
function SortableBlock({
  block: b,
  selected,
  products,
  canEdit,
  select,
  onContent,
}: {
  block: EmailBlock;
  selected: boolean;
  products: Product[];
  canEdit: boolean;
  select: () => void;
  onContent: (v: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
  } = useSortable({ id: b.id, disabled: !canEdit });
  const ps = products.filter((p) => b.productIds.includes(p.id));
  let view: React.ReactNode;
  if (["heading", "hero"].includes(b.type))
    view = (
      <>
        {b.type === "hero" && <div className="demo-brand">MEADOW & MOSS</div>}
        <h2
          contentEditable={canEdit && selected}
          suppressContentEditableWarning
          onBlur={(e) => onContent(e.currentTarget.textContent || "")}
          style={{
            fontFamily: b.type === "hero" ? "Georgia,serif" : undefined,
            fontSize: b.style.fontSize,
          }}
        >
          {b.content}
        </h2>
      </>
    );
  else if (["paragraph", "footer"].includes(b.type))
    view = (
      <p
        contentEditable={canEdit && selected}
        suppressContentEditableWarning
        onBlur={(e) => onContent(e.currentTarget.textContent || "")}
      >
        {b.content}
      </p>
    );
  else if (b.type === "image")
    view = (
      <img
        className="canvas-image"
        src={b.url || "/products/product-0.svg"}
        alt={b.content}
        style={{ height: b.style.height }}
      />
    );
  else if (b.type === "divider") view = <hr />;
  else if (b.type === "spacer")
    view = <div style={{ height: b.style.height }} />;
  else if (b.type === "button")
    view = <span className="btn primary">{b.content}</span>;
  else if (
    [
      "product",
      "product-grid",
      "product-carousel",
      "cart",
      "review",
      "swap",
    ].includes(b.type)
  )
    view = (
      <>
        <h3>{b.content}</h3>
        <div
          className={`canvas-products ${b.type === "product-grid" ? "grid-products" : ""}`}
        >
          {ps.length ? (
            ps.map((p) => (
              <div className="canvas-product" key={p.id}>
                <img src={p.image} alt={p.title} />
                <div>
                  <strong>{p.title}</strong>
                  <small>
                    {p.variants.length} variants · {dollars(p.price)}
                  </small>
                  <span className="canvas-cta">
                    {b.type === "review" ? "Write a review" : "Choose options"}{" "}
                    →
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p>Select products from the right panel.</p>
          )}
        </div>
      </>
    );
  else if (["subscription", "reactivation"].includes(b.type))
    view = (
      <>
        <h2 style={{ fontFamily: "Georgia,serif" }}>{b.content}</h2>
        <p>Your daily ritual, on your terms.</p>
        <div className="canvas-product">
          <img src="/products/product-0.svg" alt="Demo daily greens" />
          <div>
            <strong>Daily greens</strong>
            <small>30 servings · your next delivery</small>
            <span className="canvas-cta">Manage your delivery →</span>
          </div>
        </div>
        <small>Recipient details resolve in the secure experience.</small>
      </>
    );
  else if (b.type === "columns")
    view = (
      <div className="row">
        {b.content.split("|").map((v, i) => (
          <div key={i}>{v}</div>
        ))}
      </div>
    );
  else
    view = (
      <>
        <h3>{b.content}</h3>
        <p>
          {["form", "quiz"].includes(b.type)
            ? "Your configured questions appear in the recipient experience."
            : b.type === "sms"
              ? "Explicit consent and double opt-in are required."
              : "A little interaction, a meaningful moment."}
        </p>
        <span className="canvas-cta">
          {b.type === "spin" ? "Discover your reward" : "Open experience"} →
        </span>
      </>
    );
  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`canvas-block ${selected ? "selected" : ""}`}
      onClick={select}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && e.key === "Enter") select();
      }}
      aria-label={`${b.type} block`}
    >
      <button
        className="drag-handle"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag ${b.type} block`}
      >
        <GripVertical size={17} />
      </button>
      {selected && <span className="selected-label">{b.type}</span>}
      <div
        style={{
          padding: b.style.padding,
          color: b.style.color,
          background: b.style.background,
          borderRadius: b.style.radius,
          textAlign: b.style.align,
          fontSize: b.style.fontSize,
        }}
      >
        {view}
      </div>
    </section>
  );
}
