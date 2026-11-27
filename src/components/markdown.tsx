import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "cn";

import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle,
} from "@/components/ui/code-block";
import { useHighlightedCode } from "@/hooks/use-highlighted-code";
import { safeHref } from "@/lib/safe-href";

function nodeText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return nodeText(node.props.children);
  }
  return "";
}

function HighlightedLines({ code, language }: { code: string; language: string }) {
  const lines = useHighlightedCode(code, language);
  return (
    <>
      {lines.map((line, index) => (
        <span key={index} className="block whitespace-pre">
          {line}
        </span>
      ))}
    </>
  );
}

function CodeFence({ code, language }: { code: string; language: string }) {
  return (
    <CodeBlock className="my-3">
      <CodeBlockHeader>
        <CodeBlockTitle>{language || "Code"}</CodeBlockTitle>
        <CodeBlockActions>
          <CodeBlockCopyButton value={code} />
        </CodeBlockActions>
      </CodeBlockHeader>
      <CodeBlockContent>
        <HighlightedLines code={code} language={language} />
      </CodeBlockContent>
    </CodeBlock>
  );
}

const components: Components = {
  pre({ children }) {
    const child = React.Children.toArray(children)[0];
    let code: string;
    let language = "";

    if (React.isValidElement<{ className?: string; children?: React.ReactNode }>(child)) {
      code = nodeText(child.props.children);
      language = /language-([\w+#.-]+)/.exec(child.props.className ?? "")?.[1] ?? "";
    } else {
      code = nodeText(children);
    }

    return <CodeFence code={code.replace(/\n$/, "")} language={language} />;
  },

  code({ children, className }) {
    return (
      <code
        className={cn(
          "rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]",
          className,
        )}
      >
        {children}
      </code>
    );
  },

  a({ href, children }) {
    const safe = safeHref(href);
    if (!safe) return <>{children}</>;
    return (
      <a
        href={safe}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2"
      >
        {children}
      </a>
    );
  },

  h1: ({ children }) => (
    <h1 className="mt-5 mb-2 text-xl font-semibold first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-5 mb-2 text-lg font-semibold first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 mb-2 font-semibold first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-4 mb-1 font-medium first:mt-0">{children}</h4>
  ),
  h5: ({ children }) => (
    <h5 className="mt-4 mb-1 font-medium first:mt-0">{children}</h5>
  ),
  h6: ({ children }) => (
    <h6 className="mt-4 mb-1 font-medium first:mt-0">{children}</h6>
  ),
  p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-2 list-inside list-disc space-y-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-inside list-decimal space-y-1">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-border my-3 border-l-4 pl-4 text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-border my-4" />,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-border border-b last:border-0">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2 text-start font-medium">{children}</th>
  ),
  td: ({ children }) => <td className="px-3 py-2 align-top">{children}</td>,
  input({ type, checked }) {
    if (type !== "checkbox") return <input type={type} />;
    return (
      <input
        type="checkbox"
        checked={Boolean(checked)}
        readOnly
        className="me-1.5 size-3.5 align-middle accent-current"
      />
    );
  },
};

type MarkdownProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Rendered inline at the end of the last block, e.g. a streaming caret. */
  caret?: React.ReactNode;
};

export function Markdown({ className, children, caret, ...props }: MarkdownProps) {
  const content = typeof children === "string" ? children : String(children ?? "");

  return (
    <div
      className={cn(
        "text-foreground",
        caret && "[&>*:nth-last-child(2)]:inline",
        className,
      )}
      {...props}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
      {caret ? <span>{caret}</span> : null}
    </div>
  );
}
