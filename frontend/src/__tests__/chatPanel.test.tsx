import React, { useState, useRef, useEffect, useCallback } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock scrollIntoView for jsdom
window.HTMLElement.prototype.scrollIntoView = jest.fn();

function mockResponse(body: unknown, status = 200, ok = true) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  };
}

interface ChatMessage { role: "user" | "assistant"; content: string; }

const QUICK = [
  "Which program has the highest Praxis pass rate?",
  "How has retention changed over time?",
  "What's the gender breakdown trend?",
];

const API = "http://localhost:8000";

interface ChatPanelProps { isOpen: boolean; onClose: () => void; }

function ChatPanel({ isOpen, onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([{
    role: "assistant", content: "Hi! I'm your EPP data analyst.",
  }]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = useCallback(async (text?: string) => {
    const content = text || input.trim();
    if (!content || loading) return;
    const newMessages: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { reply: string };
      setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${msg}` }]);
    }
    setLoading(false);
  }, [input, loading, messages]);

  if (!isOpen) return null;

  return (
    <div data-testid="chat-panel">
      <button data-testid="close-btn" onClick={onClose}>×</button>
      <div data-testid="messages">
        {messages.map((m, i) => (
          <div key={i} data-testid={`msg-${i}`} data-role={m.role}>{m.content}</div>
        ))}
        {loading && <div data-testid="loading-indicator">…</div>}
      </div>
      {messages.length < 3 && (
        <div data-testid="quick-prompts">
          {QUICK.map(q => (
            <button key={q} onClick={() => send(q)}>{q}</button>
          ))}
        </div>
      )}
      <input data-testid="chat-input" value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => e.key === "Enter" && send()}
        placeholder="Ask about the data..." />
      <button data-testid="send-btn" onClick={() => send()} disabled={!input.trim() || loading}>↑</button>
      <div ref={endRef} />
    </div>
  );
}

function ChatApp() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button data-testid="fab" onClick={() => setOpen(true)}>🤖</button>
      <ChatPanel isOpen={open} onClose={() => setOpen(false)} />
    </div>
  );
}

beforeEach(() => { (global.fetch as jest.Mock).mockReset(); });

describe("ChatPanel — open / close", () => {
  test("is hidden when isOpen=false", () => {
    render(<ChatPanel isOpen={false} onClose={jest.fn()} />);
    expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument();
  });

  test("is visible when isOpen=true", () => {
    render(<ChatPanel isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
  });

  test("calls onClose when × is clicked", () => {
    const onClose = jest.fn();
    render(<ChatPanel isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("close-btn"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("FAB opens the panel", () => {
    render(<ChatApp />);
    expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("fab"));
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
  });
});

describe("ChatPanel — initial state", () => {
  test("shows welcome message from assistant", () => {
    render(<ChatPanel isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByTestId("messages")).toHaveTextContent("Hi! I'm your EPP data analyst.");
  });

  test("shows quick prompts when message count < 3", () => {
    render(<ChatPanel isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByTestId("quick-prompts")).toBeInTheDocument();
  });

  test("send button is disabled when input is empty", () => {
    render(<ChatPanel isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByTestId("send-btn")).toBeDisabled();
  });
});

describe("ChatPanel — sending messages", () => {
  test("adds user message to chat after sending", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse({ reply: "Great question!" }));
    render(<ChatPanel isOpen={true} onClose={jest.fn()} />);
    await userEvent.type(screen.getByTestId("chat-input"), "Hello");
    fireEvent.click(screen.getByTestId("send-btn"));
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  test("clears input after sending", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse({ reply: "Sure!" }));
    render(<ChatPanel isOpen={true} onClose={jest.fn()} />);
    await userEvent.type(screen.getByTestId("chat-input"), "Test message");
    fireEvent.click(screen.getByTestId("send-btn"));
    expect(screen.getByTestId("chat-input")).toHaveValue("");
  });

  test("shows assistant reply after fetch succeeds", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse({ reply: "The pass rate is 99.6%." }));
    render(<ChatPanel isOpen={true} onClose={jest.fn()} />);
    await userEvent.type(screen.getByTestId("chat-input"), "What is the pass rate?");
    fireEvent.click(screen.getByTestId("send-btn"));
    await waitFor(() => expect(screen.getByText("The pass rate is 99.6%.")).toBeInTheDocument());
  });

  test("shows error message when API fails", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse("Server Error", 500, false));
    render(<ChatPanel isOpen={true} onClose={jest.fn()} />);
    await userEvent.type(screen.getByTestId("chat-input"), "Hi");
    fireEvent.click(screen.getByTestId("send-btn"));
    await waitFor(() => expect(screen.getByText(/Error:/)).toBeInTheDocument());
  });

  test("sends message on Enter key press", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse({ reply: "Hello!" }));
    render(<ChatPanel isOpen={true} onClose={jest.fn()} />);
    await userEvent.type(screen.getByTestId("chat-input"), "Enter test");
    fireEvent.keyDown(screen.getByTestId("chat-input"), { key: "Enter" });
    await waitFor(() => expect(screen.getByText("Enter test")).toBeInTheDocument());
  });

  test("calls /api/chat with correct payload", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse({ reply: "OK" }));
    render(<ChatPanel isOpen={true} onClose={jest.fn()} />);
    await userEvent.type(screen.getByTestId("chat-input"), "Test");
    fireEvent.click(screen.getByTestId("send-btn"));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/chat");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body);
    expect(body.messages.at(-1)).toEqual({ role: "user", content: "Test" });
  });
});

describe("ChatPanel — quick prompts", () => {
  test("renders quick prompt buttons initially", () => {
    render(<ChatPanel isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByText(QUICK[0])).toBeInTheDocument();
  });

  test("clicking quick prompt sends it as a message", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse({ reply: "Program answer" }));
    render(<ChatPanel isOpen={true} onClose={jest.fn()} />);
    fireEvent.click(screen.getByText(QUICK[0]));
    await waitFor(() => expect(screen.getAllByText(QUICK[0]).length).toBeGreaterThan(0));
  });

  test("hides quick prompts once there are 3+ messages", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse({ reply: "Reply 1" }));
    render(<ChatPanel isOpen={true} onClose={jest.fn()} />);
    await userEvent.type(screen.getByTestId("chat-input"), "Message 1");
    fireEvent.click(screen.getByTestId("send-btn"));
    await waitFor(() => expect(screen.getByText("Reply 1")).toBeInTheDocument());
    expect(screen.queryByTestId("quick-prompts")).not.toBeInTheDocument();
  });
});
