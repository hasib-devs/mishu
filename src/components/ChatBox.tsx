"use client";

import * as React from "react";
import { useChat } from "@ai-sdk/react";
import {
  ArrowUpIcon,
  CircleAlertIcon,
  MessageCircleDashedIcon,
  Trash2Icon,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { MESSAGE_ANIMATIONS } from "@/lib/message-animations";
import { Markdown } from "@/components/markdown";
import { MessageActions } from "@/components/message-actions";
import { Trace } from "@/components/ui/trace";
import { ThinkingDots } from "@/components/ui/typing-indicator";
import { StepRow } from "@/components/chat-rows";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
  messageContent,
  transport,
  type ChatMessage,
} from "@/lib/chat-transport";
import { saveMessages } from "@/lib/thread-api";
import { messagesToSave, toStoredMessages } from "@/lib/thread-messages";
import { EFFORTS, MODEL_OPTIONS, type ReasoningEffort } from "@/lib/model-options";
import {
  loadSettings,
  moveDraftSettings,
  saveSettings,
  toRequestBody,
  type ChatSettings,
} from "@/lib/chat-settings";

const MotionMessageScrollerItem = motion.create(MessageScrollerItem);

const STARTER_PROMPTS = [
  "Compare two options in a table",
  "Write a TypeScript example and explain it",
  "Give me a step-by-step plan",
];

type ChatBoxProps = {
  title: string;
  threadId: string | null;
  initialMessages: ChatMessage[];
  ensureThread: () => Promise<string>;
  onSaved: () => void;
  onDeleted: () => void;
};

export function ChatBox({
  title,
  threadId,
  initialMessages,
  ensureThread,
  onSaved,
  onDeleted,
}: ChatBoxProps) {
  const threadIdRef = React.useRef<string | null>(threadId);
  const {
    messages,
    sendMessage,
    status,
    error,
    regenerate,
    clearError,
  } = useChat<ChatMessage>({
    messages: initialMessages,
    transport: transport as never,
    onFinish: ({ messages: finalMessages, isAbort, isError }) => {
      const threadId = threadIdRef.current;
      if (!threadId) return;
      const snapshot = messagesToSave(finalMessages, isAbort || isError);
      if (snapshot.length === 0) return;
      void saveMessages(threadId, toStoredMessages(snapshot))
        .then(onSaved)
        .catch(() => undefined);
    },
  });

  const [draft, setDraft] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [settings, setSettings] = React.useState<ChatSettings>(() =>
    loadSettings(threadId),
  );
  const formRef = React.useRef<HTMLFormElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const busy = status === "submitted" || status === "streaming";
  const text = draft ?? "";
  const canSend = text.trim().length > 0 && !busy && !creating;
  const selectedModel =
    MODEL_OPTIONS.find((option) => option.id === settings.modelId) ??
    MODEL_OPTIONS[0];

  function updateSettings(patch: Partial<ChatSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(threadIdRef.current, next);
  }

  const caret = (
    <span
      aria-hidden
      className="ms-0.5 inline-block h-[1em] w-[2px] translate-y-[0.15em] rounded-sm bg-foreground animate-caret-blink motion-reduce:animate-none"
    />
  );

  async function submit(value: string) {
    const trimmed = value.trim();
    if (trimmed.length === 0 || busy || creating) return;

    setCreating(true);
    try {
      if (!threadIdRef.current) {
        threadIdRef.current = await ensureThread();
        moveDraftSettings(threadIdRef.current);
      }
      setDraft(null);
      await sendMessage({ text: trimmed }, { body: toRequestBody(settings) });
    } finally {
      setCreating(false);
    }
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(text);
  }

  return (
    <MessageScrollerProvider autoScroll>
      <div className="max-h-dvh relative flex w-full flex-col gap-4 [[data-slot=preview]:has(&)]:bg-background [[data-slot=preview]:has(&)>div]:p-0!">
        <div className="flex max-h-dvh h-full w-full flex-col gap-4">
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-2 md:px-8">
            <div className="flex min-w-0 flex-col gap-1">
              <div className="truncate font-medium">{title}</div>
              <div className="text-sm text-muted-foreground">
                Ask me anything
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete conversation"
                    onClick={onDeleted}
                    disabled={busy}
                  >
                    <Trash2Icon />
                  </Button>
                }
              />
              <TooltipContent>
                <p>Delete conversation</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="grid min-h-0 flex-1">
            {messages.length === 0 ? (
              <Empty className="h-full px-6">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <MessageCircleDashedIcon />
                  </EmptyMedia>
                  <EmptyTitle className="text-2xl">
                    What can I help with?
                  </EmptyTitle>
                  <EmptyDescription className="text-base">
                    Ask a question, or start with one of these.
                  </EmptyDescription>
                </EmptyHeader>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {STARTER_PROMPTS.map((prompt) => (
                    <Button
                      key={prompt}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || creating}
                      onClick={() => void submit(prompt)}
                    >
                      {prompt}
                    </Button>
                  ))}
                </div>
              </Empty>
            ) : (
              <MessageScroller>
                <MessageScrollerViewport>
                  <MessageScrollerContent
                    aria-busy={busy}
                    className="gap-6 px-6 py-0 md:px-8"
                  >
                    {busy && messages.at(-1)?.role === "user" && (
                      <MessageScrollerItem key="thinking" scrollAnchor>
                        <Message className="max-w-[90%] md:max-w-[80%]">
                          <MessageContent>
                            <ThinkingDots />
                          </MessageContent>
                        </Message>
                      </MessageScrollerItem>
                    )}
                    {messages.map((message) => {
                      if (message.role === "user") {
                        return (
                          <MotionMessageScrollerItem
                            key={message.id}
                            messageId={message.id}
                            variants={MESSAGE_ANIMATIONS["slide-up"].variants}
                            initial={shouldReduceMotion ? false : "initial"}
                            animate="animate"
                          >
                            <Message align="end">
                              <MessageContent>
                                <Bubble align="end" variant="muted">
                                  <BubbleContent className="text-base leading-relaxed">
                                    {messageContent(message)}
                                  </BubbleContent>
                                </Bubble>
                              </MessageContent>
                            </Message>
                          </MotionMessageScrollerItem>
                        );
                      }

                      const last = message === messages.at(-1);
                      const streaming = busy && last;
                      const failed = error !== undefined && last;
                      const steps = message.parts.filter(
                        (part) =>
                          part.type === "reasoning" ||
                          part.type === "tool-runCommand",
                      );
                      const reply = messageContent(message);
                      const completed = !busy && !failed && reply.length > 0;

                      return (
                        <MotionMessageScrollerItem
                          key={message.id}
                          messageId={message.id}
                          scrollAnchor={last}
                          variants={MESSAGE_ANIMATIONS["slide-up"].variants}
                          initial={shouldReduceMotion ? false : "initial"}
                          animate="animate"
                        >
                          <Message
                            className={`max-w-[90%] md:max-w-[80%]${failed ? " opacity-70" : ""}`}
                          >
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
                              {reply ? (
                                <Markdown
                                  caret={streaming ? caret : undefined}
                                  className="text-base leading-relaxed"
                                >
                                  {reply}
                                </Markdown>
                              ) : streaming ? (
                                <ThinkingDots />
                              ) : null}
                            </MessageContent>
                            {completed ? (
                              <MessageActions
                                text={reply}
                                threadId={threadId}
                                messageId={message.id}
                                canRegenerate={last}
                                onRegenerate={() =>
                                  void regenerate({ body: toRequestBody(settings) })
                                }
                              />
                            ) : null}
                          </Message>
                        </MotionMessageScrollerItem>
                      );
                    })}
                    {error ? (
                      <MessageScrollerItem key="chat-error" scrollAnchor>
                        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                          <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium">Response failed</div>
                            <div className="text-muted-foreground break-words">
                              {error.message}
                            </div>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              clearError();
                              void regenerate({ body: toRequestBody(settings) });
                            }}
                          >
                            Retry
                          </Button>
                        </div>
                      </MessageScrollerItem>
                    ) : null}
                  </MessageScrollerContent>
                </MessageScrollerViewport>
                <MessageScrollerButton />
              </MessageScroller>
            )}
          </div>

          <div className="px-6 pb-5 md:px-8">
            <form ref={formRef} onSubmit={onSubmit} className="w-full">
              <InputGroup className="rounded-2xl px-2 py-1 shadow-sm">
                <InputGroupTextarea
                  value={text}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Ask anything..."
                  aria-label="Message"
                  className="min-h-12 border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      formRef.current?.requestSubmit();
                    }
                  }}
                />
                <InputGroupAddon align="block-end" className="pt-1 pb-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <InputGroupButton
                          aria-label="Model and reasoning effort"
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          className="max-w-40 gap-1 overflow-hidden text-xs"
                        />
                      }
                    >
                      <span className="truncate">{selectedModel.label}</span>
                      {selectedModel.effortMode !== "none" && (
                        <>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-muted-foreground capitalize">
                            {settings.effort}
                          </span>
                        </>
                      )}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" side="top" className="w-64">
                      <DropdownMenuRadioGroup
                        value={settings.modelId}
                        onValueChange={(value) => {
                          if (value) updateSettings({ modelId: value });
                        }}
                      >
                        <DropdownMenuLabel>Model</DropdownMenuLabel>
                        {MODEL_OPTIONS.map((option) => (
                          <DropdownMenuRadioItem key={option.id} value={option.id}>
                            {option.label}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                      {selectedModel.effortMode !== "none" && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuRadioGroup
                            value={settings.effort}
                            onValueChange={(value) => {
                              if (value) {
                                updateSettings({
                                  effort: value as ReasoningEffort,
                                });
                              }
                            }}
                          >
                            <DropdownMenuLabel>Reasoning effort</DropdownMenuLabel>
                            {EFFORTS.map((effort) => (
                              <DropdownMenuRadioItem
                                key={effort}
                                value={effort}
                                className="capitalize"
                              >
                                {effort}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <InputGroupButton
                    type="submit"
                    variant="default"
                    size="icon-sm"
                    disabled={!canSend}
                    className="ml-auto size-9 rounded-full"
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
