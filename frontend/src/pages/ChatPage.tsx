import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../lib/api";
import { useAuth } from "../context/AuthContext";

type ChatMessage = {
  id: string;
  user_id: string | null;
  user_pseudo: string;
  user_avatar_url: string | null;
  user_role: "user" | "admin" | "system";
  message_type: "user" | "system";
  message: string;
  created_at: string;
};

type ChatMessagesResponse = { messages: ChatMessage[] };

type CassierResponse = {
  bans: Array<{ id: string; reason: string; expiresAt: string | null; createdAt: string; isActive: boolean }>;
  mutes: Array<{ id: string; reason: string; expiresAt: string | null; createdAt: string; isActive: boolean }>;
  warnings: Array<{ id: string; reason: string; createdAt: string; adminPseudo: string; isActive: boolean }>;
};

const ADMIN_COMMANDS: Array<{ command: string; description: string }> = [
  { command: "/clear", description: "Efface le tchat" },
  { command: "/maintenance-on", description: "Active la maintenance" },
  { command: "/maintenance-off", description: "Désactive la maintenance" },
  { command: "/ban", description: "Bannir un utilisateur (@pseudo [durée en minutes] [motif])" },
  { command: "/unban", description: "Débannir un utilisateur (@pseudo)" },
  { command: "/mute", description: "Rendre muet un utilisateur (@pseudo [durée en minutes] [motif])" },
  { command: "/unmute", description: "Rendre la parole à un utilisateur (@pseudo)" },
  { command: "/warn", description: "Avertir un utilisateur (@pseudo [motif])" },
  { command: "/warnings", description: "Voir les avertissements (@pseudo)" }
];

type OnlineUser = {
  user_id: string;
  user_pseudo: string;
  user_avatar_url: string | null;
  user_role: "user" | "admin";
  last_seen_at: string;
};

type OnlineUsersResponse = { users: OnlineUser[] };

type ChatStatusResponse = {
  maintenance_enabled: boolean;
  updated_at: string;
};

type PublicProfileResponse = {
  user: {
    id: string;
    pseudo: string;
    chat_status: "online" | "inactive" | "offline";
    bio: string | null;
    avatar_url: string | null;
    created_at: string | null;
    last_login_at: string | null;
    discord_url: string | null;
    x_url: string | null;
    bluesky_url: string | null;
    stoat_url: string | null;
    youtube_url: string | null;
    twitch_url: string | null;
    kick_url: string | null;
    snapchat_url: string | null;
    tiktok_url: string | null;
    badges: Array<{ id: string; slug: string; label: string; image_url: string }>;
  };
  servers: Array<{ id: string; name: string; category_label: string; created_at: string; premium_type: string | null }>;
};

export function ChatPage(): JSX.Element {
  const { token, isAuthenticated, user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<PublicProfileResponse | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState<number>(0);
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [commandSelectedIndex, setCommandSelectedIndex] = useState(0);
  const [userSuggestions, setUserSuggestions] = useState<OnlineUser[]>([]);
  const [userSuggestionQuery, setUserSuggestionQuery] = useState("");
  const [userSuggestionSelectedIndex, setUserSuggestionSelectedIndex] = useState(0);
  const [showUserSuggestions, setShowUserSuggestions] = useState(false);

  const lastCreatedAt = useMemo(() => (messages.length ? messages[messages.length - 1].created_at : null), [messages]);

  function isNearBottom(): boolean {
    const node = scrollRef.current;
    if (!node) return true;
    return node.scrollHeight - node.scrollTop - node.clientHeight < 120;
  }

  function scrollToBottom(): void {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }

  function renderMessageContent(raw: string): Array<JSX.Element | string> {
    const urlRegex = /((https?:\/\/|www\.)[^\s<]+)/gi;
    const parts: Array<JSX.Element | string> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = urlRegex.exec(raw)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (start > lastIndex) parts.push(raw.slice(lastIndex, start));

      const urlText = match[0];
      const href = urlText.toLowerCase().startsWith("http") ? urlText : `https://${urlText}`;
      parts.push(
        <a key={`${start}-${end}`} className="chat-link" href={href} target="_blank" rel="noreferrer noopener">
          {urlText}
        </a>
      );
      lastIndex = end;
    }
    if (lastIndex < raw.length) parts.push(raw.slice(lastIndex));
    return parts;
  }

  async function deleteMessage(messageId: string): Promise<void> {
    if (!token) return;
    if (user?.role !== "admin") return;
    
    try {
      const result = await apiRequest<{ message: ChatMessage }>(`/chat/messages/${messageId}`, {
        method: "DELETE",
        token
      });
      
      // Remove the deleted message from the UI
      setMessages((current) => current.filter((msg) => msg.id !== messageId));
      
      // Add the system message about deletion
      setMessages((current) => [...current, result.message].slice(-200));
      
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de supprimer le message.");
    }
  }

  useEffect(() => {
    async function loadInitial(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const data = await apiRequest<ChatMessagesResponse>("/chat/messages?limit=50");
        setMessages(data.messages);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Impossible de charger le tchat.");
      } finally {
        setLoading(false);
      }
    }
    void loadInitial();
  }, []);

  useEffect(() => {
    if (loading) return;
    const shouldScroll = isNearBottom();
    if (shouldScroll) scrollToBottom();
  }, [loading, messages.length]);

  useEffect(() => {
    let cancelled = false;
    if (loading) return;

    const interval = window.setInterval(() => {
      void (async () => {
        try {
          const after = lastCreatedAt ? `?after=${encodeURIComponent(lastCreatedAt)}&limit=200` : "?limit=50";
          const data = await apiRequest<ChatMessagesResponse>(`/chat/messages${after}`);
          if (cancelled) return;
          if (!data.messages.length) return;

          setMessages((current) => {
            const existing = new Set(current.map((m) => m.id));
            const merged = [...current];
            for (const msg of data.messages) {
              if (!existing.has(msg.id)) merged.push(msg);
            }
            return merged.slice(-200);
          });
        } catch {
          return;
        }
      })();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [loading, lastCreatedAt]);

  useEffect(() => {
    if (!token) return;
    void apiRequest<void>("/chat/presence", { method: "POST", token }).catch(() => undefined);
    const interval = window.setInterval(() => {
      void apiRequest<void>("/chat/presence", { method: "POST", token }).catch(() => undefined);
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    const interval = window.setInterval(() => {
      void (async () => {
        try {
          const data = await apiRequest<OnlineUsersResponse>("/chat/online?window=60&limit=50");
          if (cancelled) return;
          setOnlineUsers(data.users);
        } catch {
          if (cancelled) return;
          setOnlineUsers([]);
        }
      })();
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiRequest<ChatStatusResponse>("/chat/status");
        if (cancelled) return;
        setMaintenanceEnabled(data.maintenance_enabled);
      } catch {
        return;
      }
    })();

    const interval = window.setInterval(() => {
      void (async () => {
        try {
          const data = await apiRequest<ChatStatusResponse>("/chat/status");
          if (cancelled) return;
          setMaintenanceEnabled(data.maintenance_enabled);
        } catch {
          return;
        }
      })();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!cooldownUntil) {
      setCooldownRemainingMs(0);
      return;
    }
    const interval = window.setInterval(() => {
      const remaining = Math.max(0, cooldownUntil - Date.now());
      setCooldownRemainingMs(remaining);
      if (remaining === 0) {
        window.clearInterval(interval);
      }
    }, 200);
    return () => window.clearInterval(interval);
  }, [cooldownUntil]);

  async function openProfile(userId: string): Promise<void> {
    setSelectedUserId(userId);
    setProfileLoading(true);
    setProfileError(null);
    setProfileData(null);
    try {
      const data = await apiRequest<PublicProfileResponse>(`/users/${encodeURIComponent(userId)}/profile`);
      setProfileData(data);
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : "Impossible de charger le profil.");
    } finally {
      setProfileLoading(false);
    }
  }

  function closeProfile(): void {
    setSelectedUserId(null);
    setProfileData(null);
    setProfileError(null);
    setProfileLoading(false);
  }

  async function sendCurrentMessage(): Promise<void> {
    const normalized = text.trim();
    if (!normalized) return;
    if (!token) return;
    if (cooldownRemainingMs > 0) return;

    if (normalized === "/clear") {
      if (user?.role !== "admin") {
        setError("Commande réservée aux administrateurs.");
        return;
      }
      setSending(true);
      setError(null);
      try {
        const result = await apiRequest<{ message: ChatMessage }>("/chat/clear", { method: "POST", token });
        setText("");
        setMessages([result.message]);
        scrollToBottom();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Impossible de vider le tchat.");
      } finally {
        setSending(false);
      }
      return;
    }

    if (normalized === "/maintenance-on" || normalized === "/maintenance-off") {
      if (user?.role !== "admin") {
        setError("Commande réservée aux administrateurs.");
        return;
      }
      const enabled = normalized === "/maintenance-on";
      setSending(true);
      setError(null);
      try {
        const result = await apiRequest<{ message: ChatMessage; maintenance_enabled: boolean }>("/chat/maintenance", {
          method: "POST",
          token,
          body: { enabled }
        });
        setText("");
        setMaintenanceEnabled(result.maintenance_enabled);
        setMessages((current) => [...current, result.message].slice(-200));
        scrollToBottom();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Impossible de modifier la maintenance du tchat.");
      } finally {
        setSending(false);
      }
      return;
    }

    if (maintenanceEnabled && user?.role !== "admin") {
      setError("Maintenance du tchat en cours.");
      return;
    }

    if (normalized === "/cassier") {
      setSending(true);
      setError(null);
      try {
        const result = await apiRequest<CassierResponse>("/chat/moderation/cassier?limit=50", { token });
        const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        });

        const lines: string[] = [];
        lines.push("📋 Votre casier de modération");
        lines.push("");
        lines.push("Bannissements:");
        if (result.bans.length === 0) {
          lines.push("Aucun bannissement.");
        } else {
          result.bans.forEach((ban) => {
            const status = ban.isActive ? "Actif" : "Inactif";
            const endLabel = ban.expiresAt ? `jusqu'au ${dateFormatter.format(new Date(ban.expiresAt))}` : "permanent";
            lines.push(`- [${status}] ${endLabel} — ${ban.reason}`);
          });
        }
        lines.push("");
        lines.push("Mutes:");
        if (result.mutes.length === 0) {
          lines.push("Aucun mute.");
        } else {
          result.mutes.forEach((mute) => {
            const status = mute.isActive ? "Actif" : "Inactif";
            const endLabel = mute.expiresAt ? `jusqu'au ${dateFormatter.format(new Date(mute.expiresAt))}` : "permanent";
            lines.push(`- [${status}] ${endLabel} — ${mute.reason}`);
          });
        }
        lines.push("");
        lines.push("Avertissements:");
        if (result.warnings.length === 0) {
          lines.push("Aucun avertissement.");
        } else {
          result.warnings.forEach((warning) => {
            const status = warning.isActive ? "Actif" : "Inactif";
            lines.push(`- [${status}] ${dateFormatter.format(new Date(warning.createdAt))} — ${warning.reason} (par ${warning.adminPseudo})`);
          });
          lines.push("Actif = avertissement de moins de 30 jours.");
        }

        const localMsg: ChatMessage = {
          id: "local-" + Date.now(),
          user_id: null,
          user_pseudo: "Système",
          user_avatar_url: null,
          user_role: "system",
          message_type: "system",
          message: lines.join("\n"),
          created_at: new Date().toISOString()
        };
        setMessages((current) => [...current, localMsg].slice(-200));
        setText("");
        scrollToBottom();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Impossible de récupérer le casier.");
      } finally {
        setSending(false);
      }
      return;
    }

    // Handle moderation commands
    if (normalized.startsWith("/ban ") || normalized.startsWith("/unban ") || normalized.startsWith("/mute ") || normalized.startsWith("/unmute ") || normalized.startsWith("/warn ") || normalized.startsWith("/warnings ")) {
      if (user?.role !== "admin") {
        setError("Commande réservée aux administrateurs.");
        return;
      }
      
      setSending(true);
      setError(null);
      
      try {
        let endpoint = "";
        let body: any = {};
        
        if (normalized.startsWith("/ban ")) {
          const args = normalized.slice(5).trim();
          const parts = args.split(" ");
          if (parts.length < 2) {
            setError("Usage: /ban @pseudo [durée en minutes] [motif] (ex: /ban @user 30m Spam)");
            setSending(false);
            return;
          }
          
          const targetUser = parts[0].replace("@", "");
          const durationStr = parts[1].toLowerCase();
          let durationHours: number | undefined;

          if (durationStr === "permanent") {
            durationHours = undefined;
          } else if (durationStr.endsWith("h")) {
            durationHours = parseFloat(durationStr.replace("h", ""));
          } else {
            const minutesValue = durationStr.endsWith("m")
              ? parseFloat(durationStr.replace("m", ""))
              : parseFloat(durationStr);
            durationHours = minutesValue / 60;
          }

          const reason = parts.slice(2).join(" ") || "Aucune raison spécifiée";
          
          endpoint = "/chat/moderation/ban";
          body = { targetUser, durationHours, reason };
          
        } else if (normalized.startsWith("/unban ")) {
          const targetUser = normalized.slice(7).trim().replace("@", "");
          if (!targetUser) {
            setError("Usage: /unban @pseudo");
            setSending(false);
            return;
          }
          
          endpoint = "/chat/moderation/unban";
          body = { targetUser };
          
        } else if (normalized.startsWith("/mute ")) {
          const args = normalized.slice(6).trim();
          const parts = args.split(" ");
          if (parts.length < 2) {
            setError("Usage: /mute @pseudo [durée en minutes] [motif] (ex: /mute @user 30m Spam)");
            setSending(false);
            return;
          }
          
          const targetUser = parts[0].replace("@", "");
          const durationStr = parts[1].toLowerCase();
          let durationHours: number | undefined;

          if (durationStr === "permanent") {
            durationHours = undefined;
          } else if (durationStr.endsWith("h")) {
            durationHours = parseFloat(durationStr.replace("h", ""));
          } else {
            const minutesValue = durationStr.endsWith("m")
              ? parseFloat(durationStr.replace("m", ""))
              : parseFloat(durationStr);
            durationHours = minutesValue / 60;
          }

          const reason = parts.slice(2).join(" ") || "Aucune raison spécifiée";
          
          endpoint = "/chat/moderation/mute";
          body = { targetUser, durationHours, reason };
          
        } else if (normalized.startsWith("/unmute ")) {
          const targetUser = normalized.slice(8).trim().replace("@", "");
          if (!targetUser) {
            setError("Usage: /unmute @pseudo");
            setSending(false);
            return;
          }
          
          endpoint = "/chat/moderation/unmute";
          body = { targetUser };
          
        } else if (normalized.startsWith("/warn ")) {
          const args = normalized.slice(6).trim();
          const parts = args.split(" ");
          if (parts.length < 2) {
            setError("Usage: /warn @pseudo [motif] (ex: /warn @user Spam)");
            setSending(false);
            return;
          }
          
          const targetUser = parts[0].replace("@", "");
          const reason = parts.slice(1).join(" ");
          
          endpoint = "/chat/moderation/warn";
          body = { targetUser, reason };
          
        } else if (normalized.startsWith("/warnings ")) {
          const targetUser = normalized.slice(10).trim().replace("@", "");
          if (!targetUser) {
            setError("Usage: /warnings @pseudo");
            setSending(false);
            return;
          }
          
          endpoint = "/chat/moderation/warnings";
          body = { targetUser };
        }
        
        const result = await apiRequest<any>(endpoint, {
          method: "POST",
          token,
          body
        });
        
        if (endpoint.includes("/warnings")) {
          const warningsList = result.warnings.map((w: any) => 
            `- ${new Date(w.createdAt).toLocaleDateString()} par ${w.adminPseudo}: ${w.reason}`
          ).join("\n");
          
          const localMsg: ChatMessage = {
            id: "local-" + Date.now(),
            user_id: null,
            user_pseudo: "Système",
            user_avatar_url: null,
            user_role: "system",
            message_type: "system",
            message: `Avertissements pour ${body.targetUser} (${result.totalCount}):\n${warningsList || "Aucun avertissement."}`,
            created_at: new Date().toISOString()
          };
          setMessages((current) => [...current, localMsg].slice(-200));
        } else {
          // For other commands, rely on polling to show the system message
          // But we can show a success toast or just clear the input
        }
        
        setText("");
        scrollToBottom();
        
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur lors de l'exécution de la commande.");
      } finally {
        setSending(false);
      }
      return;
    }

    setSending(true);
    setError(null);
    try {
      const created = await apiRequest<{ message: ChatMessage }>("/chat/messages", {
        method: "POST",
        token,
        body: { message: normalized }
      });
      setText("");
      setMessages((current) => {
        if (current.some((m) => m.id === created.message.id)) return current;
        return [...current, created.message].slice(-200);
      });
      scrollToBottom();
      setCooldownUntil(Date.now() + 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible d'envoyer le message.");
    } finally {
      setSending(false);
    }
  }

  const cooldownSeconds = Math.ceil(cooldownRemainingMs / 1000);
  const isAdmin = user?.role === "admin";
  const canUseCommands = isAuthenticated && Boolean(token) && isAdmin;
  const inputDisabled = !isAuthenticated || sending || cooldownRemainingMs > 0 || (!isAdmin && maintenanceEnabled);
  const commandQuery = canUseCommands && text.trimStart().startsWith("/") ? text.trim() : "";
  const commandSuggestions = useMemo(() => {
    if (!commandQuery) return [];
    return ADMIN_COMMANDS.filter((c) => c.command.startsWith(commandQuery)).slice(0, 6);
  }, [commandQuery]);

  useEffect(() => {
    if (!commandMenuOpen) return;
    if (commandSelectedIndex >= commandSuggestions.length) setCommandSelectedIndex(0);
  }, [commandMenuOpen, commandSelectedIndex, commandSuggestions.length]);

  return (
    <section className="page chat-page">
      <div className="chat-head">
        <div>
          <h1>Tchat en direct</h1>
          <p>Discutez avec la communauté en temps réel (rafraîchissement automatique).</p>
        </div>
        <div className="chat-head-meta">
          <span className="chat-pill">{messages.length} messages</span>
          {isAuthenticated && user?.pseudo && <span className="chat-pill">Connecté : {user.pseudo}</span>}
        </div>
      </div>

      <div className="chat-layout">
        <div className="card chat-card">
          <div className="chat-messages" ref={scrollRef} role="log" aria-label="Messages du tchat">
            {loading && <p>Chargement...</p>}
            {!loading && error && <p className="error-text">{error}</p>}
            {!loading && !error && messages.length === 0 && <p>Aucun message pour le moment.</p>}
            {!loading &&
              !error &&
              messages.map((msg) => (
                <div key={msg.id} className={`chat-message ${msg.message_type === "system" ? "is-system" : ""}`}>
                  {msg.user_avatar_url ? (
                    <img className="chat-avatar" src={msg.user_avatar_url} alt={`Avatar de ${msg.user_pseudo}`} loading="lazy" />
                  ) : (
                    <span className="chat-avatar chat-avatar-fallback" aria-hidden="true">
                      {msg.user_pseudo.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="chat-bubble">
                    <div className="chat-bubble-head">
                      <div className="chat-author">
                        {msg.message_type === "system" || !msg.user_id ? (
                          <span className="chat-user-button chat-user-button-static">{msg.user_pseudo}</span>
                        ) : (
                          <button
                            className="chat-user-button"
                            type="button"
                            onClick={() => {
                              if (msg.user_id) void openProfile(msg.user_id);
                            }}
                          >
                            {msg.user_pseudo}
                          </button>
                        )}
                        {msg.message_type !== "system" && msg.user_role === "admin" ? <span className="chat-admin-badge">ADMIN</span> : null}
                      </div>
                      <span className="chat-time">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="chat-text">{renderMessageContent(msg.message)}</p>
                    {isAdmin && msg.user_id && msg.message_type !== "system" ? (
                      <div className="chat-actions">
                        <button
                          type="button"
                          className="chat-action-btn chat-action-mute"
                          title={`Rendre muet ${msg.user_pseudo}`}
                          onClick={() => {
                            const duration = prompt(`Durée pour rendre ${msg.user_pseudo} muet ? (ex: 30m, 90m, permanent)`);
                            if (duration) {
                              const reason = prompt("Motif du mute (optionnel):") || "Aucune raison spécifiée";
                              setText(`/mute @${msg.user_pseudo} ${duration} ${reason}`);
                              inputRef.current?.focus();
                            }
                          }}
                        >
                          🔇
                        </button>
                        <button
                          type="button"
                          className="chat-action-btn chat-action-ban"
                          title={`Bannir ${msg.user_pseudo}`}
                          onClick={() => {
                            const duration = prompt(`Durée pour bannir ${msg.user_pseudo} ? (ex: 30m, 120m, permanent)`);
                            if (duration) {
                              const reason = prompt("Motif du ban (optionnel):") || "Aucune raison spécifiée";
                              setText(`/ban @${msg.user_pseudo} ${duration} ${reason}`);
                              inputRef.current?.focus();
                            }
                          }}
                        >
                          🔨
                        </button>
                        <button
                          type="button"
                          className="chat-action-btn chat-action-warn"
                          title={`Avertir ${msg.user_pseudo}`}
                          onClick={() => {
                            const reason = prompt(`Motif de l'avertissement pour ${msg.user_pseudo}:`);
                            if (reason) {
                              setText(`/warn @${msg.user_pseudo} ${reason}`);
                              inputRef.current?.focus();
                            }
                          }}
                        >
                          ⚠️
                        </button>
                        <button
                          type="button"
                          className="chat-action-btn chat-action-delete"
                          title="Supprimer ce message"
                          onClick={() => {
                            if (confirm("Êtes-vous sûr de vouloir supprimer ce message ?")) {
                              void deleteMessage(msg.id);
                            }
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
          </div>

          <div className="chat-compose">
            {!isAuthenticated ? (
              <p className="chat-login-hint">
                <Link to="/login">Connectez-vous</Link> pour envoyer des messages.
              </p>
            ) : null}
            {isAdmin && maintenanceEnabled ? <p className="chat-maintenance-admin">Maintenance du tchat activée.</p> : null}

            <form
              className="chat-form"
              onSubmit={(e) => {
                e.preventDefault();
                void sendCurrentMessage();
              }}
            >
              <div className="chat-input-wrap">
                {!isAdmin && maintenanceEnabled ? (
                  <div className="chat-maintenance-input" aria-disabled="true">
                    Maintenance du tchat en cours : envoi de messages désactivé.
                  </div>
                ) : (
                  <textarea
                    ref={inputRef}
                    value={text}
                    onChange={(event) => {
                      const next = event.target.value;
                      setText(next);
                      
                      // Handle command suggestions
                      if (canUseCommands && next.trimStart().startsWith("/")) {
                        setCommandMenuOpen(true);
                      } else {
                        setCommandMenuOpen(false);
                      }
                      setCommandSelectedIndex(0);
                      
                      // Handle user suggestions with @
                      const cursorPosition = event.target.selectionStart;
                      const textBeforeCursor = next.slice(0, cursorPosition);
                      const lastAtIndex = textBeforeCursor.lastIndexOf("@");
                      
                      if (lastAtIndex !== -1 && cursorPosition > lastAtIndex) {
                        const query = textBeforeCursor.slice(lastAtIndex + 1);
                        // Only trigger if there's no space after @ and we're not at the end of a word
                        if (!query.includes(" ") && (cursorPosition === next.length || next[cursorPosition] === " ")) {
                          const filteredUsers = onlineUsers.filter(user => 
                            user.user_pseudo.toLowerCase().startsWith(query.toLowerCase())
                          );
                          setUserSuggestions(filteredUsers);
                          setUserSuggestionQuery(query);
                          setUserSuggestionSelectedIndex(0);
                          setShowUserSuggestions(filteredUsers.length > 0);
                        } else {
                          setShowUserSuggestions(false);
                        }
                      } else {
                        setShowUserSuggestions(false);
                      }
                    }}
                    onKeyDown={(event) => {
                      const showCommandMenu = canUseCommands && commandMenuOpen && commandSuggestions.length > 0 && commandQuery.startsWith("/");
                      const showUserMenu = showUserSuggestions && userSuggestions.length > 0;
                      
                      // Handle Escape key
                      if (event.key === "Escape") {
                        if (commandMenuOpen) {
                          event.preventDefault();
                          setCommandMenuOpen(false);
                          return;
                        }
                        if (showUserSuggestions) {
                          event.preventDefault();
                          setShowUserSuggestions(false);
                          return;
                        }
                      }
                      
                      // Handle user suggestion navigation
                      if (showUserMenu) {
                        if (event.key === "ArrowDown") {
                          event.preventDefault();
                          setUserSuggestionSelectedIndex((i) => Math.min(i + 1, userSuggestions.length - 1));
                          return;
                        }
                        if (event.key === "ArrowUp") {
                          event.preventDefault();
                          setUserSuggestionSelectedIndex((i) => Math.max(i - 1, 0));
                          return;
                        }
                        if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
                          event.preventDefault();
                          const selected = userSuggestions[userSuggestionSelectedIndex] ?? userSuggestions[0];
                          if (selected) {
                            // Replace the @query with the selected user
                            const cursorPosition = event.currentTarget.selectionStart;
                            const textBeforeCursor = text.slice(0, cursorPosition);
                            const lastAtIndex = textBeforeCursor.lastIndexOf("@");
                            const beforeAt = text.slice(0, lastAtIndex);
                            const afterCursor = text.slice(cursorPosition);
                            const newText = `${beforeAt}@${selected.user_pseudo} ${afterCursor}`;
                            setText(newText);
                            // Set cursor position after the username
                            setTimeout(() => {
                              const newCursorPos = lastAtIndex + selected.user_pseudo.length + 2;
                              event.currentTarget.setSelectionRange(newCursorPos, newCursorPos);
                              event.currentTarget.focus();
                            }, 0);
                          }
                          setShowUserSuggestions(false);
                          return;
                        }
                      }
                      
                      // Handle command menu navigation
                      if (showCommandMenu) {
                        if (event.key === "ArrowDown") {
                          event.preventDefault();
                          setCommandSelectedIndex((i) => Math.min(i + 1, commandSuggestions.length - 1));
                          return;
                        }
                        if (event.key === "ArrowUp") {
                          event.preventDefault();
                          setCommandSelectedIndex((i) => Math.max(i - 1, 0));
                          return;
                        }
                        if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
                          event.preventDefault();
                          const selected = commandSuggestions[commandSelectedIndex] ?? commandSuggestions[0];
                          if (selected) setText(selected.command);
                          setCommandMenuOpen(false);
                          return;
                        }
                      }
                      
                      // Handle Enter for sending messages
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void sendCurrentMessage();
                      }
                    }}
                    placeholder={isAuthenticated ? "Écrivez votre message..." : "Connectez-vous pour écrire..."}
                    disabled={inputDisabled}
                    rows={2}
                    maxLength={500}
                  />
                )}
                {canUseCommands && commandMenuOpen && commandSuggestions.length > 0 ? (
                  <div className="chat-command-menu" role="listbox" aria-label="Commandes admin">
                    {commandSuggestions.map((cmd, index) => (
                      <button
                        key={cmd.command}
                        type="button"
                        className={`chat-command-item ${index === commandSelectedIndex ? "is-selected" : ""}`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setText(cmd.command);
                          setCommandMenuOpen(false);
                          requestAnimationFrame(() => inputRef.current?.focus());
                        }}
                      >
                        <span className="chat-command-name">{cmd.command}</span>
                        <span className="chat-command-desc">{cmd.description}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {showUserSuggestions && userSuggestions.length > 0 ? (
                  <div className="chat-user-suggestions" role="listbox" aria-label="Suggestions d'utilisateurs">
                    {userSuggestions.map((user, index) => (
                      <button
                        key={user.user_id}
                        type="button"
                        className={`chat-user-suggestion-item ${index === userSuggestionSelectedIndex ? "is-selected" : ""}`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          // Replace the @query with the selected user
                          const cursorPosition = inputRef.current?.selectionStart || 0;
                          const textBeforeCursor = text.slice(0, cursorPosition);
                          const lastAtIndex = textBeforeCursor.lastIndexOf("@");
                          const beforeAt = text.slice(0, lastAtIndex);
                          const afterCursor = text.slice(cursorPosition);
                          const newText = `${beforeAt}@${user.user_pseudo} ${afterCursor}`;
                          setText(newText);
                          // Set cursor position after the username
                          setTimeout(() => {
                            const newCursorPos = lastAtIndex + user.user_pseudo.length + 2;
                            inputRef.current?.setSelectionRange(newCursorPos, newCursorPos);
                            inputRef.current?.focus();
                          }, 0);
                          setShowUserSuggestions(false);
                        }}
                      >
                        {user.user_avatar_url ? (
                          <img className="chat-user-suggestion-avatar" src={user.user_avatar_url} alt="" loading="lazy" />
                        ) : (
                          <span className="chat-user-suggestion-avatar chat-user-suggestion-avatar-fallback" aria-hidden="true">
                            {user.user_pseudo.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span className="chat-user-suggestion-name">{user.user_pseudo}</span>
                        {user.user_role === "admin" ? <span className="chat-admin-badge">ADMIN</span> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <button className="btn" type="submit" disabled={inputDisabled || !text.trim()}>
                {cooldownRemainingMs > 0 ? `Attendre ${cooldownSeconds}s` : "Envoyer"}
              </button>
            </form>

            {canUseCommands ? (
              <div className="chat-admin-guide">
                <strong>Commandes admin</strong>
                <ul>
                  <li>/clear — efface le tchat</li>
                  <li>/maintenance-on — active la maintenance</li>
                  <li>/maintenance-off — désactive la maintenance</li>
                  <li>/ban @pseudo [durée en minutes] [motif] — bannir un utilisateur</li>
                  <li>/unban @pseudo — débannir un utilisateur</li>
                  <li>/mute @pseudo [durée en minutes] [motif] — rendre muet un utilisateur</li>
                  <li>/warn @pseudo [motif] — avertir un utilisateur</li>
                  <li>/warnings @pseudo — voir les avertissements d'un utilisateur</li>
                </ul>
                <p className="chat-admin-note">
                  <strong>Note:</strong> La durée est en minutes (suffixe m optionnel) ou "permanent". 
                  Exemple: /ban @user 30m Spam répété
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="card chat-members" aria-label="Membres connectés">
          <div className="chat-members-head">
            <h2>Membres en ligne actuellement</h2>
            <span className="chat-pill">{onlineUsers.length}</span>
          </div>
          <div className="chat-members-list">
            {onlineUsers.length === 0 ? <p className="chat-members-empty">Aucun membre en ligne.</p> : null}
            {onlineUsers.map((member) => (
              <button key={member.user_id} type="button" className="chat-member" onClick={() => void openProfile(member.user_id)}>
                {member.user_avatar_url ? (
                  <img className="chat-member-avatar" src={member.user_avatar_url} alt={`Avatar de ${member.user_pseudo}`} loading="lazy" />
                ) : (
                  <span className="chat-member-avatar chat-member-avatar-fallback" aria-hidden="true">
                    {member.user_pseudo.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="chat-member-name">{member.user_pseudo}</span>
                {member.user_role === "admin" ? <span className="chat-admin-badge">ADMIN</span> : null}
              </button>
            ))}
          </div>
        </aside>
      </div>

      {selectedUserId && (
        <div className="chat-modal-overlay" role="presentation" onClick={closeProfile}>
          <div className="chat-modal" role="dialog" aria-label="Profil" onClick={(event) => event.stopPropagation()}>
            {profileLoading && <p>Chargement du profil…</p>}
            {!profileLoading && profileError && <p className="error-text">{profileError}</p>}
            {!profileLoading && !profileError && profileData ? (
              <div className="chat-profile">
                <div className="chat-profile-head">
                  {profileData.user.avatar_url ? (
                    <img className="chat-profile-avatar" src={profileData.user.avatar_url} alt={`Avatar de ${profileData.user.pseudo}`} />
                  ) : (
                    <span className="chat-profile-avatar chat-profile-avatar-fallback" aria-hidden="true">
                      {profileData.user.pseudo.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="chat-profile-meta">
                    <div className="chat-profile-title">
                      <h3>{profileData.user.pseudo}</h3>
                      <span className={`chat-status-pill is-${profileData.user.chat_status}`}>
                        {profileData.user.chat_status === "online"
                          ? "EN LIGNE"
                          : profileData.user.chat_status === "inactive"
                            ? "INACTIF"
                            : "HORS LIGNE"}
                      </span>
                    </div>
                    {profileData.user.bio ? <p>{profileData.user.bio}</p> : <p>Aucune bio.</p>}
                    <div className="chat-profile-actions">
                      <Link className="btn btn-ghost" to={`/users/${profileData.user.id}`}>
                        Voir le profil
                      </Link>
                      <button className="btn" type="button" onClick={closeProfile}>
                        Fermer
                      </button>
                    </div>
                  </div>
                </div>

                {profileData.user.badges?.length ? (
                  <div className="chat-profile-badges">
                    {profileData.user.badges.map((badge) => (
                      <img key={badge.id} src={badge.image_url} alt={badge.label} title={badge.label} />
                    ))}
                  </div>
                ) : null}

                {profileData.user.discord_url ||
                profileData.user.x_url ||
                profileData.user.bluesky_url ||
                profileData.user.youtube_url ||
                profileData.user.twitch_url ||
                profileData.user.kick_url ||
                profileData.user.snapchat_url ||
                profileData.user.tiktok_url ||
                profileData.user.stoat_url ? (
                  <div className="chat-profile-socials">
                    <h4>Réseaux</h4>
                    <div className="chat-profile-socials-grid">
                      {profileData.user.discord_url ? (
                        <a className="chat-social-link" href={profileData.user.discord_url} target="_blank" rel="noreferrer noopener">
                          Discord
                        </a>
                      ) : null}
                      {profileData.user.x_url ? (
                        <a className="chat-social-link" href={profileData.user.x_url} target="_blank" rel="noreferrer noopener">
                          X
                        </a>
                      ) : null}
                      {profileData.user.bluesky_url ? (
                        <a className="chat-social-link" href={profileData.user.bluesky_url} target="_blank" rel="noreferrer noopener">
                          Bluesky
                        </a>
                      ) : null}
                      {profileData.user.youtube_url ? (
                        <a className="chat-social-link" href={profileData.user.youtube_url} target="_blank" rel="noreferrer noopener">
                          YouTube
                        </a>
                      ) : null}
                      {profileData.user.twitch_url ? (
                        <a className="chat-social-link" href={profileData.user.twitch_url} target="_blank" rel="noreferrer noopener">
                          Twitch
                        </a>
                      ) : null}
                      {profileData.user.kick_url ? (
                        <a className="chat-social-link" href={profileData.user.kick_url} target="_blank" rel="noreferrer noopener">
                          Kick
                        </a>
                      ) : null}
                      {profileData.user.snapchat_url ? (
                        <a className="chat-social-link" href={profileData.user.snapchat_url} target="_blank" rel="noreferrer noopener">
                          Snapchat
                        </a>
                      ) : null}
                      {profileData.user.tiktok_url ? (
                        <a className="chat-social-link" href={profileData.user.tiktok_url} target="_blank" rel="noreferrer noopener">
                          TikTok
                        </a>
                      ) : null}
                      {profileData.user.stoat_url ? (
                        <a className="chat-social-link" href={profileData.user.stoat_url} target="_blank" rel="noreferrer noopener">
                          Stoat
                        </a>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {profileData.servers?.length ? (
                  <div className="chat-profile-servers">
                    <h4>Serveurs</h4>
                    <ul>
                      {profileData.servers.slice(0, 6).map((srv) => (
                        <li key={srv.id}>{srv.name}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
