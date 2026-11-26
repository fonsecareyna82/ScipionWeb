import type { ReactNode } from "react";

/** The little Markdown a chat model writes (paragraphs, lists, headings, **bold**, `code`, code blocks), drawn as
 * React elements: nothing it writes is ever read as HTML. */

function inline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;
    parts.push(token.startsWith("**")
      ? <strong key={key}>{token.slice(2, -2)}</strong>
      : <code key={key} className="rounded bg-gray-100 px-1 font-mono text-[13.5px] dark:bg-gray-800">{token.slice(1, -1)}</code>);
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

type Block =
  | { kind: "paragraph"; lines: string[] }
  | { kind: "heading"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "code"; text: string };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

export function blocksOf(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++]);
      blocks.push({ kind: "code", text: code.join("\n") });
      continue;
    }
    if (!line.trim()) continue;
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", text: heading[1] });
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    if (bullet || numbered) {
      const ordered = !bullet;
      const item = (bullet ?? numbered)![1];
      const previous = blocks[blocks.length - 1];
      if (previous?.kind === "list" && previous.ordered === ordered) previous.items.push(item);
      else blocks.push({ kind: "list", ordered, items: [item] });
      continue;
    }
    const previous = blocks[blocks.length - 1];
    // A line right after another of the same paragraph goes on with it
    if (previous?.kind === "paragraph" && lines[i - 1]?.trim()) previous.lines.push(line.trim());
    else blocks.push({ kind: "paragraph", lines: [line.trim()] });
  }
  return blocks;
}

export function renderChatMarkdown(text: string): ReactNode {
  return (
    <div className="space-y-2">
      {blocksOf(text).map((block, index) => {
        const key = `b${index}`;
        if (block.kind === "heading") return <p key={key} className="font-semibold">{inline(block.text, key)}</p>;
        if (block.kind === "code") {
          return (
            <pre key={key} className="overflow-x-auto rounded-lg bg-gray-100 p-2 font-mono text-[13.5px] dark:bg-gray-800">
              {block.text}
            </pre>
          );
        }
        if (block.kind === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List key={key} className={`${block.ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5`}>
              {block.items.map((item, itemIndex) => <li key={itemIndex}>{inline(item, `${key}-${itemIndex}`)}</li>)}
            </List>
          );
        }
        return <p key={key}>{inline(block.lines.join(" "), key)}</p>;
      })}
    </div>
  );
}
