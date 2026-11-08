"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Atom, Check, ChevronDown, Command, Menu, MessageSquarePlus, Paperclip, PanelLeftClose, Settings2, Sparkles, Square, Trash2 } from "lucide-react";
import { models } from "@/lib/models";

type Message = { role: "user" | "assistant"; content: string };
type Chat = { id: string; title: string; messages: Message[]; updatedAt: number };

const starterPrompts = ["Help me understand a complex idea", "Write something worth reading", "Turn a rough idea into a plan"];

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState("");
  const [modelId, setModelId] = useState(models[0].id);
  const [modelOpen, setModelOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeChat = chats.find(c => c.id === activeId);
  const selectedModel = models.find(m => m.id === modelId) || models[0];

  useEffect(() => {
    const saved = localStorage.getItem("avero-chats");
    if (saved) {
      try { const parsed = JSON.parse(saved) as Chat[]; setChats(parsed); if (parsed[0]) setActiveId(parsed[0].id); } catch { localStorage.removeItem("avero-chats"); }
    }
  }, []);
  useEffect(() => { if (chats.length) localStorage.setItem("avero-chats", JSON.stringify(chats)); else localStorage.removeItem("avero-chats"); }, [chats]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [activeChat?.messages, sending]);

  function newChat() {
    const id = crypto.randomUUID();
    setChats(prev => [{ id, title: "New conversation", messages: [], updatedAt: Date.now() }, ...prev]);
    setActiveId(id); setError(""); setInput("");
  }
  function deleteChat(id: string) {
    const next = chats.filter(c => c.id !== id);
    setChats(next); if (activeId === id) setActiveId(next[0]?.id || "");
  }
  async function send(text = input) {
    const content = text.trim();
    if (!content || sending) return;
    const id = activeId || crypto.randomUUID();
    const existing = chats.find(c => c.id === id);
    const prior = existing?.messages || [];
    const nextMessages: Message[] = [...prior, { role: "user", content }, { role: "assistant", content: "" }];
    const title = existing?.title === "New conversation" || !existing ? content.slice(0, 42) : existing.title;
    setChats(prev => existing ? prev.map(c => c.id === id ? { ...c, title, messages: nextMessages, updatedAt: Date.now() } : c) : [{ id, title, messages: nextMessages, updatedAt: Date.now() }, ...prev]);
    setActiveId(id); setInput(""); setSending(true); setError("");
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: modelId, messages: [...prior, { role: "user", content }] }) });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || "No se pudo conectar con el proveedor."); }
      if (!response.body) throw new Error("El navegador no recibió una respuesta en streaming.");
      const reader = response.body.getReader(); const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setChats(prev => prev.map(c => c.id === id ? { ...c, messages: c.messages.map((m, i) => i === c.messages.length - 1 ? { ...m, content: m.content + chunk } : m) } : c));
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error inesperado.";
      setError(message);
      setChats(prev => prev.map(c => c.id === id ? { ...c, messages: c.messages.slice(0, -1) } : c));
    } finally { setSending(false); textareaRef.current?.focus(); }
  }

  return (
    <main className="app-shell">
      {sidebarOpen && <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Atom size={19} strokeWidth={1.8}/></div><span>avero<span className="brand-ai">ai</span></span><button className="icon-button sidebar-toggle" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar"><PanelLeftClose size={17}/></button></div>
        <button className="new-chat" onClick={newChat}><MessageSquarePlus size={17}/> New conversation <span>⌘ K</span></button>
        <div className="side-label">YOUR SPACE</div>
        <div className="chat-list">{chats.map(chat => <div key={chat.id} className={chat.id === activeId ? "chat-item active" : "chat-item"}><button onClick={() => { setActiveId(chat.id); setError(""); }}>{chat.title}</button><button className="delete-chat" onClick={() => deleteChat(chat.id)} aria-label="Delete conversation"><Trash2 size={14}/></button></div>)}</div>
        <div className="sidebar-bottom"><div className="user-avatar">A</div><div className="user-meta"><strong>Personal workspace</strong><span>Free space</span></div><button className="icon-button" aria-label="Settings"><Settings2 size={17}/></button></div>
      </aside>}
      <section className="workspace">
        <header className="topbar">
          <div className="topbar-left">{!sidebarOpen && <button className="icon-button" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar"><Menu size={18}/></button>}<span className="breadcrumb">Workspace <span>/</span> <b>{activeChat?.title || "New conversation"}</b></span></div>
          <div className="topbar-right"><span className="status-dot"/> All systems ready <span className="top-divider"/> <button className="icon-button" aria-label="Settings"><Settings2 size={17}/></button></div>
        </header>
        <div className="model-wrap"><button className="model-select" onClick={() => setModelOpen(!modelOpen)}><span className="model-orb"><Sparkles size={14}/></span><span><small>MODEL</small><strong>{selectedModel.name}</strong></span><ChevronDown size={15}/></button>
          {modelOpen && <div className="model-menu">{models.map(model => <button key={model.id} onClick={() => { setModelId(model.id); setModelOpen(false); }} className={model.id === modelId ? "model-option chosen" : "model-option"}><span className="model-option-icon"><Sparkles size={14}/></span><span><strong>{model.name}</strong><small>{model.provider} · {model.description}</small></span>{model.id === modelId && <Check size={15}/>}</button>)}</div>}
        </div>
        <div className="conversation">
          {!activeChat?.messages.length ? <div className="welcome"><div className="welcome-symbol"><Atom size={31} strokeWidth={1.4}/><span/></div><div className="eyebrow">A NEW KIND OF THINKING SPACE</div><h1>One space.<br/><em>Every intelligence.</em></h1><p>Meet your ideas with the right intelligence.<br/>What would you like to explore today?</p><div className="prompt-grid">{starterPrompts.map((prompt, i) => <button key={prompt} onClick={() => send(prompt)}><span>0{i+1}</span>{prompt}<ArrowUp size={15}/></button>)}</div></div> :
            <div className="messages">{activeChat.messages.map((message, i) => <article className={message.role === "user" ? "message user-message" : "message assistant-message"} key={i}><div className="message-avatar">{message.role === "user" ? "Y" : <Atom size={16}/>}</div><div className="message-body"><div className="message-label">{message.role === "user" ? "YOU" : selectedModel.name.toUpperCase()}</div><div className="message-content">{message.content || (sending && i === activeChat.messages.length - 1 ? <span className="typing"><i/><i/><i/></span> : "")}</div></div></article>)}<div ref={bottomRef}/></div>}
        </div>
        {error && <div className="error-banner">{error}</div>}
        <div className="composer-area"><div className="composer"><textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Ask anything. Start anywhere..." rows={1}/><div className="composer-footer"><div className="composer-tools"><button className="icon-button" aria-label="Attach file" title="Attachments coming soon"><Paperclip size={17}/></button><span className="composer-hint"><Command size={11}/> Enter to send · Shift + Enter for a new line</span></div><button className="send-button" onClick={() => send()} disabled={!input.trim() || sending} aria-label="Send message">{sending ? <Square size={14} fill="currentColor"/> : <ArrowUp size={17}/>}</button></div></div><div className="disclaimer">AveroAI can make mistakes. Verify important information.</div></div>
      </section>
    </main>
  );
}
