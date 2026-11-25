import * as React from "react";
import type { ReactNode } from "react";
import { cn } from "cn";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function parseInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex =
    /`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|~~([^~]+)~~/g;
  let lastIndex = 0;

  for (const match of text.matchAll(regex)) {
    if (match.index !== lastIndex) {
      const before = text.slice(lastIndex, match.index);
      if (before) {
        nodes.push(<span key={lastIndex}>{escapeHtml(before)}</span>);
      }
    }

    const [, code, linkText, linkHref, bold, italic, strikethrough] = match;
    lastIndex = match.index + match[0].length;

    if (code) {
      nodes.push(<code key={lastIndex}>{code}</code>);
    } else if (linkText !== undefined) {
      nodes.push(
        <a key={lastIndex} href={linkHref} className="text-primary underline">
          {parseInline(linkText)}
        </a>,
      );
    } else if (bold) {
      nodes.push(<strong key={lastIndex}>{parseInline(bold)}</strong>);
    } else if (italic) {
      nodes.push(<em key={lastIndex}>{parseInline(italic)}</em>);
    } else if (strikethrough) {
      nodes.push(<s key={lastIndex}>{parseInline(strikethrough)}</s>);
    }
  }

  if (lastIndex < text.length) {
    const rest = text.slice(lastIndex);
    if (rest) {
      nodes.push(<span key={lastIndex}>{escapeHtml(rest)}</span>);
    }
  }

  return nodes;
}

function parseCodeBlock(lines: string[], start: number): { nodes: ReactNode[]; nextIndex: number } {
  let i = start;
  i++;

  const code: string[] = [];
  while (i < lines.length && !lines[i]!.trimStart().startsWith("```")) {
    code.push(lines[i]!);
    i++;
  }
  i++; // skip the closing fence

  return {
    nodes: [
      <pre
        key={i}
        className="overflow-x-auto bg-background rounded-md px-3 py-3 font-mono text-sm leading-relaxed"
      >
        <code>{code.join("\n")}</code>
      </pre>,
    ],
    nextIndex: i,
  };
}

function parseBlockquote(lines: string[], start: number): { nodes: ReactNode[]; nextIndex: number } {
  let i = start;
  const contents: string[] = [];

  while (i < lines.length && lines[i]!.trimStart().startsWith(">")) {
    const content = lines[i]!
      .trimStart()
      .replace(/^>\s?/, "")
      .trim();
    if (content) {
      contents.push(content);
    }
    i++;
  }

  return {
    nodes: [
      <blockquote
        key={i}
        className="border-border border-l-4 pl-4 text-muted-foreground italic"
      >
        {parseInline(contents.join(" "))}
      </blockquote>,
    ],
    nextIndex: i,
  };
}

function parseList(lines: string[], start: number): { nodes: ReactNode[]; nextIndex: number } {
  let i = start;
  const items: string[] = [];
  const isBullet = /^[-*]\s+/.test(lines[i]!.trim());

  items.push(lines[i]!.trim());
  i++;

  while (i < lines.length) {
    const trimmed = lines[i]!.trim();
    const isNextBullet = /^[-*]\s+/.test(trimmed);
    const isNextOrdered = /^\d+\.\s+/.test(trimmed);
    const startsNewBlock =
      trimmed === "" ||
      /^(#{1,6})\s+/.test(trimmed) ||
      trimmed.startsWith("```") ||
      trimmed.startsWith(">") ||
      isNextBullet ||
      isNextOrdered;

    if (startsNewBlock) {
      break;
    }

    items.push(trimmed);
    i++;
  }

  const tag = isBullet ? "ul" : "ol";
  return {
    nodes: [
      React.createElement(
        tag,
        { key: i, className: "list-inside list-disc space-y-1" },
        items.map((item, idx) => (
          <li key={idx}>{parseInline(item)}</li>
        )),
      ),
    ],
    nextIndex: i,
  };
}

function parseParagraph(lines: string[], start: number): { nodes: ReactNode[]; nextIndex: number } {
  let i = start;
  const contents: string[] = [];

  while (i < lines.length) {
    const trimmed = lines[i]!.trim();
    const startsNewBlock =
      trimmed === "" ||
      /^(#{1,6})\s+/.test(trimmed) ||
      trimmed.startsWith("```") ||
      trimmed.startsWith(">") ||
      /^[-*]\s+/.test(trimmed) ||
      /^\d+\.\s+/.test(trimmed);

    if (startsNewBlock) {
      break;
    }

    contents.push(trimmed);
    i++;
  }

  return {
    nodes: [
      <p key={i} className="leading-relaxed">
        {parseInline(contents.join(" "))}
      </p>,
    ],
    nextIndex: i,
  };
}

function parseMarkdown(markdown: string): ReactNode[] {
  const lines = markdown.split(/\r?\n/);
  const nodes: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.trim() === "") {
      i++;
      continue;
    }

    if (line.trimStart().startsWith("```")) {
      const result = parseCodeBlock(lines, i);
      nodes.push(...result.nodes);
      i = result.nextIndex;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1]!.length;
      const headingProps = {
        key: i,
        className: "text-lg font-semibold leading-tight first:mt-0",
      };
      nodes.push(
        React.createElement(
          `h${level}` as keyof React.JSX.IntrinsicElements,
          headingProps,
          parseInline(heading[2] ?? ""),
        ),
      );
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,})\s*$/.test(line.trim())) {
      nodes.push(<hr key={i} className="my-4 border-border" />);
      i++;
      continue;
    }

    if (line.trimStart().startsWith(">")) {
      const result = parseBlockquote(lines, i);
      nodes.push(...result.nodes);
      i = result.nextIndex;
      continue;
    }

    const listMatch = line.match(/^(?:[-*]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      const result = parseList(lines, i);
      nodes.push(...result.nodes);
      i = result.nextIndex;
      continue;
    }

    const paragraph = parseParagraph(lines, i);
    nodes.push(...paragraph.nodes);
    i = paragraph.nextIndex;
  }

  return nodes;
}

type MarkdownProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Rendered inline at the end of the last block, e.g. a streaming caret. */
  caret?: ReactNode;
};

export function Markdown({
  className,
  children,
  caret,
  ...props
}: MarkdownProps) {
  const content = typeof children === "string" ? children : String(children ?? "");
  const nodes = parseMarkdown(content);

  if (caret) {
    const lastIndex = nodes.length - 1;
    const last = nodes[lastIndex];
    if (
      React.isValidElement<{ children?: ReactNode }>(last) &&
      typeof last.type === "string" &&
      ["p", "h1", "h2", "h3", "h4", "h5", "h6", "li"].includes(last.type)
    ) {
      nodes[lastIndex] = React.cloneElement(last, {}, last.props.children, caret);
    } else {
      nodes.push(<p key="streaming-caret">{caret}</p>);
    }
  }

  return (
    <div className={cn("text-foreground", className)} {...props}>
      {nodes}
    </div>
  );
}


