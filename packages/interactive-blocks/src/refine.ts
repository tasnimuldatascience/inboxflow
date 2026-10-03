import {
  type EmailDocument,
  type EditorOperation,
  newBlock,
  applyOperations,
} from "../../shared/src/index.ts";
export interface RefineProvider {
  suggest(
    command: string,
    doc: EmailDocument,
    selected?: string,
  ): Promise<{
    mode: string;
    explanation: string;
    operations: EditorOperation[];
  }>;
}
export class DeterministicRefine implements RefineProvider {
  async suggest(command: string, doc: EmailDocument, selected?: string) {
    const cmd = command.toLowerCase();
    const block =
      doc.blocks.find((b) => b.id === selected) ||
      doc.blocks.find((b) => ["heading", "hero"].includes(b.type));
    const ops: EditorOperation[] = [];
    let explanation =
      "Use “headline: your text”, “CTA: your text”, “color #173f35”, “add product”, “move first”, or “improve mobile”.";
    const headline = command.match(/(?:headline|heading)\s*:\s*(.+)/i),
      cta = command.match(/cta\s*:\s*(.+)/i),
      color = command.match(/#[0-9a-f]{6}/i);
    if (headline && block) {
      ops.push({
        op: "update",
        blockId: block.id,
        patch: { content: headline[1] },
      });
      explanation = "Update the selected headline.";
    } else if (cta) {
      const button = doc.blocks.find((b) => b.type === "button");
      if (button)
        ops.push({
          op: "update",
          blockId: button.id,
          patch: { content: cta[1] },
        });
      else
        ops.push({
          op: "add",
          index: doc.blocks.length,
          block: { ...newBlock("button"), content: cta[1] },
        });
      explanation = "Update the call to action.";
    } else if (color && block) {
      ops.push({
        op: "update",
        blockId: block.id,
        patch: { style: { ...block.style, background: color[0] } },
      });
      explanation = "Update the selected block background.";
    } else if (cmd.includes("add product")) {
      ops.push({
        op: "add",
        index: Math.max(0, doc.blocks.length - 1),
        block: newBlock("product"),
      });
      explanation = "Add a product block; select catalog products in settings.";
    } else if (cmd.includes("mobile")) {
      for (const b of doc.blocks)
        ops.push({
          op: "update",
          blockId: b.id,
          patch: {
            style: {
              ...b.style,
              padding: 16,
              fontSize: Math.min(32, b.style.fontSize),
            },
          },
        });
      explanation = "Reduce spacing and large text for mobile.";
    } else if (cmd.includes("move first") && block) {
      ops.push({ op: "move", blockId: block.id, index: 0 });
      explanation = "Move the selected block to the top.";
    }
    applyOperations(doc, ops);
    return {
      mode: "Deterministic local assistant · no generative model",
      explanation,
      operations: ops,
    };
  }
}
