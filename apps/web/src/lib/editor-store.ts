import { create } from "zustand";
import {
  type EmailDocument,
  type EditorOperation,
  applyOperations,
  documentSchema,
} from "../../../../packages/shared/src/index";
type State = {
  document: EmailDocument | null;
  past: EmailDocument[];
  future: EmailDocument[];
  selected: string | null;
  dirty: boolean;
  generation: number;
  load: (d: EmailDocument) => void;
  edit: (fn: (d: EmailDocument) => void) => void;
  operate: (ops: EditorOperation[]) => void;
  undo: () => void;
  redo: () => void;
  select: (id: string | null) => void;
  markSaved: (generation: number) => void;
};
export const useEditor = create<State>((set, get) => ({
  document: null,
  past: [],
  future: [],
  selected: null,
  dirty: false,
  generation: 0,
  load: (d) =>
    set({
      document: documentSchema.parse(d),
      past: [],
      future: [],
      selected: null,
      dirty: false,
      generation: 0,
    }),
  edit: (fn) => {
    const s = get();
    if (!s.document) return;
    const next = structuredClone(s.document);
    fn(next);
    const valid = documentSchema.parse(next);
    set({
      document: valid,
      past: [...s.past.slice(-49), s.document],
      future: [],
      dirty: true,
      generation: s.generation + 1,
    });
  },
  operate: (ops) =>
    get().edit((d) => Object.assign(d, applyOperations(d, ops))),
  undo: () => {
    const s = get();
    if (!s.past.length || !s.document) return;
    set({
      document: s.past.at(-1)!,
      past: s.past.slice(0, -1),
      future: [s.document, ...s.future],
      dirty: true,
      generation: s.generation + 1,
    });
  },
  redo: () => {
    const s = get();
    if (!s.future.length || !s.document) return;
    set({
      document: s.future[0],
      past: [...s.past, s.document],
      future: s.future.slice(1),
      dirty: true,
      generation: s.generation + 1,
    });
  },
  select: (id) => set({ selected: id }),
  markSaved: (generation) => {
    if (get().generation === generation) set({ dirty: false });
  },
}));
