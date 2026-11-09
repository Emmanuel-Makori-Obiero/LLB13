import { useEffect, useState, type FormEvent } from "react";
import { Loader2, MessageCircle, Search, Send, UserRound } from "lucide-react";
import { repository, supabase } from "./data/repository";
import type { DirectMessage, DirectoryUser } from "./data/types";
import "./messages.css";

export default function MessagesPage() {
  const [profile, setProfile] = useState<DirectoryUser | null>(null);
  const [username, setUsername] = useState("");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [selected, setSelected] = useState<DirectoryUser | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [userId, setUserId] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const [{ data: auth }, nextProfile] = await Promise.all([supabase?.auth.getUser() ?? Promise.resolve({ data: { user: null } }), repository.getMyDirectoryProfile()]);
        setUserId(auth.user?.id ?? ""); setProfile(nextProfile); setUsername(nextProfile?.username ?? "");
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load your messaging profile."); }
    })();
  }, []);
  useEffect(() => {
    if (!userId || !supabase) return;
    let active = true;
    const client = supabase;
    const channel = client.channel(`direct-message-inbox-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages", filter: `recipient_id=eq.${userId}` }, (payload) => {
        const incoming = payload.new as DirectMessage;
        void repository.getDirectoryUser(incoming.sender_id).then((sender) => {
          if (!active) return;
          if (sender) {
            setSelected(sender);
            setNotice(`New message from @${sender.username}.`);
          } else {
            setNotice("You have a new message. Search for the sender to open it.");
          }
        }).catch(() => {
          if (active) setNotice("You have a new message. Search for the sender to open it.");
        });
      })
      .subscribe();
    return () => { active = false; void client.removeChannel(channel); };
  }, [userId]);
  useEffect(() => {
    if (!selected) return;
    const load = async () => { try { setMessages(await repository.getDirectMessages(selected.user_id)); await repository.markDirectMessagesDelivered(selected.user_id); await repository.markDirectMessagesRead(selected.user_id); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load this conversation."); } };
    void load();
  }, [selected?.user_id]);
  const saveUsername = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try { const next = await repository.setMyUsername(username); setProfile(next); setUsername(next.username); setNotice("Username saved. Other learners can now find you by this name."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save username."); } finally { setBusy(false); }
  };
  const search = async (event?: FormEvent) => {
    event?.preventDefault(); setSearching(true); setError("");
    try { setUsers((await repository.searchDirectoryUsers(query)).filter((user) => user.user_id !== userId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not search users."); } finally { setSearching(false); }
  };
  const send = async (event: FormEvent) => {
    event.preventDefault(); if (!selected || !draft.trim()) return;
    setBusy(true); setError("");
    try { const message = await repository.sendDirectMessage(selected.user_id, draft); setMessages((current) => [...current, message]); setDraft(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not send message."); } finally { setBusy(false); }
  };
  return <div className="messages-page">
    <div className="page-heading"><div><div className="eyebrow">Private platform conversations</div><h1>Messages.</h1><p className="subheading">Choose a username, find another learner, and send a private message. Only the two people in a conversation can read it.</p></div></div>
    {error && <div className="connection-error" role="alert">{error}</div>}{notice && <div className="success-notice">{notice}</div>}
    <div className="messages-layout">
      <aside className="card card-pad messages-sidebar">
        <div className="section-label"><UserRound size={14} /> Your username</div>
        <form className="messages-username-form" onSubmit={(event) => void saveUsername(event)}><input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} minLength={3} maxLength={30} pattern="[a-z0-9._]+" placeholder="e.g. em.makori_" /><button className="primary-button" disabled={busy || username.length < 3}>{busy ? <Loader2 size={14} className="messages-spin" /> : <Send size={14} />} Save</button></form>
        <p className="field-hint">Use 3–30 lowercase letters, numbers, periods, or underscores.</p>
        <div className="section-label messages-search-label"><Search size={14} /> Find a learner</div>
        <form className="messages-search-form" onSubmit={(event) => void search(event)}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search username or name" /><button type="submit" aria-label="Search" disabled={searching}>{searching ? <Loader2 size={14} className="messages-spin" /> : <Search size={14} />}</button></form>
        <div className="messages-user-list">{users.map((user) => <button type="button" className={`messages-user ${selected?.user_id === user.user_id ? "active" : ""}`} key={user.user_id} onClick={() => setSelected(user)}><span className="messages-avatar">{user.display_name.slice(0, 1).toUpperCase()}</span><span><strong>{user.display_name}</strong><small>@{user.username}</small></span></button>)}{!users.length && <p className="empty">Search for a username to start a conversation.</p>}</div>
      </aside>
      <section className="card card-pad messages-thread">
        {!selected ? <div className="messages-empty"><MessageCircle size={28} /><h2>Choose someone to message</h2><p>Search by username or display name on the left.</p></div> : <><div className="messages-thread-head"><div className="messages-avatar">{selected.display_name.slice(0, 1).toUpperCase()}</div><div><strong>{selected.display_name}</strong><small>@{selected.username}</small></div></div><div className="messages-body">{messages.length ? messages.map((message) => <div className={`messages-bubble ${message.sender_id === userId ? "mine" : "theirs"}`} key={message.id}><p>{message.body}</p><small>{new Date(message.created_at).toLocaleString("en-GB")}{message.sender_id === userId && <span className="message-status"> · {message.read_at ? "Seen" : message.delivered_at ? "Delivered" : "Sent"}</span>}</small></div>) : <p className="empty">No messages yet. Start the conversation.</p>}</div><form className="messages-compose" onSubmit={(event) => void send(event)}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={2} maxLength={4000} placeholder={`Message @${selected.username}…`} /><button className="primary-button" disabled={busy || !draft.trim()}>{busy ? <Loader2 size={14} className="messages-spin" /> : <Send size={14} />} Send</button></form></>}
      </section>
    </div>
  </div>;
}
