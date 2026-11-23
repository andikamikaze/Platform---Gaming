/*
 * Halaman komunitas — data sepenuhnya berasal dari Firebase (`community/`).
 * Tidak ada array mock, nama palsu, atau tanggal hardcoded.
 */
import {
  getDisplayName,
  hasDisplayName,
  playerInitials,
  playerAvatarTone,
} from "./identity.js";
import { connectCommunity } from "./community-client.js";
import { initThemeButtons } from "./theme.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/* The More group is static in the desktop rail and a bottom sheet on mobile. */
function toggleMoreMenu(force) {
  const moreNav = $("#moreNav");
  if (!moreNav) return;
  const open = typeof force === "boolean" ? force : !moreNav.classList.contains("is-open");
  moreNav.classList.toggle("is-open", open);
  const backdrop = $(".more-backdrop");
  if (backdrop) backdrop.hidden = !open;
  const toggle = $(".more-toggle");
  if (toggle) toggle.setAttribute("aria-expanded", String(open));
}

function closeMoreMenu() {
  toggleMoreMenu(false);
}

const CATEGORY_LABELS = {
  competitive: "Competitive",
  "co-op": "Co-op",
  creative: "Creative",
};

const state = {
  client: null,
  users: {},
  communities: {},
  members: {},
  posts: {},
  likes: {},
  comments: {},
  events: {},
  rsvps: {},
  filter: "all",
  query: "",
  commentPostId: "",
};

const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));

function toast(message) {
  const node = $("#toast");
  if (!node) return;
  node.textContent = message;
  node.classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => node.classList.remove("show"), 2600);
}

function showBanner(message, isError = false) {
  const node = $("#statusBanner");
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("error", Boolean(isError));
  node.classList.add("visible");
}

function clearBanner() {
  $("#statusBanner")?.classList.remove("visible");
}

function timeAgo(value) {
  const time = Number(value);
  if (!Number.isFinite(time) || time <= 0) return "just now";
  const minutes = Math.floor(Math.max(0, Date.now() - time) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function eventDate(value) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return { month: "—", day: "??", time: "" };
  return {
    month: new Intl.DateTimeFormat("en-US", { month: "short" }).format(date).toUpperCase(),
    day: new Intl.DateTimeFormat("en-US", { day: "2-digit" }).format(date),
    time: new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(date),
  };
}

function communityName(id) {
  return state.communities[id]?.name || "General community";
}

function avatarToneFor(uid, name) {
  return state.users[uid]?.color || playerAvatarTone(name);
}

function initialsFor(uid, post) {
  return state.users[uid]?.initials || post.authorInitials || playerInitials(post.authorName);
}

function sortByTime(entries) {
  return entries.sort((a, b) => Number(b[1]?.createdAt || 0) - Number(a[1]?.createdAt || 0));
}

function isMember(communityId) {
  return Boolean(state.members[communityId]?.[state.client?.uid] === true);
}

function isLiked(postId) {
  return Boolean(state.likes[postId]?.[state.client?.uid] === true);
}

function isRsvped(eventId) {
  return Boolean(state.rsvps[eventId]?.[state.client?.uid] === true);
}

function countMap(map) {
  return Object.values(map || {}).filter(Boolean).length;
}

function renderIdentity() {
  const name = getDisplayName();
  const initials = playerInitials(name);
  const profile = $("#profileInitials");
  $("#profileName").textContent = name;
  $("#welcomeName").textContent = name;
  if (profile) {
    profile.textContent = initials;
    profile.className = `avatar ${playerAvatarTone(name)}`;
  }
}

function renderSidebarCommunities() {
  const host = $("#sidebarCommunities");
  if (!host) return;
  const joined = Object.keys(state.communities)
    .filter(isMember)
    .sort((a, b) => communityName(a).localeCompare(communityName(b)));
  host.innerHTML = joined.length
    ? joined.map((id) => `<a href="#communities" class="side-link"><span class="nav-icon">◉</span><span>${escapeHTML(communityName(id))}</span></a>`).join("")
    : "";
}

function renderStats() {
  const now = Date.now();
  const joined = Object.keys(state.communities).filter(isMember).length;
  const upcoming = Object.values(state.events).filter((event) => {
    const time = new Date(String(event.startsAt || "")).getTime();
    return Number.isFinite(time) && time > now;
  }).length;
  const online = Object.values(state.users).filter((user) => user?.online === true).length;
  const weekly = Object.values(state.posts).filter((post) => {
    const time = Number(post.createdAt || 0);
    return time > now - 7 * 24 * 60 * 60 * 1000;
  }).length;
  $("#joinedCount").textContent = String(joined).padStart(2, "0");
  $("#sidebarCommunityCount").textContent = String(joined);
  $("#upcomingCount").textContent = String(upcoming).padStart(2, "0");
  $("#onlineCount").textContent = String(online).padStart(2, "0");
  $("#weeklyCount").textContent = String(weekly).padStart(2, "0");
}

function renderCommunities() {
  const host = $("#communityList");
  if (!host) return;
  const query = state.query;
  const visible = Object.entries(state.communities)
    .filter(([, community]) => state.filter === "all" || community.category === state.filter)
    .filter(([id, community]) => {
      const haystack = `${community.name} ${community.description || ""} ${community.category || ""}`.toLowerCase();
      return !query || haystack.includes(query);
    })
    .sort((a, b) => a[1].name.localeCompare(b[1].name));

  const template = $("#tpl-community");
  host.replaceChildren(...visible.map(([id, community]) => {
    const node = template.content.firstElementChild.cloneNode(true);
    const memberUids = Object.entries(state.members[id] || {})
      .filter(([, value]) => value === true)
      .map(([uid]) => uid);
    const online = memberUids.filter((uid) => state.users[uid]?.online === true).length;
    const badge = $(".game-badge", node);
    badge.className = `game-badge ${community.badgeTone || ""}`.trim();
    badge.textContent = community.badge || "G";
    $("h3", node).textContent = community.name;
    $("p", node).textContent = community.description || "";
    $(".pill.live", node).textContent = `${online} online`;
    $(".pill:not(.live)", node).textContent = CATEGORY_LABELS[community.category] || community.category || "Community";
    const button = $(".join-btn", node);
    button.dataset.join = id;
    button.textContent = isMember(id) ? "Joined ✓" : "Join";
    button.classList.toggle("joined", isMember(id));
    node.dataset.category = community.category || "";
    node.dataset.search = `${community.name} ${community.description || ""} ${community.category || ""}`.toLowerCase();
    return node;
  }));
  $("#communityEmpty").hidden = visible.length > 0;
}

function commentHTML(postId) {
  const comments = Object.entries(state.comments[postId] || {})
    .sort((a, b) => Number(a[1]?.createdAt || 0) - Number(b[1]?.createdAt || 0));
  if (!comments.length) return document.createDocumentFragment();
  const fragment = document.createDocumentFragment();
  for (const [, comment] of comments) {
    const node = $("#tpl-comment").content.firstElementChild.cloneNode(true);
    const avatar = $(".avatar", node);
    avatar.className = `avatar ${avatarToneFor(comment.authorUid, comment.authorName)}`;
    avatar.textContent = comment.authorInitials || playerInitials(comment.authorName);
    $("strong", node).textContent = comment.authorName || "Member";
    $("p", node).textContent = comment.body || "";
    fragment.append(node);
  }
  const wrapper = document.createElement("div");
  wrapper.className = "comment-list";
  wrapper.append(fragment);
  return wrapper;
}

function renderFeed() {
  const host = $("#feedList");
  if (!host) return;
  const query = state.query;
  const visible = sortByTime(Object.entries(state.posts)).filter(([, post]) => {
    const haystack = `${post.title} ${post.body} ${post.authorName} ${communityName(post.communityId)} ${(post.tags || []).join(" ")}`.toLowerCase();
    return !query || haystack.includes(query);
  });

  const template = $("#tpl-post");
  host.replaceChildren(...visible.map(([id, post]) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.postId = id;
    const avatar = $(".avatar", node);
    avatar.className = `avatar ${avatarToneFor(post.authorUid, post.authorName)}`;
    avatar.textContent = initialsFor(post.authorUid, post);
    $(".feed-top", node).innerHTML =
      `<strong>${escapeHTML(post.authorName || "Member")}</strong> posted in ` +
      `<strong class="post-community">${escapeHTML(communityName(post.communityId))}</strong> ` +
      `<span class="feed-time">· ${escapeHTML(timeAgo(post.createdAt))}</span>`;
    $("p", node).textContent = `${post.title} — ${post.body}`;
    const tags = Array.isArray(post.tags) ? post.tags.filter(Boolean) : [];
    $(".feed-tags", node).innerHTML = tags
      .map((tag) => `<span class="feed-tag">${escapeHTML(tag)}</span>`).join("");

    const like = $("[data-like]", node);
    like.firstChild.textContent = isLiked(id) ? "♥ Like " : "♡ Like ";
    $("span", like).textContent = String(countMap(state.likes[id]));
    const comment = $("[data-comment]", node);
    $("span", comment).textContent = String(countMap(state.comments[id]));

    const actions = $(".feed-actions", node);
    actions.parentNode.insertBefore(commentHTML(id), actions);
    return node;
  }));
  $("#feedEmpty").hidden = visible.length > 0;
}

function renderEvents() {
  const host = $("#eventList");
  if (!host) return;
  const query = state.query;
  const visible = Object.entries(state.events)
    .filter(([, event]) => {
      const haystack = `${event.title} ${event.description || ""} ${communityName(event.communityId)}`.toLowerCase();
      return !query || haystack.includes(query);
    })
    .sort((a, b) => String(a[1].startsAt || "").localeCompare(String(b[1].startsAt || "")));

  const template = $("#tpl-event");
  host.replaceChildren(...visible.map(([id, event]) => {
    const node = template.content.firstElementChild.cloneNode(true);
    const date = eventDate(event.startsAt);
    node.dataset.eventId = id;
    node.classList.toggle("past", new Date(String(event.startsAt || "")).getTime() < Date.now());
    $(".datebox span", node).textContent = date.month;
    $(".datebox strong", node).textContent = date.day;
    $("h3", node).textContent = event.title;
    $("p", node).textContent = `${communityName(event.communityId)} · ${date.time}`;
    const button = $(".small-action", node);
    button.dataset.rsvp = id;
    const going = isRsvped(id);
    button.textContent = going ? "Going ✓" : "RSVP";
    button.classList.toggle("rsvped", going);
    node.dataset.search = `${event.title} ${event.description || ""} ${communityName(event.communityId)}`.toLowerCase();
    return node;
  }));
  $("#eventEmpty").hidden = visible.length > 0;
}

function renderOnline() {
  const host = $("#onlineList");
  if (!host) return;
  const visible = Object.entries(state.users)
    .filter(([, user]) => user?.online === true)
    .sort((a, b) => String(a[1].name || "").localeCompare(String(b[1].name || "")));

  const template = $("#tpl-online");
  host.replaceChildren(...visible.map(([uid, user]) => {
    const node = template.content.firstElementChild.cloneNode(true);
    const avatar = $(".avatar", node);
    avatar.className = `avatar ${user.color || playerAvatarTone(user.name)}`;
    avatar.textContent = user.initials || playerInitials(user.name);
    $("strong", node).textContent = uid === state.client?.uid ? `${user.name} (you)` : (user.name || "Member");
    $("small", node).textContent = `Active ${timeAgo(user.lastSeen)}`;
    return node;
  }));
  $("#onlineEmpty").hidden = visible.length > 0;
}

function renderPostCommunityOptions() {
  const select = $("#postCommunity");
  if (!select) return;
  const current = select.value;
  const communities = Object.entries(state.communities)
    .sort((a, b) => a[1].name.localeCompare(b[1].name));
  select.innerHTML = '<option value="">General community</option>' + communities
    .map(([id, community]) => `<option value="${escapeHTML(id)}">${escapeHTML(community.name)}</option>`)
    .join("");
  if (communities.some(([id]) => id === current)) select.value = current;
}

function renderAll() {
  renderIdentity();
  renderSidebarCommunities();
  renderStats();
  renderCommunities();
  renderFeed();
  renderEvents();
  renderOnline();
  renderPostCommunityOptions();
}

let renderScheduled = false;
function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => { renderScheduled = false; renderAll(); });
}

function openModal(id) {
  $(`#${id}`)?.classList.add("open");
}
function closeModal(id) {
  $(`#${id}`)?.classList.remove("open");
}

async function runAction(action) {
  try {
    await action();
  } catch (error) {
    renderAll();
    toast(error.message || "Something went wrong.");
  }
}

async function toggleJoin(id) {
  const joined = !isMember(id);
  if (!state.members[id]) state.members[id] = {};
  if (joined) state.members[id][state.client.uid] = true;
  else delete state.members[id][state.client.uid];
  renderAll();
  try {
    await state.client.setMember(id, joined);
    toast(joined ? `You joined ${communityName(id)}.` : `You left ${communityName(id)}.`);
  } catch (error) {
    if (!state.members[id]) state.members[id] = {};
    if (joined) delete state.members[id][state.client.uid];
    else state.members[id][state.client.uid] = true;
    renderAll();
    throw error;
  }
}

async function toggleLike(id) {
  const liked = !isLiked(id);
  if (!state.likes[id]) state.likes[id] = {};
  if (liked) state.likes[id][state.client.uid] = true;
  else delete state.likes[id][state.client.uid];
  renderFeed();
  try {
    await state.client.toggleLike(id);
  } catch (error) {
    if (!state.likes[id]) state.likes[id] = {};
    if (liked) delete state.likes[id][state.client.uid];
    else state.likes[id][state.client.uid] = true;
    renderFeed();
    throw error;
  }
}

async function toggleRsvp(id) {
  const going = !isRsvped(id);
  if (!state.rsvps[id]) state.rsvps[id] = {};
  if (going) state.rsvps[id][state.client.uid] = true;
  else delete state.rsvps[id][state.client.uid];
  renderEvents();
  renderStats();
  try {
    await state.client.toggleRsvp(id);
    toast(going ? "RSVP confirmed." : "RSVP cancelled.");
  } catch (error) {
    if (!state.rsvps[id]) state.rsvps[id] = {};
    if (going) delete state.rsvps[id][state.client.uid];
    else state.rsvps[id][state.client.uid] = true;
    renderEvents();
    renderStats();
    throw error;
  }
}

function wireEvents() {
  $("#globalSearch").addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    renderCommunities();
    renderFeed();
    renderEvents();
  });

  $$("[data-game-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.gameFilter;
      $$("[data-game-filter]").forEach((item) => item.classList.toggle("active", item === button));
      renderCommunities();
    });
  });

  document.addEventListener("click", (event) => {
    const join = event.target.closest("[data-join]");
    if (join) { runAction(() => toggleJoin(join.dataset.join)); return; }
    const like = event.target.closest("[data-like]");
    if (like) { runAction(() => toggleLike(like.closest("[data-post-id]").dataset.postId)); return; }
    const rsvp = event.target.closest("[data-rsvp]");
    if (rsvp) { runAction(() => toggleRsvp(rsvp.dataset.rsvp)); return; }
    const comment = event.target.closest("[data-comment]");
    if (comment) {
      state.commentPostId = comment.closest("[data-post-id]").dataset.postId;
      $("#commentTarget").textContent = `Reply to “${state.posts[state.commentPostId]?.title || "this post"}”.`;
      $("#commentError").hidden = true;
      openModal("commentModal");
      $("#commentBody").focus();
      return;
    }
    const share = event.target.closest("[data-share]");
    if (share) {
      const id = share.closest("[data-post-id]").dataset.postId;
      const link = `${location.origin}${location.pathname}#post-${id}`;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(link)
          .then(() => toast("Post link copied."))
          .catch(() => toast(link));
      } else toast(link);
    }
  });

  ["createPost", "createPostTop"].forEach((id) => {
    $(`#${id}`).addEventListener("click", () => {
      $("#postError").hidden = true;
      openModal("postModal");
      $("#postTitle").focus();
    });
  });
  $("#cancelPost").addEventListener("click", () => closeModal("postModal"));
  $("#cancelComment").addEventListener("click", () => closeModal("commentModal"));
  ["postModal", "commentModal"].forEach((id) => {
    $(`#${id}`).addEventListener("click", (event) => {
      if (event.target.id === id) closeModal(id);
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeModal("postModal");
    closeModal("commentModal");
  });

  $("#postForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const title = $("#postTitle").value.trim();
    const body = $("#postBody").value.trim();
    const error = $("#postError");
    if (!title || !body) {
      error.textContent = "A title and a message are required.";
      error.hidden = false;
      return;
    }
    error.hidden = true;
    const tags = [...new Set((body.match(/#[\p{L}\d_]+/gu) || []).map((tag) => tag.slice(1)))].slice(0, 6);
    runAction(async () => {
      await state.client.createPost({
        communityId: $("#postCommunity").value,
        title, body, tags,
      });
      closeModal("postModal");
      event.target.reset();
      toast("Your post has been published.");
    });
  });

  $("#commentForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const body = $("#commentBody").value.trim();
    const error = $("#commentError");
    if (!body) {
      error.textContent = "Write a comment first.";
      error.hidden = false;
      return;
    }
    error.hidden = true;
    const postId = state.commentPostId;
    runAction(async () => {
      await state.client.addComment(postId, { body });
      closeModal("commentModal");
      event.target.reset();
      toast("Comment added.");
    });
  });

  $("#browseBtn").addEventListener("click", () => {
    $("#communities").scrollIntoView({ behavior: "smooth" });
  });
  $("#seeAll").addEventListener("click", () => {
    state.filter = "all";
    state.query = "";
    $("#globalSearch").value = "";
    $$("[data-game-filter]").forEach((button) => button.classList.toggle("active", button.dataset.gameFilter === "all"));
    renderCommunities();
    renderFeed();
    renderEvents();
  });
  $("#feedRefresh").addEventListener("click", () => {
    scheduleRender();
    toast("Your activity feed is up to date.");
  });
  $("#eventCalendar").addEventListener("click", () => {
    $("#events").scrollIntoView({ behavior: "smooth" });
  });
  $("#friendsBtn").addEventListener("click", () => {
    renderOnline();
    toast("Online list refreshed.");
  });
  $("#notifications").addEventListener("click", () => toast("You’re all caught up — no new notifications."));

  $$('[data-action="toggle-menu"]').forEach((button) => {
    button.addEventListener("click", () => toggleMoreMenu());
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMoreMenu();
  });
  document.addEventListener("click", (event) => {
    const link = event.target.closest('.app-sidebar .side-link[href^="#"]');
    if (!link) return;
    $$(".app-sidebar .side-link").forEach((item) => item.classList.remove("active"));
    link.classList.add("active");
    closeMoreMenu();
  });
}

async function boot() {
  $("#todayLabel").textContent = new Intl.DateTimeFormat("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  }).format(new Date());
  renderIdentity();
  initThemeButtons();
  wireEvents();

  if (!hasDisplayName()) {
    location.replace(`index.html?next=${encodeURIComponent("community.html")}`);
    return;
  }

  try {
    state.client = await connectCommunity({
      name: getDisplayName(),
      initials: playerInitials(),
      color: playerAvatarTone(),
    });
  } catch (error) {
    console.error("Community connection failed:", error);
    showBanner(`Komunitas tidak dapat terhubung: ${error.message}`, true);
    return;
  }
  clearBanner();

  const stop = state.client.subscribe({
    onUsers: (value) => { state.users = value; scheduleRender(); },
    onCommunities: (value) => { state.communities = value; scheduleRender(); },
    onMembers: (value) => { state.members = value; scheduleRender(); },
    onPosts: (value) => { state.posts = value; scheduleRender(); },
    onLikes: (value) => { state.likes = value; scheduleRender(); },
    onComments: (value) => { state.comments = value; scheduleRender(); },
    onEvents: (value) => { state.events = value; scheduleRender(); },
    onRsvps: (value) => { state.rsvps = value; scheduleRender(); },
    error: (error, key) => showBanner(`Gagal memuat ${key}: ${error.message}`, true),
  });
  renderAll();

  window.addEventListener("pagehide", () => {
    stop();
    state.client.disconnect().catch(() => { });
  }, { once: true });

  const sharedPost = location.hash.startsWith("#post-") ? location.hash.slice(6) : "";
  if (sharedPost) {
    requestAnimationFrame(() => {
      $(`[data-post-id="${CSS.escape(sharedPost)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  /* Hook untuk automated checks (data di sini tidak mengandung rahasia). */
  globalThis.__COMMUNITY_TEST__ = {
    state,
    uid: () => state.client.uid,
    renderAll,
    connectCommunity,
  };
  globalThis.__COMMUNITY_TEST_READY__ = true;
}

boot();
