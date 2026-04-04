/**
 * @file script.js
 * @description Main application controller for the YoFoundIt frontend.
 *
 * Responsibilities:
 *  - Boot sequence: session verification, category loading, home feed render
 *  - Loading-screen animation and transition
 *  - Client-side navigation (window stack via History API)
 *  - Home feed rendering, infinite scroll pagination, and background polling
 *  - Search (debounced, real-time)
 *  - Authentication forms (login / sign-up) and profile view
 *  - Add-item form with multi-image selection, compression, and upload
 *  - Item detail view with carousel, claim/delete actions
 *  - Notification inbox rendering and read-state management
 *  - Reusable UI primitives: ripple effect, toast modal, alert modal
 */

let Pageloaded = false;

function animate() {
  document
    .querySelector('meta[name="theme-color"]')
    .setAttribute("content", "#f7f2e9");

  let t = 1;
  setTimeout(() => {
    document.querySelector("#logo-lens").style.transform =
      "translateX(250px)rotateZ(-90deg)";
    const intervlanim = setInterval(() => {
      if (Pageloaded) {
        if (t == 0) {
          clearInterval(intervlanim);
          document.querySelector("#logo-lens").style.transform =
            "translateX(250px)rotateZ(-90deg)";
          setTimeout(() => {
            document.querySelector("#logo-lens").style.transform =
              "translateX(0px)rotateZ(0deg)";
            document.querySelector("#loading-text").style.opacity = "0";
            document.querySelector("#mainlogo").classList.add("show");
            removeLoadScreen();
          }, 1500);
        } else {
          clearInterval(intervlanim);
          document.querySelector("#logo-lens").style.transform =
            "translateX(0px)rotateZ(0deg)";
          setTimeout(() => {
            document.querySelector("#logo-lens").style.transform =
              "translateX(250px)rotateZ(-90deg)";
            setTimeout(() => {
              document.querySelector("#loading-text").style.opacity = "0";
              document.querySelector("#mainlogo").classList.add("show");
              document.querySelector("#logo-lens").style.transform =
                "translateX(0px)rotateZ(0deg)";
              removeLoadScreen();
            }, 1500);
          }, 1500);
        }
      }
      if (t == 1) {
        document.querySelector("#logo-lens").style.transform =
          "translateX(0px)rotateZ(0deg)";
        t = 0;
      } else {
        t = 1;
        document.querySelector("#logo-lens").style.transform =
          "translateX(250px)rotateZ(-90deg)";
      }
    }, 1500);
  }, 500);
}
animate();

function removeLoadScreen() {
  setTimeout(() => {
    let loadscreen = document.getElementById("loading-screen");
    loadscreen.style.transition = "0.5s ease-in";
    loadscreen.style.opacity = "0";
    document
      .querySelector('meta[name="theme-color"]')
      .setAttribute("content", "#1e2f3b");
    setTimeout(() => {
      loadscreen.remove();
      startUI();
    }, 500);
  }, 2000);
}
document.addEventListener("DOMContentLoaded", async () => {
  sessionStorage.setItem("pagepath", JSON.stringify(["home"]));

  const token = localStorage.getItem("yfi_token");
  if (token) {
    try {
      const sessionResponse = await verifySession(token);
      if (sessionResponse.status === 200 && sessionResponse.data && sessionResponse.data.success) {
        if (sessionResponse.data.user) {
          localStorage.setItem("yfi_user", JSON.stringify(sessionResponse.data.user));
        }
      } else {
        /* Token invalid or expired — clear stale credentials */
        localStorage.removeItem("yfi_token");
        localStorage.removeItem("yfi_user");
      }
    } catch (err) {
      /*
       * Do not clear the token on network errors; the user may simply be
       * offline temporarily and their session could still be valid.
       */
      console.error("Session verification failed during load:", err);
    }
  }

  updateProfileView();
  await loadCategories();
  await loadHomeFeed();

  setTimeout(() => {
    Pageloaded = true;
  }, 500);
});

/* =============================================================
 * Search
 * Debounced live search with keyword highlighting.
 * ============================================================= */
(function initSearch() {
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');
  const searchResult = document.querySelector('.search-result');
  if (!searchInput || !searchBtn || !searchResult) return;

  let debounceTimer = null;

  function highlightMatch(text, query) {
    if (!query) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    return text.replace(regex, `<mark class="search-highlight">$1</mark>`);
  }

  function renderSearchResults(items, query) {
    if (!items || items.length === 0) {
      searchResult.innerHTML = `<div class="search-empty">No results found for "<strong>${query}</strong>"</div>`;
      return;
    }

    searchResult.innerHTML = items.map(item => {
      const isLost = item.item_type && item.item_type.toLowerCase() === 'lost';
      const tagColorClass = isLost ? 'yfiui-red' : 'yfiui-green';
      const tagLabel = isLost ? 'LOST' : 'FOUND';
      const highlightedTitle = highlightMatch(item.title || '', query);
      const highlightedDesc = highlightMatch(
        (item.description || '').length > 80
          ? item.description.substring(0, 80).trim() + '...'
          : (item.description || ''),
        query
      );

      return `
        <div class="search-result-item" onclick="openItemDetails(${item.item_id})">
          ${item.image_url
            ? `<div class="search-result-img-wrapper"><img src="${HOST}/${item.image_url}" alt="${item.title}" class="search-result-img"></div>`
            : `<div class="search-result-img-wrapper placeholder"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`
          }
          <div class="search-result-info">
            <div class="search-result-hero">
              <span class="lftag ${tagColorClass}">${tagLabel}</span>
              <h3 class="search-result-title">${highlightedTitle}</h3>
            </div>
            <p class="search-result-desc">${highlightedDesc}</p>
            <span class="search-result-time">${item.uploaded_at || ''}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  async function doSearch(query) {
    const q = query.trim();
    if (q.length < 3) {
      searchResult.innerHTML = `<div class="search-empty">Type at least 3 characters to search.</div>`;
      return;
    }

    searchResult.innerHTML = `<div class="search-empty">Searching...</div>`;

    const res = await fetchSearchResults(q);
    const items = res.data && Array.isArray(res.data) ? res.data
      : (res.data && Array.isArray(res.data.data) ? res.data.data : []);
    renderSearchResults(items, q);
  }

  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = searchInput.value.trim();
    if (q.length < 3) {
      searchResult.innerHTML = '';
      return;
    }
    debounceTimer = setTimeout(() => doSearch(q), 250);
  });

  searchBtn.addEventListener('click', () => {
    clearTimeout(debounceTimer);
    doSearch(searchInput.value);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(debounceTimer);
      doSearch(searchInput.value);
    }
  });
})();

/* =============================================================
 * Background Polling
 * Polls the latest-items endpoint every 15 s (started after login).
 * Compares incoming item IDs against the last known ID to prepend
 * only genuinely new cards without a full re-render.
 * ============================================================= */
let pollIntervalId    = null;
let latestKnownItemId = null;

async function pollForUpdates() {
  const token = localStorage.getItem("yfi_token");
  if (!token) return;

  try {
    const res = await fetchLatestItems(token);
    if (!res.data || !res.data.success) return;

    if (res.data.notifications) {
      renderNotifications(res.data.notifications);
    }

    if (res.data.data && res.data.data.length > 0) {
      const incomingItems  = res.data.data;
      const newestIncoming = incomingItems[0].item_id;

      /* Record baseline on the first poll cycle without modifying the feed */
      if (latestKnownItemId === null) {
        latestKnownItemId = newestIncoming;
        return;
      }

      const newItems = incomingItems.filter(item => item.item_id > latestKnownItemId);
      if (newItems.length === 0) return;

      const feedContainer = document.getElementById("homeFeedContainer");
      if (!feedContainer) return;

      /* Items arrive newest-first; reverse so the oldest new item is inserted first */
      newItems.reverse().forEach(item => {
        feedContainer.insertAdjacentHTML('afterbegin', renderItemCard(item));
      });

      const newCards = feedContainer.querySelectorAll(".lfcontainer:not([data-ripple])");
      newCards.forEach(card => {
        card.setAttribute("data-ripple", "true");
        card.addEventListener("click", function (event) {
          rippleEffect(this, event);
        });
      });

      latestKnownItemId = newestIncoming;
    }
  } catch (err) {
    console.error("Poll error:", err);
  }
}

/* =============================================================
 * Home Feed
 * Renders item cards, manages infinite-scroll pagination state,
 * and updates the background-scroll blur/parallax effect.
 * ============================================================= */

/* Pagination state */
let lastItemId    = null;
let isLoadingMore = false;
let hasMoreItems  = true;



function renderItemCard(item) {
  const isLost = item.item_type.toLowerCase() === "lost";
  const tagColorClass = isLost ? "yfiui-red" : "yfiui-green";
  const tagLabel = isLost ? "LOST" : "FOUND";

  const shortDesc = item.description.length > 70
    ? item.description.substring(0, 70).trim() + "..."
    : item.description;

  return `
    <div class="lfcontainer" onclick="openItemDetails(${item.item_id})">
      ${item.image_url ? `<div class="lfimage-wrapper"><img src="${HOST}/${item.image_url}" alt="${item.title}" class="lfimage"></div>` : ''}
      <div class="lfinfo">
        <div class="lfcontent">
          <div class="lfhero">
            <h1 class="lfhead">${item.title}</h1>
            <div class="lftag ${tagColorClass}">${tagLabel}</div>
          </div>
          <div class="lftext">
            <p class="lftextp">${shortDesc}</p>
          </div>
        </div>
        <p class="posttime">${item.uploaded_at}</p>
      </div>
    </div>
  `;
}

/**
 * Checks if the sentinel element is within 300 px of the viewport bottom
 * and triggers loading more items. Called from blurtheonthis() on scroll.
 */
function checkLoadMore() {
  if (!hasMoreItems || isLoadingMore || lastItemId === null) return;

  const ghost = document.querySelector("#homeFeedContainer > .ghostobj");
  if (!ghost) return;

  const ghostTop = ghost.getBoundingClientRect().top;
  if (ghostTop < window.innerHeight + 300) {
    loadMoreItems();
  }
}

async function loadMoreItems() {
  if (isLoadingMore || !hasMoreItems || lastItemId === null) return;
  isLoadingMore = true;

  const ghost = document.querySelector("#homeFeedContainer > .ghostobj");

  // Show spinner inside ghost
  if (ghost) ghost.innerHTML = '<div class="feed-spinner"></div>';

  /* Ensure the spinner is visible for at least 500 ms to prevent flicker */
  const minSpinnerDelay = new Promise(resolve => setTimeout(resolve, 500));
  const [res] = await Promise.all([fetchMoreItems(lastItemId, localStorage.getItem('yfi_token')), minSpinnerDelay]);

  if (res.data && res.data.notifications) {
    renderNotifications(res.data.notifications);
  }

  if (res.data && res.data.success && res.data.data && res.data.data.length > 0) {
    const feedContainer = document.getElementById("homeFeedContainer");
    const items = res.data.data;

    items.forEach(item => {
      ghost.insertAdjacentHTML('beforebegin', renderItemCard(item));
    });

    // Update lastItemId to the oldest item in this batch
    lastItemId = items[items.length - 1].item_id;

    const newCards = feedContainer.querySelectorAll(".lfcontainer:not([data-ripple])");
    newCards.forEach(card => {
      card.setAttribute("data-ripple", "true");
      card.addEventListener("click", function (event) {
        rippleEffect(this, event);
      });
    });

    if (ghost) ghost.innerHTML = '';
  } else {
    /* No more items — show end-of-feed message */
    hasMoreItems = false;
    if (ghost) {
      ghost.innerHTML = '<p class="feed-end-message">You\'ve seen it all!</p>';
    }
  }

  isLoadingMore = false;
}

async function loadHomeFeed() {
  const feedContainer = document.getElementById("homeFeedContainer");
  if (!feedContainer) return;

  lastItemId    = null;
  isLoadingMore = false;
  hasMoreItems  = true;

  const res = await fetchLatestItems(localStorage.getItem('yfi_token'));

  feedContainer.innerHTML = "";

  if (res.data && res.data.notifications) {
    renderNotifications(res.data.notifications);
  }

  if (res.data && res.data.success && res.data.data && res.data.data.length > 0) {
    const items = res.data.data;

    items.forEach(item => {
      feedContainer.insertAdjacentHTML('beforeend', renderItemCard(item));
    });

    /* Seed the polling baseline with the newest item */
    latestKnownItemId = items[0].item_id;

    /* Track the oldest item in this batch for the next pagination request */
    lastItemId = items[items.length - 1].item_id;

    if (items.length < 10) {
      hasMoreItems = false;
    }

    feedContainer.insertAdjacentHTML('beforeend', '<div class="ghostobj"></div>');
  } else {
    // Empty state
    feedContainer.innerHTML = `
      <div style="text-align: center; padding: 20px; color: var(--theme-color); margin: 250px auto 40px auto; width: 90%;">
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" color="#0f4159" fill="none" viewBox="0 0 24 24"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2.75C6.89137 2.75 2.75 6.89137 2.75 12C2.75 17.1086 6.89137 21.25 12 21.25C17.1086 21.25 21.25 17.1086 21.25 12C21.25 6.89137 17.1086 2.75 12 2.75ZM1.25 12C1.25 6.06294 6.06294 1.25 12 1.25C17.9371 1.25 22.75 6.06294 22.75 12C22.75 17.9371 17.9371 22.75 12 22.75C6.06294 22.75 1.25 17.9371 1.25 12ZM8.55339 16.3975C9.5258 15.6767 10.715 15.25 12 15.25C13.285 15.25 14.4742 15.6767 15.4466 16.3975C15.7794 16.6441 15.8492 17.1138 15.6025 17.4466C15.3559 17.7794 14.8862 17.8492 14.5534 17.6025C13.825 17.0627 12.9459 16.75 12 16.75C11.0541 16.75 10.175 17.0627 9.44661 17.6025C9.11385 17.8492 8.64413 17.7794 8.39747 17.4466C8.15082 17.1138 8.22062 16.6441 8.55339 16.3975Z" fill="currentColor"></path><path d="M16 10.5C16 11.3284 15.5523 12 15 12C14.4477 12 14 11.3284 14 10.5C14 9.67157 14.4477 9 15 9C15.5523 9 16 9.67157 16 10.5Z" fill="currentColor"></path><path d="M10 10.5C10 11.3284 9.55229 12 9 12C8.44772 12 8 11.3284 8 10.5C8 9.67157 8.44772 9 9 9C9.55229 9 10 9.67157 10 10.5Z" fill="currentColor"></path></svg>
        <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 8px;">Nothing found yet!</h3>
        <p style="font-size: 15px; font-weight: 500;">Be the first to post a lost or found item.</p>
      </div>
      <div class="ghostobj"></div>
    `;
  }
}

function blurtheonthis(element) {
  // Check if we need to load more items
  checkLoadMore();

  let scrollTop = element.scrollTop;
  let greeter = document.querySelector(".usergreet");
  let hero = document.querySelector(".hero");
  const maxScrollForEffect = 400;
  const maxBlurPx = 5;

  let normalizedScroll = Math.min(scrollTop / maxScrollForEffect, 1);

  function iosEaseOut(t) {
    return t === 0
      ? 0
      : t === 1
        ? 1
        : t < 0.5
          ? 2 * t * t
          : -1 + 4 * t - 2 * t * t;
  }

  let easedBlurValue = iosEaseOut(normalizedScroll);
  let blurAmount = easedBlurValue * maxBlurPx;
  element.style.backdropFilter = `blur(${blurAmount}px) brightness(${100 - easedBlurValue * 50
    }%)`;
  greeter.style.transform = `scale(${1 - easedBlurValue * 0.1})translateY(${easedBlurValue * 50
    }px) translateZ(0)`;
  hero.style.transform = `scale(${1 - easedBlurValue * 0.1})translateY(${easedBlurValue * 50
    }px) translateZ(0)`;

  let boxes = document.querySelectorAll(".lfcontainer");
  boxes.forEach((box) => {
    const boxTop = box.getBoundingClientRect().top;
    if (boxTop > window.innerHeight - 200) {
      box.style.transform = `scale(${1 - (boxTop - (window.innerHeight - 200)) / 400
        }) translateZ(0)`;
      box.style.transformOrigin = "top center";
    } else if (boxTop < 0) {
      box.style.transform = `scale(${Math.abs(Math.max(100 + boxTop, 0)) / 200 + 0.5
        }) translateZ(0)`;
      box.style.transformOrigin = "bottom center";
    } else {
      box.style.transform = `scale(1) translateZ(0)`;
    }
  });

  let uibx = document.querySelector(".color-box-ui");
  uibx.style.transform = `translateY(${(Math.min(scrollTop, 200) / 200) * 10 - 10
    }%) translateZ(0)`;
}

function startUI() {
  let mainContainer = document.querySelector(".lfcontentcontainer");
  mainContainer.style.overflowY = "scroll";

  const boxes = document.querySelectorAll(".lfcontainer");
  boxes.forEach((box) => {
    box.addEventListener("click", function (event) {
      rippleEffect(this, event);
    });
  });
  const nvbtns = document.querySelectorAll(".nav-button");
  nvbtns.forEach((btn) => {
    btn.addEventListener("click", function (event) {
      rippleEffect(this, event);
    });
  });

  window.addEventListener('click', function (event) { // eslint-disable-line no-unused-vars
  });
}

function rippleEffect(el, event) {
  const ripple = document.createElement("span");
  ripple.classList.add("ripple");
  el.appendChild(ripple);

  const elWidth = el.offsetWidth;
  const elHeight = el.offsetHeight;
  const size = Math.max(elWidth, elHeight);
  let clientbndrrct = el.getBoundingClientRect();
  let x, y;
  if (event.type === "touchstart" || event.type === "touchmove") {
    x = event.touches[0].clientX - clientbndrrct.left;
    y = event.touches[0].clientY - clientbndrrct.top;
  } else {
    x = event.clientX - clientbndrrct.left;
    y = event.clientY - clientbndrrct.top;
  }

  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${x - size / 2}px`;
  ripple.style.top = `${y - size / 2}px`;

  requestAnimationFrame(() => {
    ripple.style.transform = `scale(1.5)`;
    ripple.style.opacity = `0`;
  });

  ripple.addEventListener("transitionend", function handler() {
    ripple.remove();
    ripple.removeEventListener("transitionend", handler);
  });
}

let navstate = true;

function hidenav() {
  const nvbar = document.querySelector(".navigation-bar");
  nvbar.style.transform =
    "translateX(-50%)translateY(150%)scale(1) translateZ(0)";
  navstate = false;
}
function shownav() {
  const nvbar = document.querySelector(".navigation-bar");
  nvbar.style.transform =
    "translateX(-50%)translateY(0%)scale(1) translateZ(0)";
  navstate = true;
}

window.onclick = (event) => {
  const navButton = event.target.closest(".nav-button");
  if (navButton) {
    const targetValue = navButton.dataset.target;
    redirectTo(targetValue);
  }
};
const nav_bg_box_pos = {
  home: 0,
  search: 20,
  add: 40,
  profile: 60,
  notification: 80,
  settings: 80,
  itemdetails: 0
};
const window_names = {
  home: "",
  search: "windowsearch",
  add: "windowadd",
  profile: "windowaccount",
  notification: "windownotification",
  settings: 80,
  itemdetails: "windowitemdetails"
};

function redirectTo(destination) {
  if (destination === "add" && !localStorage.getItem("yfi_token")) {
    showLoginAlert();
    return;
  }

  document.body.classList.add("lockscroll");
  let path = JSON.parse(sessionStorage.getItem("pagepath"));
  path.push(destination);
  sessionStorage.setItem("pagepath", JSON.stringify(path));
  document.querySelector(".nav-active-box").style.left =
    nav_bg_box_pos[destination] + "%";
  let windowEl = document.getElementById(window_names[destination]);
  windowEl.style.willChange = "left";
  windowEl.classList.remove("window-hidden");

  if (destination === "profile") {
    updateProfileView();
  }

  history.pushState({ window: window_names[destination] }, "", "");
  hidenav();
}
window.onpopstate = function (event) {
  document.body.classList.remove("lockscroll");
  let path = JSON.parse(sessionStorage.getItem("pagepath"));
  if (path[path.length - 1] == "search") {
    path.pop();
    sessionStorage.setItem("pagepath", JSON.stringify(path));
    document.querySelector(".searchinput").value = "";
    document.querySelector(".search-result").innerHTML = "";
    history.replaceState(null, "", location.href);
    closewindow("search");
  } else if (path[path.length - 1] == "add") {
    path.pop();
    sessionStorage.setItem("pagepath", JSON.stringify(path));
    history.replaceState(null, "", location.href);
    closewindow("add");
    setTimeout(() => {
      document.querySelector(".addform").reset();
    }, 250);
  } else if (path[path.length - 1] == "profile") {
    path.pop();
    sessionStorage.setItem("pagepath", JSON.stringify(path));
    history.replaceState(null, "", location.href);
    if (formtype == "signup") {
      signinform();
    }
    closewindow("profile");
  } else if (path[path.length - 1] == "itemdetails") {
    path.pop();
    sessionStorage.setItem("pagepath", JSON.stringify(path));
    history.replaceState(null, "", location.href);
    closewindow("itemdetails");
  } else if (path[path.length - 1] == "notification") {
    path.pop();
    sessionStorage.setItem("pagepath", JSON.stringify(path));
    history.replaceState(null, "", location.href);
    closewindow("notification");
    handleNotificationPanelClose();
  }
  if (path[path.length - 1] === "home") {
    document.querySelector(".nav-active-box").style.left = "0%";

    history.replaceState({ window: "" }, "home", location.href);

    /*
     * Push a dummy state immediately so that the next back-press does not
     * re-trigger this handler and leave the user on a stale history entry.
     */
    setTimeout(() => {
      history.pushState({ window: "cleared" }, "", "");
    }, 0);

    if (localStorage.getItem("yfi_token")) {
      pollForUpdates();
    }
  }
};
let formtype = "login";
function closewindow(windowname) {
  document
    .getElementById(window_names[windowname])
    .classList.add("window-hidden");

  /*
   * Only show the bottom navigation bar again once we have
   * fully returned to the home feed.
   */
  let path = JSON.parse(sessionStorage.getItem("pagepath")) || ["home"];
  if (path.length === 0 || path[path.length - 1] === "home") {
    shownav();
  }
}

// window.onbeforeunload removed — not needed in current navigation model

function signupform() {
  formtype = "signup";
  let expans = document.querySelectorAll(".collapedfield");
  expans.forEach((items) => {
    items.classList.add("visible");
    items.style.pointerEvents = "all";
  });
  let title = document.querySelector(".accformtitle");
  title.style.willChange = "background-position";
  title.style.backgroundPosition = "0% 0%";
  setTimeout(() => {
    title.innerHTML = `Sign Up`;
    title.style.backgroundPosition = "0% -100%";
    setTimeout(() => {
      title.style.transition = "none";
      title.style.backgroundPosition = "0% 100%";
      setTimeout(() => {
        title.style.transition = "0.25s cubic-bezier(0.25, 0.1, 0.25, 1)";
      }, 100);
    }, 250);
  }, 250);

  let btn = document.querySelector(".accbtn");
  btn.style.willChange = "color";
  btn.style.color = "transparent";
  setTimeout(() => {
    btn.textContent = "Sign Up";
    btn.style.color = "var(--theme-accent)";
  }, 250);
  let bttxt = document.querySelector(".accbtmtxt");
  bttxt.style.willChange = "background-position";
  bttxt.style.backgroundPosition = "0%";
  setTimeout(() => {
    bttxt.innerHTML = `<span class="accbtmtxt">Already have an account?
        <a class="uiurl" href="javascript:void(0);" onclick="signinform()">login</a>
        </span>`;
    bttxt.style.backgroundPosition = "-100%";
    setTimeout(() => {
      bttxt.style.transition = "none";
      bttxt.style.backgroundPosition = "100%";
      setTimeout(() => {
        bttxt.style.transition = "0.25s cubic-bezier(0.25, 0.1, 0.25, 1)";
      }, 100);
    }, 250);
  }, 250);
}
function signinform() {
  formtype = "login";
  let expans = document.querySelectorAll(".collapedfield");
  expans.forEach((items) => {
    items.classList.remove("visible");
    items.style.pointerEvents = "none";
  });
  let title = document.querySelector(".accformtitle");
  title.style.willChange = "background-position";
  title.style.backgroundPosition = "0% 0%";
  setTimeout(() => {
    title.innerHTML = `Login`;
    title.style.backgroundPosition = "0% -100%";
    setTimeout(() => {
      title.style.transition = "none";
      title.style.backgroundPosition = "0% 100%";
      setTimeout(() => {
        title.style.transition = "0.25s cubic-bezier(0.25, 0.1, 0.25, 1)";
      }, 100);
    }, 250);
  }, 250);

  let btn = document.querySelector(".accbtn");
  btn.style.willChange = "color";
  btn.style.color = "transparent";
  setTimeout(() => {
    btn.textContent = "Login";
    btn.style.color = "var(--theme-accent)";
  }, 250);
  let bttxt = document.querySelector(".accbtmtxt");
  bttxt.style.willChange = "background-position";
  bttxt.style.backgroundPosition = "0%";
  setTimeout(() => {
    bttxt.innerHTML = `<span class="accbtmtxt">&nbsp;Don't have an account?
            <a class="uiurl" href="javascript:void(0);" onclick="signupform()">Sign Up</a>
        </span>`;
    bttxt.style.backgroundPosition = "-100%";
    setTimeout(() => {
      bttxt.style.transition = "none";
      bttxt.style.backgroundPosition = "100%";
      setTimeout(() => {
        bttxt.style.transition = "0.25s cubic-bezier(0.25, 0.1, 0.25, 1)";
      }, 100);
    }, 250);
  }, 250);
}

let categoriesList = [];

async function loadCategories() {
  const token = localStorage.getItem("yfi_token");
  if (!token) return;
  const res = await fetchCategories(token);
  if (res.data && res.data.success && res.data.data) {
    categoriesList = res.data.data.map(cat => cat.name);
  }
}

function showCategoryDropdown() {
  const dropdown = document.getElementById("categoryDropdown");
  if (dropdown) {
    dropdown.style.display = "block";
    filterCategory();
  }
}

function hideCategoryDropdown() {
  setTimeout(() => {
    const dropdown = document.getElementById("categoryDropdown");
    if (dropdown) {
      dropdown.style.display = "none";
    }
  }, 200);
}

function filterCategory() {
  const input = document.getElementById("categoryInput");
  const filter = input.value.toLowerCase();
  const dropdown = document.getElementById("categoryDropdown");

  if (!dropdown || !input) return;

  dropdown.innerHTML = "";
  let matches = 0;

  categoriesList.forEach(category => {
    if (category.toLowerCase().includes(filter)) {
      matches++;
      const option = document.createElement("div");
      option.className = "category-option";
      option.textContent = category;
      option.onclick = function () {
        input.value = category;
        dropdown.style.display = "none";
      };
      dropdown.appendChild(option);
    }
  });

  if (matches === 0 && filter.trim() !== "") {
    const createOption = document.createElement("div");
    createOption.className = "category-option create-option";
    createOption.innerHTML = `Create "<b>${input.value}</b>"`;
    createOption.onclick = async function () {
      const newCategory = input.value.trim();
      const token = localStorage.getItem("yfi_token");

      if (!token) {
        alert("You must be logged in to create a category.");
        return;
      }

      createOption.innerHTML = `Creating "<b>${newCategory}</b>"...`;

      const res = await createCategory(token, newCategory);
      if (res.data && res.data.success) {
        categoriesList.push(newCategory);
        input.value = newCategory;
        dropdown.style.display = "none";
      } else {
        alert(res.data.message || "Failed to create category");
        createOption.innerHTML = `Create "<b>${newCategory}</b>"`;
      }
    };
    dropdown.appendChild(createOption);
  }
}

function toggleTypeDropdown() {
  const dropdown = document.getElementById("typeDropdown");
  if (dropdown) {
    dropdown.style.display = "block";
  }
}

function hideTypeDropdown() {
  setTimeout(() => {
    const dropdown = document.getElementById("typeDropdown");
    if (dropdown) {
      dropdown.style.display = "none";
    }
  }, 200);
}

function selectType(value, label) {
  const input = document.getElementById("typeInput");
  const hiddenInput = document.getElementById("typeHiddenInput");
  const dropdown = document.getElementById("typeDropdown");

  if (input && hiddenInput && dropdown) {
    hiddenInput.value = value;
    input.value = label;

    if (value === 'lost') {
      input.style.backgroundColor = "var(--yfiui-red)";
      input.style.color = "white";
      input.style.fontWeight = "bold";
    } else if (value === 'found') {
      input.style.backgroundColor = "var(--yfiui-green)";
      input.style.color = "white";
      input.style.fontWeight = "bold";
    }

    dropdown.style.display = "none";
  }
}

// ----- Authentication & User Profile Logic -----

async function updateProfileView() {
  const token = localStorage.getItem("yfi_token");
  const userJson = localStorage.getItem("yfi_user");
  const authContainer = document.getElementById("authContainer");
  const profileContainer = document.getElementById("profileContainer");

  if (!authContainer || !profileContainer) return;

  if (token && userJson) {
    const user = JSON.parse(userJson);
    const displayName = user.name || user.fullname || "User";
    document.getElementById("profileName").innerText = displayName;
    document.getElementById("profileEmail").innerText = user.email || "";
    document.getElementById("profileAvatar").innerText = displayName.charAt(0).toUpperCase();

    authContainer.style.display = "none";
    profileContainer.style.display = "flex";

    updateHomeHeader(true, displayName);
    await loadMyItems();
  } else {
    authContainer.style.display = "block";
    profileContainer.style.display = "none";
    if (formtype === "signup") signinform();

    updateHomeHeader(false);
  }
}

async function loadMyItems() {
  const container = document.getElementById("myItemsContainer");
  if (!container) return;

  const token = localStorage.getItem("yfi_token");
  if (!token) return;

  container.innerHTML = `
    <div class="my-items-header">My Items</div>
    <div class="my-items-empty">Loading your items...</div>
  `;

  const res = await fetchMyItems(token);

  if (res.data && res.data.success && res.data.data && res.data.data.length > 0) {
    let html = `<div class="my-items-header">My Items</div>`;

    let lostCount  = 0;
    let foundCount = 0;

    res.data.data.forEach(item => {
      const isLost   = item.item_type.toLowerCase() === "lost";
      const tagClass = isLost ? "lost" : "found";
      const tagLabel = isLost ? "LOST" : "FOUND";

      if (isLost) lostCount++;
      else foundCount++;

      /* Build item thumbnail HTML */
      let imgHTML = `<div class="myitem-img-placeholder">No Image</div>`;
      if (item.images && item.images.length > 0) {
        const firstImage = Array.isArray(item.images) ? item.images[0] : item.images;
        const imgUrl = firstImage.startsWith('http') ? firstImage : `${HOST}/${firstImage}`;
        imgHTML = `<img src="${imgUrl}" class="myitem-img" alt="Item Image" loading="lazy">`;
      }

      html += `
        <div class="myitem-card" onclick="openItemDetails(${item.item_id})">
          ${imgHTML}
          <div class="myitem-info">
            <h3 class="myitem-title">${item.title}</h3>
            <div class="myitem-meta">
              <span class="myitem-tag ${tagClass}">${tagLabel}</span>
              <span>${item.uploaded_at || item.created_at}</span>
            </div>
          </div>
          <button class="myitem-delete-btn" onclick="promptDeleteItem(event, ${item.item_id}, '${item.title.replace(/'/g, "\\'")}')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"></path>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;
    });
    container.innerHTML = html;

    document.getElementById("profileStatLost").innerText  = lostCount;
    document.getElementById("profileStatFound").innerText = foundCount;
  } else {
    container.innerHTML = `
      <div class="my-items-header">My Items</div>
      <div class="my-items-empty">You haven't posted any items yet!</div>
    `;

    document.getElementById("profileStatLost").innerText  = "0";
    document.getElementById("profileStatFound").innerText = "0";
  }
}

async function promptDeleteItem(event, itemId, itemTitle, onSuccessCallback) {
  /* Prevent the click from bubbling to the item card and opening details */
  event.stopPropagation();

  const trashSVG = `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;

  showAlertModal(
    trashSVG,
    "Delete Item",
    `Are you sure you want to delete "${itemTitle}"? This cannot be undone.`,
    "Delete",
    async () => {
      const token = localStorage.getItem("yfi_token");
      if (!token) return;

      const res = await deleteItem(token, itemId);

      if (res.data && res.data.success) {
        toastUI.show(res.data.message || "Item deleted successfully", "success");
        await loadMyItems();
        await loadHomeFeed();
        if (typeof onSuccessCallback === 'function') {
          onSuccessCallback();
        }
      } else {
        toastUI.show(res.data.message || "Failed to delete item", "error");
      }
    },
    true // isDestructive true for red styling
  );
}

function updateHomeHeader(isLoggedIn, userName = "") {
  const actionContainer = document.getElementById("homeHeaderAction");
  const greetText = document.getElementById("homeGreetText");
  const nameText = document.getElementById("homeNameText");

  if (!actionContainer || !greetText || !nameText) return;

  if (isLoggedIn) {
    const initial = userName.charAt(0).toUpperCase();
    actionContainer.innerHTML = `<button class="home-avatar-btn" onclick="redirectTo('profile')">${initial}</button>`;
    greetText.innerText = `Hi,`;
    nameText.innerText = userName;
  } else {
    actionContainer.innerHTML = `<button class="loginbtn" onclick="redirectTo('profile')">Login</button>`;
    greetText.innerText = `Welcome to,`;
    nameText.innerText = `YoFoundIt`;
  }
}

function showLogoutModal() {
  const modal = document.getElementById("logoutModal");
  if (!modal) return;

  modal.classList.remove("closing");
  modal.classList.add("active");
}

function closeLogoutModal() {
  const modal = document.getElementById("logoutModal");
  if (!modal) return;

  modal.classList.add("closing");
  setTimeout(() => {
    modal.classList.remove("active");
    modal.classList.remove("closing");
  }, 250);
}

async function handleLogout() {
  closeLogoutModal();

  /* Invalidate the server-side session before clearing local credentials */
  const token = localStorage.getItem("yfi_token");
  if (token) {
    await logoutUser(token);
  }

  localStorage.removeItem("yfi_token");
  localStorage.removeItem("yfi_user");
  updateProfileView();
  closewindow("profile");
  setTimeout(() => redirectTo("home"), 200);
  window.location.reload();
}

function showAlertModal(svgContent, title, message, actionText, onConfirm, isDestructive = false) {
  const modal = document.getElementById("alertModal");
  if (!modal) return;

  /* Set modal content */
  const iconContainer = document.getElementById("alertModalIcon");
  if (iconContainer && svgContent) {
    iconContainer.innerHTML = svgContent;
  }

  document.getElementById("alertModalTitle").innerText   = title;
  document.getElementById("alertModalMessage").innerText = message;

  const actionBtn = document.getElementById("alertModalActionBtn");
  actionBtn.innerText = actionText;

  /* Apply danger styling for destructive actions, neutral styling otherwise */
  if (isDestructive) {
    actionBtn.style.backgroundColor = "var(--yfiui-red)";
    actionBtn.style.color = "white";
    if (iconContainer) iconContainer.style.color = "var(--yfiui-red)";
  } else {
    actionBtn.style.backgroundColor = "var(--theme-color)";
    actionBtn.style.color           = "var(--theme-accent)";
    if (iconContainer) iconContainer.style.color = "var(--yfiui-red)";
  }

  modal.classList.remove("closing");
  modal.classList.add("active");

  actionBtn.onclick = () => {
    closeAlertModal();
    if (onConfirm) onConfirm();
  };
}

function showLoginAlert() {
  const passwordSVG = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14.9453 1.25C13.5778 1.24998 12.4754 1.24996 11.6085 1.36652C10.7084 1.48754 9.95048 1.74643 9.34857 2.34835C8.82363 2.87328 8.55839 3.51836 8.41916 4.27635C8.28387 5.01291 8.25799 5.9143 8.25196 6.99583C8.24966 7.41003 8.58357 7.74768 8.99778 7.74999C9.41199 7.7523 9.74964 7.41838 9.75194 7.00418C9.75803 5.91068 9.78643 5.1356 9.89448 4.54735C9.99859 3.98054 10.1658 3.65246 10.4092 3.40901C10.686 3.13225 11.0746 2.9518 11.8083 2.85315C12.5637 2.75159 13.5648 2.75 15.0002 2.75H16.0002C17.4356 2.75 18.4367 2.75159 19.1921 2.85315C19.9259 2.9518 20.3144 3.13225 20.5912 3.40901C20.868 3.68577 21.0484 4.07435 21.1471 4.80812C21.2486 5.56347 21.2502 6.56459 21.2502 8V16C21.2502 17.4354 21.2486 18.4365 21.1471 19.1919C21.0484 19.9257 20.868 20.3142 20.5912 20.591C20.3144 20.8678 19.9259 21.0482 19.1921 21.1469C18.4367 21.2484 17.4356 21.25 16.0002 21.25H15.0002C13.5648 21.25 12.5637 21.2484 11.8083 21.1469C11.0746 21.0482 10.686 20.8678 10.4092 20.591C10.1658 20.3475 9.99859 20.0195 9.89448 19.4527C9.78643 18.8644 9.75803 18.0893 9.75194 16.9958C9.74964 16.5816 9.41199 16.2477 8.99778 16.25C8.58357 16.2523 8.24966 16.59 8.25196 17.0042C8.25799 18.0857 8.28387 18.9871 8.41916 19.7236C8.55839 20.4816 8.82363 21.1267 9.34857 21.6517C9.95048 22.2536 10.7084 22.5125 11.6085 22.6335C12.4754 22.75 13.5778 22.75 14.9453 22.75H16.0551C17.4227 22.75 18.525 22.75 19.392 22.6335C20.2921 22.5125 21.0499 22.2536 21.6519 21.6517C22.2538 21.0497 22.5127 20.2919 22.6337 19.3918C22.7503 18.5248 22.7502 17.4225 22.7502 16.0549V7.94513C22.7502 6.57754 22.7503 5.47522 22.6337 4.60825C22.5127 3.70814 22.2538 2.95027 21.6519 2.34835C21.0499 1.74643 20.2921 1.48754 19.392 1.36652C18.525 1.24996 17.4227 1.24998 16.0551 1.25H14.9453Z" fill="#1e2f3b" /><path d="M15 11.25C15.4142 11.25 15.75 11.5858 15.75 12C15.75 12.4142 15.4142 12.75 15 12.75H4.02744L5.98809 14.4306C6.30259 14.7001 6.33901 15.1736 6.06944 15.4881C5.79988 15.8026 5.3264 15.839 5.01191 15.5694L1.51191 12.5694C1.34567 12.427 1.25 12.2189 1.25 12C1.25 11.7811 1.34567 11.573 1.51191 11.4306L5.01191 8.43056C5.3264 8.16099 5.79988 8.19741 6.06944 8.51191C6.33901 8.8264 6.30259 9.29988 5.98809 9.56944L4.02744 11.25H15Z" fill="#1e2f3b" /></svg>`;

  showAlertModal(
    passwordSVG,
    "Authentication Required",
    "You need to log in to claim items.",
    "Login Now",
    () => {
      closewindow("itemdetails");
      setTimeout(() => redirectTo("profile"), 300);
    }
  );
}

function closeAlertModal() {
  const modal = document.getElementById("alertModal");
  if (!modal) return;

  modal.classList.add("closing");
  setTimeout(() => {
    modal.classList.remove("active");
    modal.classList.remove("closing");
  }, 250);
}

// Intercept Auth Form Submission
async function handleAuthSubmit(event) {
  event.preventDefault();
  const form = event.target;

  const submitBtn = document.getElementById("authSubmitBtn");
  submitBtn.classList.add("loading");

  const email = form.email.value;
  const password = form.password.value;

  if (formtype === "login") {
    const res = await loginUser({ email, password });
    if (res.data && res.data.success) {
      localStorage.setItem("yfi_token", res.data.token);
      localStorage.setItem("yfi_user", JSON.stringify({
        fullname: res.data.fullname,
        email: res.data.email,
        phone: res.data.phone
      }));
      updateProfileView();
      await loadCategories();
      toastUI.show("Login successful!", "success");
    } else {
      toastUI.show(res.data.message || "Login failed", "error");
    }
  } else {
    const full_name = form.name.value; // The HTML input name is "name"
    const confirm_password = form.confirm_password.value;
    const phone = form.country_code.value + form.whatsapp_number.value;

    const res = await registerUser({
      full_name, email, phone, password, confirm_password
    });

    if (res.data && res.data.success) {
      localStorage.setItem("yfi_token", res.data.token);
      localStorage.setItem("yfi_user", JSON.stringify(res.data.user));
      updateProfileView();
      await loadCategories();
      toastUI.show("Registration successful!", "success");
    } else {
      toastUI.show(res.data.message || "Registration failed", "error");
    }
  }

  submitBtn.classList.remove("loading");
}

/* =============================================================
 * Toast Modal
 * Reusable animated toast for user feedback (success / error).
 * ============================================================= */
class ToastModal {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'yfi-toast-wrapper';
    this.iconLabel = document.createElement('span');
    this.iconLabel.className = 'yfi-toast-icon';
    this.msgLabel = document.createElement('span');
    this.msgLabel.className = 'yfi-toast-content';
    this.el.appendChild(this.iconLabel);
    this.el.appendChild(this.msgLabel);
    document.body.appendChild(this.el);
    this.timeout = null;
  }

  show(message, type = 'error') {
    if (this.timeout) clearTimeout(this.timeout);
    this.msgLabel.innerText = message;

    if (type === 'success') {
      this.el.classList.add('success');
      this.iconLabel.innerHTML = '&#10003;';
    } else {
      this.el.classList.remove('success');
      this.iconLabel.innerHTML = '&#9888;';
    }

    this.el.classList.add('show');

    this.timeout = setTimeout(() => {
      this.el.classList.remove('show');
    }, 3000);
  }
}

const toastUI = new ToastModal();

/* =============================================================
 * Add Item Form
 * Handles form validation, image preparation, and submission.
 * ============================================================= */
async function handleAddSubmit(event) {
  event.preventDefault();
  const token = localStorage.getItem("yfi_token");
  if (!token) {
    showLoginAlert();
    return;
  }

  const form = event.target;
  if (!form.type.value) {
    toastUI.show("Please select LOST or FOUND", "error");
    return;
  }

  const submitBtn = form.querySelector('.sbmtbtn');
  const originalText = submitBtn.innerText;
  submitBtn.innerText = "POSTING...";
  submitBtn.disabled = true;

  const formData = new FormData(form);

  selectedFiles.forEach((file) => {
    formData.append("images[]", file);
  });

  const res = await addItem(token, formData);

  if (res.data && res.data.success) {
    toastUI.show("Item posted successfully!", "success");
    form.reset();

    /* Reset the custom type dropdown back to its unselected state */
    const typeInput = document.getElementById("typeInput");
    if (typeInput) typeInput.value = "";
    typeInput.style.backgroundColor = "transparent";
    typeInput.style.color = "var(--theme-color)";
    typeInput.style.fontWeight = "normal";

    /* Clear image previews */
    const previewContainer = document.getElementById("imagePreviewContainer");
    if (previewContainer) {
      previewContainer.innerHTML = "";
      previewContainer.style.display = "none";
    }
    selectedFiles = [];

    await loadHomeFeed();

    setTimeout(() => {
      closewindow("add");
      if (window.history.length > 1) {
        history.back();
      }
    }, 1500);
  } else {
    toastUI.show(res.data.message || "Failed to post item", "error");
  }

  submitBtn.innerText = originalText;
  submitBtn.disabled = false;
}

/* =============================================================
 * Image Preview & Compression
 * Manages the selected-files list, resizes via Worker when
 * available, and renders thumbnail previews before upload.
 * ============================================================= */
const uploadInput  = document.getElementById("imageupload");
const captureInput = document.getElementById("imagecapture");
const previewContainer = document.getElementById("imagePreviewContainer");

let selectedFiles = [];

/**
 * Offloads image decoding/re-encoding to the resize Worker when
 * OffscreenCanvas is available; falls back to main-thread canvas otherwise.
 */
const supportsOffscreen = typeof OffscreenCanvas !== 'undefined';
const resizeWorker = supportsOffscreen ? new Worker('./js/resize.worker.js') : null;

function prepareImage(file, thresholdKB = 500, targetKB = 400) {
  if (file.size <= thresholdKB * 1024) return Promise.resolve(file);

  if (resizeWorker) {
    /* Off-thread path via Worker + OffscreenCanvas */
    return new Promise((resolve, reject) => {
      const msgChannel = new MessageChannel();
      msgChannel.port1.onmessage = (e) => {
        if (e.data.error) reject(new Error(e.data.error));
        else resolve(e.data.blob);
      };
      resizeWorker.postMessage({ file, targetKB }, [msgChannel.port2]);
    });
  } else {
    /* Fallback: resize on the main thread using a regular canvas */
    return fallbackResize(file, targetKB);
  }
}

async function fallbackResize(file, targetKB) {
  const bitmap = await createImageBitmap(file);

  let width = bitmap.width;
  let height = bitmap.height;

  const MAX_LANDSCAPE = 1920;
  const MAX_PORTRAIT = 1080;
  const MAX_SQUARE = 1080;

  if (width > height) {
    /* Landscape */
    if (width > MAX_LANDSCAPE) {
      height = Math.round((height * MAX_LANDSCAPE) / width);
      width  = MAX_LANDSCAPE;
    }
  } else if (height > width) {
    /* Portrait */
    if (height > MAX_PORTRAIT) {
      width  = Math.round((width * MAX_PORTRAIT) / height);
      height = MAX_PORTRAIT;
    }
  } else {
    /* Square */
    if (width > MAX_SQUARE) {
      width  = MAX_SQUARE;
      height = MAX_SQUARE;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d', { alpha: false }).drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const quality = Math.min(0.85, Math.max(0.1, ((targetKB * 1024) / file.size) * 0.85));
  return await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
}

function renderPreviews() {
  previewContainer.innerHTML = "";
  if (selectedFiles.length === 0) {
    previewContainer.style.display = "none";
    return;
  }

  previewContainer.style.display = "flex";

  selectedFiles.forEach((file, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "preview-thumbnail-wrapper";

    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.className = "preview-thumbnail-img";

    const deleteBtn = document.createElement("button");
    deleteBtn.innerHTML = "&times;";
    deleteBtn.className = "preview-thumbnail-delete";
    deleteBtn.onclick = (e) => {
      e.preventDefault();
      selectedFiles.splice(index, 1);
      renderPreviews();
    };

    wrapper.appendChild(img);
    wrapper.appendChild(deleteBtn);
    previewContainer.appendChild(wrapper);
  });
}

async function handleFileSelection(files) {
  if (files && files.length > 0) {
    // Show a loading UI for processing if necessary
    for (let file of Array.from(files)) {
      try {
        const processedFileOrBlob = await prepareImage(file);

        // If it was resized, it comes back as a Blob. Convert it back to a File.
        let fileToUpload = processedFileOrBlob;
        if (!(processedFileOrBlob instanceof File)) {
          fileToUpload = new File([processedFileOrBlob], file.name, {
            type: processedFileOrBlob.type || 'image/jpeg',
            lastModified: Date.now(),
          });
        }

        selectedFiles.push(fileToUpload);
      } catch (e) {
        console.error("Failed to compress image:", file.name, e);
        // Fallback to pushing the original file if compression fails so they don't lose their data
        selectedFiles.push(file);
      }
    }
    renderPreviews();
  }
}

  if (uploadInput && captureInput) {
    uploadInput.addEventListener("change", function () {
      handleFileSelection(this.files);
      /* Reset the input so the same file can be re-selected after removal */
      this.value = "";
    });

    captureInput.addEventListener("change", function () {
      handleFileSelection(this.files);
      this.value = "";
    });
  }

/* =============================================================
 * Item Details
 * Fetches and populates the item detail view. Handles the
 * carousel, claim/delete buttons, and lock overlay.
 * ============================================================= */
function closeItemDetails() {
  if (window.history.length > 1) {
    history.back();
  } else {
    /* Fallback: no history entry — manipulate the path stack directly */
    let path = JSON.parse(sessionStorage.getItem("pagepath")) || ["home"];
    if (path[path.length - 1] === "itemdetails") {
      path.pop();
      sessionStorage.setItem("pagepath", JSON.stringify(path));
    }
    closewindow("itemdetails");
  }
}

async function handleClaimClick(itemId, isLost = false) {
  const token = localStorage.getItem("yfi_token");
  if (!token) {
    showLoginAlert();
    return;
  }

  if (!itemId) {
    toastUI.show("Cannot claim this item.", "error");
    return;
  }

  const claimBtn = document.getElementById('btnClaim');
  const originalHtml = claimBtn.innerHTML;
  claimBtn.innerHTML = "Processing...";
  claimBtn.disabled = true;

  const res = await claimItem(token, itemId);

  if (res.data && res.data.success) {
    toastUI.show(res.data.message || "Item claimed successfully", "success");

    /* Keep the button disabled with a contextual label — do not restore to original state */
    claimBtn.innerHTML = isLost ? "Reported as Found" : "Already Claimed";
    claimBtn.className = 'contact-btn claim-btn claim-btn-taken';
    claimBtn.disabled  = true;
    claimBtn.style.opacity       = '';
    claimBtn.style.pointerEvents = 'all';
    claimBtn.onclick = null;
  } else {
    toastUI.show(res.data.message || "Failed to claim item", "error");
    claimBtn.innerHTML = originalHtml;
    claimBtn.disabled  = false;
  }
}

async function openItemDetails(itemId) {
  const res = await fetchItemDetails(itemId);

  if (res.status === 200 && res.data && res.data.success && res.data.data) {
    const item = res.data.data;

    const isLost      = item.item_type && item.item_type.toLowerCase() === "lost";
    const tagColorClass = isLost ? "yfiui-red" : "yfiui-green";
    const tagLabel    = isLost ? "LOST" : "FOUND";

    const detailsTag = document.getElementById('detailsTag');
    detailsTag.className   = `lftag ${tagColorClass}`;
    detailsTag.textContent = tagLabel;

    document.getElementById('detailsTitle').textContent = item.title;
    document.getElementById('detailsCategory').textContent = `Category: ${item.category}`;
    document.getElementById('detailsTime').textContent = `Posted ${item.uploaded_at}`;
    document.getElementById('detailsDescription').textContent = item.description;

    /* Contact section heading — differs based on whether user owns the item */
    const contactLabel = document.getElementById('detailsContactLabel');
    if (contactLabel) {
      if (item.isAddedByUser) {
        contactLabel.innerHTML = `Uploaded by <span id="detailsPosterName">You</span>`;
      } else {
        const posterName = item.posted_by || "User";
        contactLabel.innerHTML = `Contact <span id="detailsPosterName">${posterName}</span>`;
      }
    } else {
      document.getElementById('detailsPosterName').textContent = item.posted_by || "User";
    }

    const claimBtnWrapper   = document.getElementById('claimBtnWrapper');
    const claimBtn          = document.getElementById('btnClaim');
    const claimLockOverlay  = document.getElementById('claimLockOverlay');

    /* Button behaviour varies by ownership and item type */
    if (item.isAddedByUser) {
      claimBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 6h18"></path>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
        Delete Item
      `;
      claimBtn.className = 'contact-btn claim-btn claim-btn-danger';
      claimBtn.onclick = (e) => {
        promptDeleteItem(e, item.item_id, item.title, () => {
          closeItemDetails();
        });
      };
    } else if (isLost) {
      claimBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
        Found It
      `;
      claimBtn.className = 'contact-btn claim-btn claim-btn-success';
      claimBtn.onclick = () => handleClaimClick(item.item_id, isLost);
    } else {
      claimBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
        </svg>
        Claim Item
      `;
      claimBtn.className = 'contact-btn claim-btn claim-btn-primary';
      claimBtn.onclick = () => handleClaimClick(item.item_id, isLost);
    }

    const isLoggedIn = localStorage.getItem("yfi_token");

    if (item.isAddedByUser) {
      claimBtnWrapper.classList.remove('locked');
      claimLockOverlay.style.display = 'none';
      claimBtn.disabled = false;
      claimBtn.style.opacity = '1';
      claimBtn.style.pointerEvents = 'all';
    } else if (isLoggedIn) {
      claimBtnWrapper.classList.remove('locked');
      claimLockOverlay.style.display = 'none';
      claimBtn.disabled = false;
      claimBtn.style.opacity = '1';
      claimBtn.style.pointerEvents = 'all';
    } else {
      claimBtnWrapper.classList.add('locked');
      claimLockOverlay.style.display = 'flex';
      claimBtn.disabled = true;
      claimBtn.style.opacity = '0.6';
      claimBtn.style.pointerEvents = 'none';
    }

    if (item.actionTaken && !item.isAddedByUser) {
      claimBtn.innerHTML = isLost ? "Reported as Found" : "Already Claimed";
      claimBtn.className = 'contact-btn claim-btn claim-btn-taken';
      claimBtn.disabled  = true;
      claimBtn.style.opacity       = '';
      claimBtn.style.pointerEvents = 'all'; /* Receives clicks but does nothing — button is disabled */
      claimBtn.onclick = null;
    }

    /* Populate image carousel */
    const carouselOpts = document.getElementById('detailsCarousel');
    carouselOpts.innerHTML = '';

    const viewerCarousel = document.getElementById('imageViewerCarousel');
    if (viewerCarousel) viewerCarousel.innerHTML = '';

    if (item.images && item.images.length > 0) {
      carouselOpts.style.display = 'flex';
      item.images.forEach((img, index) => {
        carouselOpts.insertAdjacentHTML('beforeend', `<img src="${HOST}/${img}" alt="Image" class="details-carousel-img" onclick="openImageViewer(${index})">`);
        if (viewerCarousel) {
          viewerCarousel.insertAdjacentHTML('beforeend', `<img src="${HOST}/${img}" alt="Fullscreen Image" class="viewer-fullscreen-img">`);
        }
      });
      setupCarouselIndicators('detailsCarousel', 'detailsIndicators');
      setupCarouselIndicators('imageViewerCarousel', 'viewerIndicators');
    } else {
      carouselOpts.style.display = 'none';
      document.getElementById('detailsIndicators').style.display = 'none';
      if (document.getElementById('viewerIndicators')) document.getElementById('viewerIndicators').style.display = 'none';
    }

    redirectTo("itemdetails");
  } else {
    /* Item fetch failed — show the most descriptive error available */
    const msg = (res.data && res.data.message) ? res.data.message : "Failed to load item details.";
    if (typeof uiToast !== 'undefined') {
      uiToast.show(msg, "error");
    } else if (typeof toastUI !== 'undefined') {
      toastUI.show(msg, "error");
    } else {
      alert(msg);
    }
  }
}

/* =============================================================
 * Carousel Indicators
 * Builds and synchronises dot indicators for any scroll carousel.
 * ============================================================= */
function setupCarouselIndicators(carouselId, indicatorsId) {
  const carousel = document.getElementById(carouselId);
  const indicatorsContainer = document.getElementById(indicatorsId);
  if (!carousel || !indicatorsContainer) return;

  const images = Array.from(carousel.querySelectorAll('img'));
  if (images.length <= 1) {
    indicatorsContainer.style.display = 'none';
    return;
  }

  indicatorsContainer.style.display = 'flex';
  indicatorsContainer.innerHTML = '';

  images.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = `carousel-dot ${i === 0 ? 'active' : ''}`;
    dot.onclick = () => {
      images[i].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    };
    indicatorsContainer.appendChild(dot);
  });

  /* Update active dot based on the image closest to the carousel centre */
  carousel.onscroll = () => {
    let closestIndex = 0;
    let minDiff = Infinity;

    images.forEach((img, i) => {
      const carouselRect = carousel.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();

      const carouselCenter = carouselRect.left + carouselRect.width / 2;
      const imgCenter = imgRect.left + imgRect.width / 2;
      const diff = Math.abs(carouselCenter - imgCenter);

      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    });

    const dots = indicatorsContainer.querySelectorAll('.carousel-dot');
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === closestIndex);
    });
  };
}

/* =============================================================
 * Full-Screen Image Viewer
 * Opens the lightbox and scrolls to the tapped image.
 * ============================================================= */
function openImageViewer(index) {
  const modal = document.getElementById('imageViewerModal');
  const carousel = document.getElementById('imageViewerCarousel');

  if (!modal || !carousel) return;

  modal.classList.remove('closing');
  modal.classList.add('active');

  /*
   * Small delay ensures the modal is visible before scrollIntoView fires,
   * avoiding a no-op when elements have not yet been painted.
   */
  setTimeout(() => {
    const images = carousel.querySelectorAll('.viewer-fullscreen-img');
    if (images[index]) {
      images[index].scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
    }
  }, 10);
}

function closeImageViewer() {
  const modal = document.getElementById('imageViewerModal');
  if (!modal) return;

  modal.classList.add('closing');
  setTimeout(() => {
    modal.classList.remove('active');
    modal.classList.remove('closing');
  }, 300);
}

/* =============================================================
 * Notifications
 * Renders the notification inbox and manages the unread → read
 * transition when the panel is closed.
 * ============================================================= */
let currentNotificationsRaw      = "[]";
let unreadNotificationIdsToRead  = [];

window.addEventListener('pagehide', () => {
  handleNotificationPanelClose();
});

function handleNotificationPanelClose() {
  if (!unreadNotificationIdsToRead || unreadNotificationIdsToRead.length === 0) return;
  const token = localStorage.getItem("yfi_token");
  if (token) {
    unreadNotificationIdsToRead.forEach(id => {
      readNotification(token, id);
    });
  }

  /* Update the UI immediately so a re-open shows items as already-read */
  const unreadItems = document.querySelectorAll('#notificationContainer .notification-item.unread');
  unreadItems.forEach(el => {
    el.classList.remove('unread');
    el.classList.add('read');
    const dot = el.querySelector('.notification-dot');
    if (dot) dot.remove();
  });

  const bubble = document.getElementById("notificationBubble");
  if (bubble) bubble.style.display = "none";

  if (currentNotificationsRaw !== "[]") {
    let currentNotifs = JSON.parse(currentNotificationsRaw);
    currentNotifs.forEach(n => { n.is_read = true; });
    currentNotificationsRaw = JSON.stringify(currentNotifs);
  }

  unreadNotificationIdsToRead = [];
}

function renderNotifications(notificationsPayload) {
  const notifications = Array.isArray(notificationsPayload) ? notificationsPayload : [];

  const newNotificationsRaw = JSON.stringify(notifications);
  if (currentNotificationsRaw === newNotificationsRaw) return;
  currentNotificationsRaw = newNotificationsRaw;

  // Store unread items for subsequent API reading on panel close
  unreadNotificationIdsToRead = notifications.filter(n => !n.is_read).map(n => n.notification_id);

  const bubble = document.getElementById("notificationBubble");
  const container = document.getElementById("notificationContainer");

  if (!container) return;

  if (notifications.length === 0) {
    if (bubble) bubble.style.display = "none";
    container.innerHTML = `<div class="empty-state" style="text-align:center; padding: 20px; color:#777;">No notifications in the inbox</div>`;
    return;
  }

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (bubble) {
    if (unreadCount > 0) {
      bubble.style.display = "flex";
      bubble.innerText = unreadCount > 99 ? '99+' : unreadCount;
    } else {
      bubble.style.display = "none";
    }
  }

  let html = "";
  notifications.forEach(n => {
    const isUnread = !n.is_read;
    let contentReplaced = n.content || "";
    if (n.type === "claimed" && n.user_name && n.item_title) {
      contentReplaced = `<span class="highlight-user">${n.user_name}</span> claimed your item <strong>${n.item_title}</strong>. Please contact them to coordinate.`;
    } else if (n.type === "found" && n.user_name && n.item_title) {
      contentReplaced = `<span class="highlight-user">${n.user_name}</span> found your missing item <strong>${n.item_title}</strong>. Please contact them to retrieve it.`;
    } else if (n.user_name) {
      contentReplaced = contentReplaced.replace(/<user_name>/g, `<span class="highlight-user">${n.user_name}</span>`);
    }

    let actionsHtml = "";
    if (n.type === "claimed" || n.type === "found") {
      actionsHtml = `
        <div class="notification-actions">
          <a href="https://wa.me/${n.whatsapp_number}" target="_blank" onclick="event.stopPropagation()" class="contact-btn claim-btn claim-btn-success notif-action-btn">WhatsApp</a>
          <a href="mailto:${n.email}" target="_blank" onclick="event.stopPropagation()" class="contact-btn claim-btn claim-btn-primary notif-action-btn">Email</a>
        </div>
      `;
    }

    const imageHtml = n.first_image_url
      ? `<img src="${HOST}/${n.first_image_url}" class="notification-item-img" alt="Item Image">`
      : `<div class="notification-item-img placeholder"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></div>`;

    /* Only render the image column when the notification is linked to a specific item */
    const hasItemContext = !!n.item_id;

    html = `<div class="notification-item ${isUnread ? 'unread' : 'read'} ${hasItemContext ? 'has-item' : ''}" data-id="${n.notification_id}" ${hasItemContext ? `onclick="openItemDetails('${n.item_id}')"` : ''}>
        ${hasItemContext ? `<div class="notification-image-container">${imageHtml}</div>` : ''}
        <div class="notification-content-wrapper">
          <div class="notification-header">
            <h3 class="notification-title">${n.title}</h3>
            <span class="notification-time">${n.created_at}</span>
          </div>
          <p class="notification-text">${contentReplaced}</p>
          ${actionsHtml}
        </div>
        ${isUnread ? '<div class="notification-dot"></div>' : ''}
      </div>`;
  });

  container.innerHTML = html;
}

