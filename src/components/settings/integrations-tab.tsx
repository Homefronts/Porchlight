import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { IconBrain, IconBroadcast, IconLoader2 } from "@tabler/icons-react";
import { IconPlugConnectedXFilled } from "@/components/shared/filled-icons";

import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Group,
  INK_NO_BOX,
  SettingRow,
  TabPane,
} from "@/components/settings/primitives";
import { useLookFamily } from "@/components/theme/look-type";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/lib/store/settings";
import { DiscordIcon, LastfmIcon } from "@/components/shared/brand-icons";

/** Return shape of the `lastfm_begin_auth` command (camelCased by serde). */
type BeginAuth = { token: string; authUrl: string };
/** Return shape of `lastfm_poll_session`: the connected account, or null while
 *  the token is still awaiting the user's approval. */
type LastfmSession = { name: string; key: string };

// The desktop auth flow can't catch a browser callback, so after opening the
// approval page we poll auth.getSession every POLL_INTERVAL_MS until the user
// clicks Allow, giving up after POLL_TIMEOUT_MS.
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 120000;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

type Service = "lastfm" | "librefm";

const SERVICES: Record<
  Service,
  { name: string; icon: ComponentType<{ className?: string }>; profile: string }
> = {
  lastfm: { name: "Last.fm", icon: LastfmIcon, profile: "last.fm/user/" },
  librefm: { name: "Libre.fm", icon: IconBroadcast, profile: "libre.fm/user/" },
};

/** One service's account fields from the flat settings store. */
function useAccount(service: Service) {
  const lf = service === "lastfm";
  const enabled = useSettingsStore((s) => (lf ? s.lastfmEnabled : s.librefmEnabled));
  const username = useSettingsStore((s) => (lf ? s.lastfmUsername : s.librefmUsername));
  const sessionKey = useSettingsStore((s) =>
    lf ? s.lastfmSessionKey : s.librefmSessionKey,
  );
  const loveSync = useSettingsStore((s) => (lf ? s.lastfmLoveSync : s.librefmLoveSync));
  const avatar = useSettingsStore((s) => (lf ? s.lastfmAvatar : s.librefmAvatar));
  // Store actions never change, so reading them once is enough.
  const a = useSettingsStore.getState();
  return {
    enabled,
    username,
    sessionKey,
    loveSync,
    avatar,
    setEnabled: lf ? a.setLastfmEnabled : a.setLibrefmEnabled,
    setLoveSync: lf ? a.setLastfmLoveSync : a.setLibrefmLoveSync,
    setAvatar: lf ? a.setLastfmAvatar : a.setLibrefmAvatar,
    setSession: lf ? a.setLastfmSession : a.setLibrefmSession,
    clearSession: lf ? a.clearLastfmSession : a.clearLibrefmSession,
  };
}

/** Connected-account card: avatar, username, profile link and Disconnect. */
function AccountCard({
  icon: Icon,
  avatar,
  name,
  link,
  onDisconnect,
}: {
  icon: ComponentType<{ className?: string }>;
  avatar?: string | null;
  name: string;
  link: string | null;
  onDisconnect: () => void;
}) {
  const family = useLookFamily();
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-cover,var(--radius-xl))] border border-w075 bg-w028 px-3 py-2.5",
        family === "ink" && INK_NO_BOX,
      )}
    >
      {avatar ? (
        <img src={avatar} alt="" className="size-10 shrink-0 rounded-full object-cover" />
      ) : (
        <div className="grid size-10 shrink-0 place-items-center rounded-full border border-w070 bg-w050">
          <Icon className="size-5 text-t5" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold leading-tight text-t2">{name}</span>
        {link ? <span className="truncate text-xs text-t7">{link}</span> : null}
      </div>
      <Button variant="outline" size="sm" onClick={onDisconnect}>
        <IconPlugConnectedXFilled className="size-3.5" />
        Disconnect
      </Button>
    </div>
  );
}

/**
 * Last.fm or Libre.fm block (they speak the same API): connect an account,
 * then scrobble every played track. Connect opens the service's approval page
 * and then auto-detects approval by polling, so there's no manual
 * confirmation step. Signing, scrobble submission, and the offline retry
 * queue live in `src-tauri/src/lastfm.rs`; the play-time timing lives in
 * `lib/scrobbler.ts`.
 */
function AudioscrobblerSection({ service }: { service: Service }) {
  const { name, icon, profile } = SERVICES[service];
  const acct = useAccount(service);
  const { username, avatar, setAvatar } = acct;
  const connected = !!acct.sessionKey;

  // null while we ask Rust whether API credentials are baked into this build.
  const [configured, setConfigured] = useState<boolean | null>(null);
  // "awaiting" while the browser approval page is open and we poll for the
  // user clicking Allow. There's no manual confirmation step.
  const [phase, setPhase] = useState<"idle" | "awaiting">("idle");
  // Bumped to invalidate an in-flight poll loop (cancel, unmount, or restart).
  const pollIdRef = useRef(0);

  useEffect(() => {
    void invoke<boolean>("lastfm_is_configured", { service })
      .then(setConfigured)
      .catch(() => setConfigured(false));
  }, [service]);

  // Stop polling if the tab unmounts (e.g. the Settings dialog closes). The
  // exhaustive-deps rule assumes a ref holds a DOM node that goes stale; here
  // pollIdRef is a plain counter and reading its latest value at cleanup is the
  // whole point: invalidate whichever poll loop is live at that moment.
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      pollIdRef.current++;
    };
  }, []);

  // Fetch the profile avatar (cosmetic, for the account card).
  const fetchProfile = useCallback(
    async (user: string) => {
      try {
        const info = await invoke<{ image: string }>("lastfm_user_info", {
          service,
          user,
        });
        setAvatar(info.image || null);
      } catch {
        /* avatar is cosmetic; ignore failures */
      }
    },
    [service, setAvatar],
  );

  // Backfill the avatar when already connected (persisted from a previous run,
  // or connected before this feature existed) but none is cached yet.
  useEffect(() => {
    if (configured === true && connected && username && !avatar) {
      void fetchProfile(username);
    }
  }, [configured, connected, username, avatar, fetchProfile]);

  // Poll auth.getSession until the user approves the token in the browser.
  // lastfm_poll_session returns null while pending, the account once approved,
  // and rejects on a real failure (expired token, network).
  const pollForApproval = async (token: string) => {
    const myId = ++pollIdRef.current;
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (pollIdRef.current === myId) {
      await sleep(POLL_INTERVAL_MS);
      if (pollIdRef.current !== myId) return; // cancelled or superseded
      let session: LastfmSession | null;
      try {
        session = await invoke<LastfmSession | null>("lastfm_poll_session", {
          service,
          token,
        });
      } catch (e) {
        if (pollIdRef.current === myId) {
          setPhase("idle");
          toast.error(`${name} sign-in failed: ${String(e)}`);
        }
        return;
      }
      if (pollIdRef.current !== myId) return;
      if (session) {
        acct.setSession(session.name, session.key);
        void fetchProfile(session.name);
        setPhase("idle");
        toast.success(`Connected to ${name} as ${session.name}`);
        return;
      }
      if (Date.now() >= deadline) {
        setPhase("idle");
        toast.error("Timed out waiting for approval. Click Connect to try again.");
        return;
      }
    }
  };

  const beginConnect = async () => {
    try {
      const { token, authUrl } = await invoke<BeginAuth>("lastfm_begin_auth", {
        service,
      });
      await openUrl(authUrl);
      setPhase("awaiting");
      void pollForApproval(token);
    } catch (e) {
      toast.error(`Couldn't start ${name} sign-in: ${String(e)}`);
    }
  };

  const cancelConnect = () => {
    pollIdRef.current++; // invalidate the running poll loop
    setPhase("idle");
  };

  const disconnect = () => {
    pollIdRef.current++;
    if (acct.sessionKey)
      void invoke("lastfm_forget", { service, sessionKey: acct.sessionKey }).catch(
        () => {},
      );
    acct.clearSession();
    setPhase("idle");
    toast.success(`Disconnected from ${name}`);
  };

  const description = (() => {
    if (configured === false) return `${name} API credentials aren't set in this build.`;
    if (phase === "awaiting") return "Waiting for approval in your browser…";
    // The connected account identity lives in the account card below, so this
    // stays a description of the feature itself in every state.
    return `Scrobble every track you play to your ${name} profile.`;
  })();

  let control: ReactNode = null;
  if (configured === true) {
    if (connected) {
      control = (
        <Switch
          checked={acct.enabled}
          onCheckedChange={acct.setEnabled}
          aria-label={`${name} Scrobbling`}
        />
      );
    } else if (phase === "awaiting") {
      control = (
        <div className="flex items-center gap-2">
          <IconLoader2 className="size-4 animate-spin text-t6" />
          <Button variant="ghost" size="sm" onClick={cancelConnect}>
            Cancel
          </Button>
        </div>
      );
    } else {
      control = (
        <Button variant="outline" size="sm" onClick={() => void beginConnect()}>
          Connect
        </Button>
      );
    }
  }

  return (
    <div className="flex flex-col">
      <SettingRow
        icon={icon}
        title={`${name} Scrobbling`}
        description={description}
        control={control}
      />
      {configured === true && connected ? (
        // pl-12 lines the block up with the row titles above (past the icon chip).
        <div className="flex flex-col gap-4 pb-4 pl-12">
          <AccountCard
            icon={icon}
            avatar={avatar}
            name={username ?? name}
            link={username ? `${profile}${username}` : null}
            onDisconnect={disconnect}
          />
          {/* Sync liked songs: a sub-setting of the connection. */}
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className="text-sm font-semibold leading-none text-t2">
                Sync liked songs
              </span>
              <span className="text-[12.5px] leading-snug text-t7">
                Also mark tracks you like in YouTube Music as Loved on {name}.
              </span>
            </div>
            <Switch
              checked={acct.loveSync}
              onCheckedChange={acct.setLoveSync}
              aria-label={`Sync Liked Songs to ${name}`}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * ListenBrainz block. There's no browser sign-in for desktop apps, so the
 * user pastes their user token; we check it and show the account it belongs
 * to. Sending and the offline queue live in `src-tauri/src/listenbrainz.rs`.
 */
function ListenbrainzSection() {
  const enabled = useSettingsStore((s) => s.listenbrainzEnabled);
  const token = useSettingsStore((s) => s.listenbrainzToken);
  const username = useSettingsStore((s) => s.listenbrainzUsername);
  const { setListenbrainzEnabled, setListenbrainzAccount, clearListenbrainzAccount } =
    useSettingsStore.getState();
  const [draft, setDraft] = useState("");
  const [checking, setChecking] = useState(false);

  const connect = async () => {
    const t = draft.trim();
    if (!t) return;
    setChecking(true);
    try {
      const name = await invoke<string | null>("listenbrainz_validate", { token: t });
      if (name) {
        setListenbrainzAccount(name, t);
        setDraft("");
        toast.success(`Connected to ListenBrainz as ${name}`);
      } else {
        toast.error("That token didn't work. Copy it again from listenbrainz.org/settings.");
      }
    } catch (e) {
      toast.error(`Couldn't reach ListenBrainz: ${String(e)}`);
    } finally {
      setChecking(false);
    }
  };

  const disconnect = () => {
    if (token) void invoke("listenbrainz_forget", { token }).catch(() => {});
    clearListenbrainzAccount();
    toast.success("Disconnected from ListenBrainz");
  };

  return (
    <div className="flex flex-col">
      <SettingRow
        icon={IconBrain}
        title="ListenBrainz Scrobbling"
        description={
          token
            ? "Send every track you play to your ListenBrainz profile."
            : "Paste your user token from your ListenBrainz settings to send your listens."
        }
        control={
          token ? (
            <Switch
              checked={enabled}
              onCheckedChange={setListenbrainzEnabled}
              aria-label="ListenBrainz Scrobbling"
            />
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void openUrl("https://listenbrainz.org/settings/")}
            >
              Get token
            </Button>
          )
        }
      />
      <div className="flex flex-col gap-4 pb-4 pl-12">
        {token ? (
          <AccountCard
            icon={IconBrain}
            name={username ?? "ListenBrainz"}
            link={username ? `listenbrainz.org/user/${username}` : null}
            onDisconnect={disconnect}
          />
        ) : (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void connect();
            }}
          >
            <Input
              type="password"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="User token"
              aria-label="ListenBrainz user token"
              autoComplete="off"
              spellCheck={false}
            />
            <Button type="submit" variant="outline" size="sm" disabled={!draft.trim() || checking}>
              {checking ? <IconLoader2 className="size-3.5 animate-spin" /> : null}
              Connect
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

/**
 * Integrations tab: third-party services Porchlight can broadcast to.
 * Discord Rich Presence and the scrobblers all react to the same
 * now-playing state, mirrored out over their own backends.
 */
export function IntegrationsTab() {
  const discordRichPresence = useSettingsStore((s) => s.discordRichPresence);
  const setDiscordRichPresence = useSettingsStore((s) => s.setDiscordRichPresence);

  return (
    <TabPane>
      <Group>
        <SettingRow
          icon={DiscordIcon}
          title="Discord Rich Presence"
          description="Show the current track on your Discord profile while it plays."
          control={
            <Switch
              checked={discordRichPresence}
              onCheckedChange={setDiscordRichPresence}
              aria-label="Discord Rich Presence"
            />
          }
        />
      </Group>
      <AudioscrobblerSection service="lastfm" />
      <AudioscrobblerSection service="librefm" />
      <ListenbrainzSection />
    </TabPane>
  );
}
