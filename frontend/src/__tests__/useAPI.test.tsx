import React, { useState, useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";

function mockResponse(body: unknown, status = 200, ok = true) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  };
}

function useAPI<T>(path: string, params: Record<string, string | number> = {}) {
  const [data, setData]       = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const query = Object.entries(params)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");

  const url = `http://localhost:8000${path}${query ? "?" + query : ""}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then((d: T) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e: Error) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [url]);

  return { data, loading, error };
}

function HookHarness<T>({ path, params }: { path: string; params?: Record<string, string | number> }) {
  const { data, loading, error } = useAPI<T>(path, params);
  return (
    <div>
      {loading && <span data-testid="loading">Loading</span>}
      {error   && <span data-testid="error">{error}</span>}
      {data    && <span data-testid="data">{JSON.stringify(data)}</span>}
    </div>
  );
}

beforeEach(() => { (global.fetch as jest.Mock).mockReset(); });

describe("useAPI hook", () => {
  test("shows loading state initially", () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse([]));
    render(<HookHarness path="/api/years" />);
    expect(screen.getByTestId("loading")).toBeInTheDocument();
  });

  test("renders data on successful fetch", async () => {
    const mockData = { years: [2020, 2021, 2022] };
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse(mockData));
    render(<HookHarness path="/api/years" />);
    await waitFor(() => expect(screen.getByTestId("data")).toBeInTheDocument());
    expect(screen.getByTestId("data")).toHaveTextContent(JSON.stringify(mockData));
  });

  test("hides loading after data arrives", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse({ years: [] }));
    render(<HookHarness path="/api/years" />);
    await waitFor(() => expect(screen.queryByTestId("loading")).not.toBeInTheDocument());
  });

  test("shows error on non-ok HTTP response", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse("Not Found", 404, false));
    render(<HookHarness path="/api/missing" />);
    await waitFor(() => expect(screen.getByTestId("error")).toBeInTheDocument());
  });

  test("shows error on network failure", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("Network Error"));
    render(<HookHarness path="/api/years" />);
    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("Network Error"));
  });

  test("appends query params to URL", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse([]));
    render(<HookHarness path="/api/graduates/praxis" params={{ year: "2024" }} />);
    await waitFor(() => expect(screen.queryByTestId("loading")).not.toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith("http://localhost:8000/api/graduates/praxis?year=2024");
  });

  test("omits empty string params from URL", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse([]));
    render(<HookHarness path="/api/students/gpa" params={{ year: "" }} />);
    await waitFor(() => expect(screen.queryByTestId("loading")).not.toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith("http://localhost:8000/api/students/gpa");
  });

  test("does not update state after unmount", async () => {
    let resolve!: (v: unknown) => void;
    const pending = new Promise(r => { resolve = r; });
    (global.fetch as jest.Mock).mockReturnValueOnce(pending);
    const { unmount } = render(<HookHarness path="/api/years" />);
    unmount();
    resolve(mockResponse({ years: [] }));
    await new Promise(r => setTimeout(r, 50));
  });
});
