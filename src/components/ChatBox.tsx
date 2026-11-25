"use client";

import * as React from "react";
import { useChat } from "@ai-sdk/react";
import {
  ArrowUpIcon,
  GlobeIcon,
  MessageCircleDashedIcon,
  PaperclipIcon,
  PlusIcon,
  RotateCwIcon,
  TelescopeIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { MESSAGE_ANIMATIONS } from "@/lib/message-animations";
import { Markdown } from "@/components/markdown";
import { Trace } from "@/components/ui/trace";
import { ThinkingDots } from "@/components/ui/typing-indicator";
import { StepRow } from "@/components/chat-rows";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
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
import { initialMessages, messageContent, transport, type ChatMessage } from "@/lib/chat-transport";

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
  const caret = (
    <span
      aria-hidden
      className="ms-0.5 inline-block h-[1em] w-[2px] translate-y-[0.15em] rounded-sm bg-foreground animate-caret-blink motion-reduce:animate-none"
    />
  );

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
                    {busy && messages.at(-1)?.role === "user" && (
                      <MessageScrollerItem key="thinking" scrollAnchor>
                        <Message>
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
                        <MotionMessageScrollerItem
                          key={message.id}
                          messageId={message.id}
                          scrollAnchor={streaming}
                          variants={MESSAGE_ANIMATIONS["slide-up"].variants}
                          initial={shouldReduceMotion ? false : "initial"}
                          animate="animate"
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
                              {reply ? (
                                <Markdown caret={streaming ? caret : undefined}>
                                  {reply}
                                </Markdown>
                              ) : streaming ? (
                                <ThinkingDots />
                              ) : null}
                            </MessageContent>
                          </Message>
                        </MotionMessageScrollerItem>
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
