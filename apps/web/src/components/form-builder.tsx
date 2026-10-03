"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Save,
  Eye,
  ArrowLeft,
  List,
  GitBranch,
} from "lucide-react";
import { api, post } from "../lib/api";
import {
  formSchema,
  type FormDocument,
} from "../../../../packages/shared/src/index";
import {
  SectionHead,
  Loading,
  Feedback,
  Modal,
  Badge,
  useFeedback,
} from "./ui";
export function FormBuilder({ id, canEdit }: { id: string; canEdit: boolean }) {
  const [row, setRow] = useState<any>(null),
    [doc, setDoc] = useState<FormDocument | null>(null),
    [selected, setSelected] = useState(0),
    [link, setLink] = useState(""),
    [responses, setResponses] = useState<any[] | null>(null),
    [profiles, setProfiles] = useState<any[]>([]),
    [recipient, setRecipient] = useState("profile-1");
  const f = useFeedback();
  useEffect(() => {
    void f.run(async () => {
      const r = await api(`/records/form/${id}`);
      setRow(r);
      setDoc(formSchema.parse(r.data));
      setProfiles(await api("/records/profile"));
    }, "");
  }, [id]);
  if (!doc)
    return (
      <>
        <Feedback message={f.message} error={f.error} />
        <Loading />
      </>
    );
  const q = doc.questions[selected];
  const update = (fn: (d: FormDocument) => void) => {
    if (!canEdit) return;
    const d = structuredClone(doc);
    fn(d);
    setDoc(d);
  };
  const save = () =>
    f.run(async () => {
      const data = formSchema.parse(doc);
      const r = await api(`/records/form/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: data.name,
          data,
          revision: row.revision,
          status: "published",
        }),
      });
      setRow(r);
    }, "Form saved and published locally");
  return (
    <>
      <Link href="/app/forms" className="text-link">
        <ArrowLeft size={15} />
        All forms
      </Link>
      <SectionHead
        title={doc.name}
        description="Build a conversation that follows their answers."
        action={
          <div className="row">
            <button
              className="btn secondary"
              onClick={() =>
                f.run(
                  async () => setResponses(await api(`/forms/${id}/responses`)),
                  "",
                )
              }
            >
              <List size={16} />
              Responses
            </button>
            <button
              className="btn primary"
              disabled={!canEdit}
              onClick={() => void save()}
            >
              <Save size={16} />
              Save form
            </button>
          </div>
        }
      />
      <Feedback message={f.message} error={f.error} />
      <div className="form-builder">
        <aside className="panel question-list">
          <span className="eyebrow">QUESTIONS</span>
          {doc.questions.map((q, i) => (
            <button
              className={selected === i ? "selected" : ""}
              onClick={() => setSelected(i)}
              key={q.id}
            >
              <span>{i + 1}</span>
              <div>
                <strong>{q.label}</strong>
                <small>
                  {q.type}
                  {q.showWhen ? " · Conditional" : ""}
                </small>
              </div>
            </button>
          ))}
          <button
            className="btn secondary full"
            disabled={!canEdit || doc.questions.length >= 30}
            onClick={() => {
              update((d) =>
                d.questions.push({
                  id: crypto.randomUUID(),
                  label: "Your next question",
                  type: "short",
                  required: false,
                  options: [],
                }),
              );
              setSelected(doc.questions.length);
            }}
          >
            <Plus size={16} />
            Add question
          </button>
        </aside>
        <section className="panel question-editor">
          {q && (
            <>
              <Badge tone="gray">QUESTION {selected + 1}</Badge>
              <label>
                Question title
                <input
                  value={q.label}
                  disabled={!canEdit}
                  onChange={(e) =>
                    update((d) => {
                      d.questions[selected].label = e.target.value;
                    })
                  }
                />
              </label>
              <label>
                Answer type
                <select
                  value={q.type}
                  disabled={!canEdit}
                  onChange={(e) =>
                    update((d) => {
                      d.questions[selected].type = e.target.value as any;
                      if (
                        ["single", "multi"].includes(e.target.value) &&
                        !d.questions[selected].options.length
                      )
                        d.questions[selected].options = [
                          "Option 1",
                          "Option 2",
                        ];
                    })
                  }
                >
                  {[
                    ["single", "Single select"],
                    ["multi", "Multi select"],
                    ["short", "Short text"],
                    ["long", "Long text"],
                    ["rating", "Star rating"],
                    ["phone", "Phone number"],
                  ].map(([v, l]) => (
                    <option value={v} key={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              {["single", "multi"].includes(q.type) && (
                <label>
                  Options, one per line
                  <textarea
                    value={q.options.join("\n")}
                    onChange={(e) =>
                      update((d) => {
                        d.questions[selected].options = e.target.value
                          .split("\n")
                          .filter(Boolean);
                      })
                    }
                  />
                </label>
              )}
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={q.required}
                  onChange={(e) =>
                    update((d) => {
                      d.questions[selected].required = e.target.checked;
                    })
                  }
                />
                Required answer
              </label>
              <label>
                Klaviyo profile property
                <input
                  value={q.profileProperty || ""}
                  disabled={!canEdit}
                  onChange={(e) =>
                    update((d) => {
                      d.questions[selected].profileProperty =
                        e.target.value || undefined;
                    })
                  }
                  placeholder="wellness_goal"
                />
              </label>
              <div className="question-logic">
                <h3>
                  <GitBranch size={17} />
                  Conditional visibility
                </h3>
                <label>
                  Show this question when
                  <select
                    value={q.showWhen?.questionId || ""}
                    onChange={(e) =>
                      update((d) => {
                        d.questions[selected].showWhen = e.target.value
                          ? { questionId: e.target.value, equals: "" }
                          : undefined;
                      })
                    }
                  >
                    <option value="">Always visible</option>
                    {doc.questions
                      .slice(0, selected)
                      .filter((q) => q.type === "single" || q.type === "short")
                      .map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.label}
                        </option>
                      ))}
                  </select>
                </label>
                {q.showWhen && (
                  <label>
                    Answer equals
                    <input
                      value={q.showWhen.equals}
                      onChange={(e) =>
                        update((d) => {
                          d.questions[selected].showWhen!.equals =
                            e.target.value;
                        })
                      }
                    />
                  </label>
                )}
                <small>
                  Conditions refer to earlier questions. Hidden answers are
                  discarded on submission.
                </small>
              </div>
              <div className="row">
                <button
                  className="btn secondary"
                  disabled={
                    !canEdit ||
                    selected === 0 ||
                    doc.questions.some((v) => v.showWhen)
                  }
                  aria-label="Move question up"
                  onClick={() => {
                    update((d) => {
                      [d.questions[selected - 1], d.questions[selected]] = [
                        d.questions[selected],
                        d.questions[selected - 1],
                      ];
                    });
                    setSelected(selected - 1);
                  }}
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  className="btn secondary"
                  disabled={
                    !canEdit ||
                    selected === doc.questions.length - 1 ||
                    doc.questions.some((v) => v.showWhen)
                  }
                  aria-label="Move question down"
                  onClick={() => {
                    update((d) => {
                      [d.questions[selected + 1], d.questions[selected]] = [
                        d.questions[selected],
                        d.questions[selected + 1],
                      ];
                    });
                    setSelected(selected + 1);
                  }}
                >
                  <ChevronDown size={16} />
                </button>
                <button
                  className="btn danger"
                  disabled={!canEdit || doc.questions.length <= 1}
                  onClick={() => {
                    update((d) => {
                      const id = d.questions[selected].id;
                      d.questions.splice(selected, 1);
                      for (const q of d.questions)
                        if (q.showWhen?.questionId === id)
                          q.showWhen = undefined;
                      d.outcomes = d.outcomes.filter(
                        (o) => o.questionId !== id,
                      );
                    });
                    setSelected(Math.max(0, selected - 1));
                  }}
                >
                  <Trash2 size={15} />
                  Remove question
                </button>
              </div>
            </>
          )}
        </section>
        <aside className="panel form-settings">
          <h3>Your conversation</h3>
          <label>
            Form name
            <input
              value={doc.name}
              onChange={(e) =>
                update((d) => {
                  d.name = e.target.value;
                })
              }
            />
          </label>
          <label>
            Success message
            <textarea
              value={doc.success}
              onChange={(e) =>
                update((d) => {
                  d.success = e.target.value;
                })
              }
            />
          </label>
          <h3>Personalized outcomes</h3>
          {doc.outcomes.map((o, i) => (
            <div className="outcome-row" key={i}>
              <label>
                Question
                <select
                  value={o.questionId}
                  onChange={(e) =>
                    update((d) => {
                      d.outcomes[i].questionId = e.target.value;
                    })
                  }
                >
                  {doc.questions.map((q) => (
                    <option value={q.id} key={q.id}>
                      {q.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Answer equals
                <input
                  value={o.equals}
                  onChange={(e) =>
                    update((d) => {
                      d.outcomes[i].equals = e.target.value;
                    })
                  }
                />
              </label>
              <label>
                Result message
                <textarea
                  value={o.result}
                  onChange={(e) =>
                    update((d) => {
                      d.outcomes[i].result = e.target.value;
                    })
                  }
                />
              </label>
              <button
                className="icon-button"
                aria-label="Remove outcome"
                onClick={() =>
                  update((d) => {
                    d.outcomes.splice(i, 1);
                  })
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <button
            className="btn secondary full"
            disabled={!canEdit}
            onClick={() =>
              update((d) =>
                d.outcomes.push({
                  questionId: d.questions[0].id,
                  equals: "",
                  result: "Your personalized result",
                }),
              )
            }
          >
            <Plus size={15} />
            Add outcome
          </button>
          <label>
            Preview recipient
            <select
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            >
              {profiles.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn primary full"
            disabled={!canEdit}
            onClick={() =>
              f.run(async () => {
                const data = formSchema.parse(doc);
                const saved = await api(`/records/form/${id}`, {
                  method: "PUT",
                  body: JSON.stringify({
                    name: data.name,
                    data,
                    revision: row.revision,
                    status: "published",
                  }),
                });
                setRow(saved);
                const r = await post("/action-tokens", {
                  recipientId: recipient,
                  scope: "form",
                  targetId: id,
                });
                setLink(r.url);
              }, "Form saved and recipient preview created")
            }
          >
            <Eye size={16} />
            Create live sandbox preview
          </button>
          {link && (
            <Link href={link} target="_blank" className="btn secondary full">
              Open preview ↗
            </Link>
          )}
          <small>
            Responses persist in PostgreSQL and update sandbox Klaviyo
            properties.
          </small>
        </aside>
      </div>
      <Modal
        open={responses !== null}
        onClose={() => setResponses(null)}
        title="Form responses"
      >
        {responses?.length ? (
          responses.map((r) => (
            <div className="version-row" key={r.id}>
              <div>
                <strong>{r.recipient_id}</strong>
                <small>{new Date(r.created_at).toLocaleString()}</small>
                <pre>{JSON.stringify(r.answers, null, 2)}</pre>
              </div>
            </div>
          ))
        ) : (
          <p>
            No responses yet. Open the sandbox preview to submit your first
            answer.
          </p>
        )}
      </Modal>
    </>
  );
}
