"use client";

import * as React from "react";
import { useChat } from "@ai-sdk/react";
import type { UIDataTypes, UIMessage, UIMessageChunk } from "ai";
import {
  ArrowUpIcon,
  CircleCheckIcon,
  GlobeIcon,
  LoaderCircleIcon,
  MessageCircleDashedIcon,
  PaperclipIcon,
  PlusIcon,
  RotateCwIcon,
  TelescopeIcon,
  TerminalIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { MESSAGE_ANIMATIONS } from "@/lib/message-animations";
import { Markdown } from "@/components/markdown";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { CodeBlock, CodeBlockContent } from "@/components/ui/code-block";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Message, MessageContent } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";

type ChatMessage = UIMessage<
  unknown,
  UIDataTypes,
  {
    runCommand: {
      input: { command: string };
      output: { stdout: string };
    };
  }
>;

type ChatPart = ChatMessage["parts"][number];

type ToolPart = Extract<ChatPart, { type: "tool-runCommand" }>;

const INVOKE_URL = "/api/chat/completions";
const MODEL = "nvidia/nemotron-3.5-bolt-e4b";

const initialMessages: ChatMessage[] = [];

function messageContent(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function toApiMessages(messages: ChatMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: messageContent(message),
  }));
}

function toUiMessageChunkStream(
  body: ReadableStream<Uint8Array> | null,
  id: string,
): ReadableStream<UIMessageChunk> {
  if (!body) {
    return new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: "text-start", id });
        controller.enqueue({ type: "text-end", id });
        controller.close();
      },
    });
  }

  const decoder = new TextDecoder();
  let buffer = "";

  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      controller.enqueue({ type: "text-start", id });
      try {
        const reader = body.getReader();
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let blockEnd: number;
            while ((blockEnd = buffer.indexOf("\n\n")) !== -1) {
              const block = buffer.slice(0, blockEnd);
              buffer = buffer.slice(blockEnd + 2);
              emitBlock(controller, block, id);
            }
          }
          // flush any remaining decoder bytes + trailing buffer
          buffer += decoder.decode();
          if (buffer.trim()) {
            emitBlock(controller, buffer, id);
            buffer = "";
          }
        } finally {
          reader.releaseLock();
        }
      } finally {
        controller.enqueue({ type: "text-end", id });
        controller.close();
      }
    },
  });
}

function emitBlock(
  controller: ReadableStreamDefaultController<UIMessageChunk>,
  block: string,
  id: string,
) {
  let dataLine = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("data: ")) {
      dataLine = line.slice(6);
    }
  }
  if (!dataLine || dataLine === "[DONE]") return;
  try {
    const parsed = JSON.parse(dataLine);
    const delta =
      parsed.choices?.[0]?.delta?.content ??
      parsed.choices?.[0]?.message?.content;
    if (typeof delta === "string" && delta.length > 0) {
      controller.enqueue({ type: "text-delta", delta, id });
    }
  } catch {
    // ignore malformed SSE data lines
  }
}

const transport = {
  async sendMessages({
    messages,
    abortSignal,
  }: {
    messages: ChatMessage[];
    abortSignal: AbortSignal | undefined;
  }): Promise<ReadableStream<UIMessageChunk>> {
    const id = crypto.randomUUID();

    const response = await fetch(INVOKE_URL, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: toApiMessages(messages),
        stream: true,
        temperature: 0.7,
        top_p: 0.9,
        frequency_penalty: 0,
        presence_penalty: 0,
        reasoning_effort: "low",
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({
            type: "error",
            errorText: `HTTP ${response.status}: ${errorText}`,
          });
          controller.close();
        },
      });
    }

    return toUiMessageChunkStream(
      response.body as ReadableStream<Uint8Array>,
      id,
    );
  },

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  },
} satisfies { sendMessages: unknown; reconnectToStream: unknown };

const MotionMessageScrollerItem = motion.create(MessageScrollerItem);

export function ChatBox() {
  const { messages, sendMessage, setMessages, status } = useChat<ChatMessage>({
    messages: initialMessages,
    transport: transport as never,
  });

  const [draft, setDraft] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const busy = status === "submitted" || status === "streaming";
  const text = draft ?? "";
  const canSend = text.trim().length > 0 && !busy;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) {
      return;
    }

    void sendMessage({ text: text.trim() });
    setDraft(null);
  }

  return (
    <MessageScrollerProvider>
      <div className="relative flex w-full flex-col gap-4 [[data-slot=preview]:has(&)]:bg-background [[data-slot=preview]:has(&)>div]:p-0!">
        <div className="flex h-dvh w-full flex-col gap-4">
          <div className="flex items-start justify-between gap-4 p-8 pb-4">
            <div className="flex flex-col gap-1">
              <div className="font-medium">New Thread</div>
              <div className="text-sm text-muted-foreground">
                Ask the agent to change your code.
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Reset conversation"
                    onClick={() => {
                      setMessages(initialMessages);
                      setDraft(null);
                    }}
                    disabled={busy}
                  >
                    <RotateCwIcon />
                  </Button>
                }
              />
              <TooltipContent>
                <p>Reset</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="min-h-0 flex-1">
            {messages.length === 0 ? (
              <Empty className="h-full">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <MessageCircleDashedIcon />
                  </EmptyMedia>
                  <EmptyTitle>What should we build?</EmptyTitle>
                  <EmptyDescription>
                    The agent can read your code, run commands and make changes.
                    Press send to start.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <MessageScroller>
                <MessageScrollerViewport>
                  <MessageScrollerContent
                    aria-busy={busy}
                    className="gap-6 px-8 py-0"
                  >
                    {messages.map((message) => {
                      if (message.role === "user") {
                        return (
                          <MotionMessageScrollerItem
                            key={message.id}
                            messageId={message.id}
                            scrollAnchor
                            variants={MESSAGE_ANIMATIONS["slide-up"].variants}
                            initial={shouldReduceMotion ? false : "initial"}
                            animate="animate"
                          >
                            <Message align="end">
                              <MessageContent>
                                <Bubble align="end" variant="muted">
                                  <BubbleContent>
                                    {messageContent(message)}
                                  </BubbleContent>
                                </Bubble>
                              </MessageContent>
                            </Message>
                          </MotionMessageScrollerItem>
                        );
                      }

                      const streaming = busy && message === messages.at(-1);
                      const steps = message.parts.filter(
                        (part) =>
                          part.type === "reasoning" ||
                          part.type === "tool-runCommand",
                      );
                      const reply = messageContent(message);

                      return (
                        <MessageScrollerItem
                          key={message.id}
                          messageId={message.id}
                        >
                          <Message>
                            <MessageContent className="gap-3">
                              {steps.length > 0 && (
                                <Trace>
                                  {steps.map((part, index) => (
                                    <StepRow
                                      key={index}
                                      part={part}
                                      streaming={streaming}
                                    />
                                  ))}
                                </Trace>
                              )}
                              {reply && <Markdown>{reply}</Markdown>}
                            </MessageContent>
                          </Message>
                        </MessageScrollerItem>
                      );
                    })}
                  </MessageScrollerContent>
                </MessageScrollerViewport>
                <MessageScrollerButton />
              </MessageScroller>
            )}
          </div>
          <div className="p-8 pt-0">
            <form ref={formRef} onSubmit={onSubmit} className="w-full">
              <InputGroup>
                <InputGroupTextarea
                  value={text}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Ask the agent..."
                  aria-label="Message"
                  className="min-h-14"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      formRef.current?.requestSubmit();
                    }
                  }}
                />
                <InputGroupAddon align="block-end" className="pt-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <InputGroupButton
                          aria-label="Add context"
                          type="button"
                          size="icon-sm"
                          variant="outline"
                        >
                          <PlusIcon />
                        </InputGroupButton>
                      }
                    />
                    <DropdownMenuContent
                      align="start"
                      side="top"
                      className="w-44"
                    >
                      <DropdownMenuItem>
                        <PaperclipIcon />
                        Add Photos & Files
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem>
                        <TelescopeIcon />
                        Deep Research
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <GlobeIcon />
                        Web Search
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <InputGroupButton
                    type="submit"
                    variant="default"
                    size="icon-sm"
                    disabled={!canSend}
                    className="ml-auto"
                  >
                    <ArrowUpIcon />
                    <span className="sr-only">Send</span>
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </form>
          </div>
        </div>
      </div>
    </MessageScrollerProvider>
  );
}

export default ChatBox;

function StepRow({ part, streaming }: { part: ChatPart; streaming: boolean }) {
  if (part.type === "reasoning") {
    return (
      <ReasoningRow text={part.text} running={part.state === "streaming"} />
    );
  }

  if (part.type === "tool-runCommand") {
    return <ToolRow part={part} streaming={streaming} />;
  }

  return null;
}

function ReasoningRow({ text, running }: { text: string; running: boolean }) {
  const [open, setOpen] = React.useState<boolean>();

  return (
    <TraceCollapsible open={open ?? running} onOpenChange={setOpen}>
      <TraceCollapsibleTrigger>
        <TraceLine status={running ? "running" : undefined}>
          <TraceIcon>
            {running ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <CircleCheckIcon />
            )}
          </TraceIcon>
          <TraceTitle>{running ? "Thinking" : "Thought"}</TraceTitle>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="whitespace-pre-wrap">
        {text}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

function ToolRow({ part, streaming }: { part: ToolPart; streaming: boolean }) {
  const command = part.input?.command;

  if (part.state === "output-available" || part.state === "output-error") {
    const failed = part.state === "output-error";

    return (
      <TraceCollapsible>
        <TraceCollapsibleTrigger>
          <TraceLine status={failed ? "error" : undefined}>
            <TraceIcon>
              <TerminalIcon />
            </TraceIcon>
            <TraceTitle>
              {failed ? "Failed to run" : "Ran"} {command}
            </TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          <CodeBlock size="sm">
            <CodeBlockContent wrap className="max-h-64">
              {failed ? part.errorText : part.output.stdout}
            </CodeBlockContent>
          </CodeBlock>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    );
  }

  return (
    <TraceLine status={streaming ? "running" : "error"}>
      <TraceIcon>
        <TerminalIcon />
      </TraceIcon>
      <TraceTitle>
        {streaming ? "Running" : "Failed to run"} {command}
      </TraceTitle>
    </TraceLine>
  );
}
