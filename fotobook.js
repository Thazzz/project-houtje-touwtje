const supabaseUrl = "https://gfhnjiyslyualbfbvzmb.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmaG5qaXlzbHl1YWxiZmJ2em1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMTgwOTQsImV4cCI6MjA4ODc5NDA5NH0.fOIy6UCpEuYWVBcBpGnr64s8Ua3qjEzRv-WLXJKAfgw";

const ACCESS_CODE = "Chris10!";
const ACCESS_STORAGE_KEY = "afterparty-pop-access";
const PARTY_BUCKET = "party";
const PARTY_TABLE = "photos";
const PARTY_DATE_LABEL = "25 maart 2026";
const PARTY_TITLE = "Christie's Afterparty Pop";
const PARTY_INTRO = "Van binnenkomst tot laatste ronde, in het tempo waarin de foto's zijn binnengekomen.";
const TIME_ZONE = "Europe/Amsterdam";
const EMPTY_CAPTION = "Geen caption toegevoegd.";

const CHAPTER_RULES = [
  { startHour: 20, endHour: 21, title: "Binnenkomst", mood: "De eerste blikken, eerste drankjes en nog frisse energie." },
  { startHour: 21, endHour: 22, title: "Op gang", mood: "De avond komt los en de eerste verhalen beginnen te vliegen." },
  { startHour: 22, endHour: 23, title: "Warmgedraaid", mood: "De kamer leeft, de kleuren worden feller en de glimlachen losser." },
  { startHour: 23, endHour: 24, title: "Piek", mood: "Hier zit de avond vol in zijn ritme." },
  { startHour: 0, endHour: 1, title: "Nachtwerk", mood: "Licht waziger, nog steeds prachtig." },
  { startHour: 1, endHour: 4, title: "Laatste rondes", mood: "De zachte afterglow richting het einde van de nacht." }
];

const gateView = document.getElementById("gateView");
const bookView = document.getElementById("bookView");
const accessCodeInput = document.getElementById("accessCode");
const gateError = document.getElementById("gateError");
const chapterNav = document.getElementById("chapterNav");
const pageFrame = document.getElementById("pageFrame");
const pageStatus = document.getElementById("pageStatus");
const progressText = document.getElementById("progressText");
const brandSubtitle = document.getElementById("brandSubtitle");
const prevButton = document.getElementById("prevButton");
const nextButton = document.getElementById("nextButton");
const openBookButton = document.getElementById("openBookButton");

let photoItems = [];
let pages = [];
let activePageIndex = 0;
let supabaseClient = null;

if(openBookButton){
  openBookButton.addEventListener("click", function(){
    unlockBook(accessCodeInput.value.trim());
  });
}

if(accessCodeInput){
  accessCodeInput.addEventListener("keydown", function(event){
    if(event.key === "Enter"){
      event.preventDefault();
      unlockBook(accessCodeInput.value.trim());
    }
  });
}

if(prevButton){
  prevButton.addEventListener("click", function(){
    changePage(activePageIndex - 1);
  });
}

if(nextButton){
  nextButton.addEventListener("click", function(){
    changePage(activePageIndex + 1);
  });
}

document.addEventListener("keydown", function(event){
  if(bookView.classList.contains("hidden")){
    return;
  }

  if(event.key === "ArrowLeft"){
    changePage(activePageIndex - 1);
  }

  if(event.key === "ArrowRight" || event.key === " "){
    event.preventDefault();
    changePage(activePageIndex + 1);
  }
});

document.addEventListener("contextmenu", function(event){
  if(bookView.classList.contains("hidden")){
    return;
  }

  if(event.target.closest(".photo-frame")){
    event.preventDefault();
  }
});

window.addEventListener("dragstart", function(event){
  if(event.target.tagName === "IMG"){
    event.preventDefault();
  }
});

bootstrap();

async function bootstrap(){
  const hasAccess = localStorage.getItem(ACCESS_STORAGE_KEY) === "granted";

  if(hasAccess){
    revealBook();
    await loadBook();
    return;
  }

  if(accessCodeInput){
    accessCodeInput.focus();
  }
}

function unlockBook(code){
  if(code !== ACCESS_CODE){
    gateError.textContent = "Deze code klopt nog niet.";
    return;
  }

  localStorage.setItem(ACCESS_STORAGE_KEY, "granted");
  gateError.textContent = "";
  revealBook();
  loadBook();
}

function revealBook(){
  gateView.classList.add("hidden");
  bookView.classList.remove("hidden");
}

async function loadBook(){
  try{
    const client = getSupabaseClient();
    const results = await Promise.all([
      client.storage.from(PARTY_BUCKET).list("", {
        limit: 500,
        sortBy: { column: "name", order: "asc" }
      }),
      client.from(PARTY_TABLE).select("filename, caption")
    ]);

    const storageResult = results[0];
    const captionResult = results[1];

    if(storageResult.error){
      throw storageResult.error;
    }

    if(captionResult.error){
      throw captionResult.error;
    }

    photoItems = mergePhotoData(storageResult.data || [], captionResult.data || []);
    pages = buildPages(photoItems);
    renderChapterNav();
    changePage(0);
  }catch(error){
    pageFrame.innerHTML = '<div class="empty-state">Het fotoboek kon nu niet laden. Controleer de Supabase-verbinding en probeer het daarna opnieuw.</div>';
    pageStatus.textContent = "Laden mislukt";
    progressText.textContent = "- / -";
    console.error(error);
  }
}

function mergePhotoData(storageEntries, captionRows){
  const captionMap = new Map(
    captionRows.map(function(row){
      return [row.filename, row.caption || ""];
    })
  );

  return storageEntries
    .filter(function(entry){
      return entry.name && /\.(jpg|jpeg|png|webp)$/i.test(entry.name);
    })
    .map(function(entry){
      const publicUrl = getSupabaseClient().storage.from(PARTY_BUCKET).getPublicUrl(entry.name).data.publicUrl;
      const uploadedAt = entry.created_at || entry.updated_at || parseTimestampFromName(entry.name);
      return {
        filename: entry.name,
        url: publicUrl,
        caption: captionMap.get(entry.name) || "",
        uploadedAt: uploadedAt,
        chapter: assignChapter(uploadedAt)
      };
    })
    .sort(function(left, right){
      return new Date(left.uploadedAt) - new Date(right.uploadedAt);
    });
}

function assignChapter(timestamp){
  const date = timestamp ? new Date(timestamp) : null;
  const localHour = date && !Number.isNaN(date.getTime()) ? getLocalHour(date) : null;

  if(localHour !== null){
    const matchingRule = CHAPTER_RULES.find(function(rule){
      if(rule.startHour < rule.endHour){
        return localHour >= rule.startHour && localHour < rule.endHour;
      }

      return localHour >= rule.startHour || localHour < rule.endHour;
    });

    if(matchingRule){
      return {
        id: (matchingRule.startHour + "-" + matchingRule.endHour + "-" + matchingRule.title).toLowerCase().replace(/\s+/g, "-"),
        title: matchingRule.title,
        rangeLabel: formatRange(matchingRule.startHour, matchingRule.endHour),
        mood: matchingRule.mood
      };
    }
  }

  const fallbackHour = localHour === null ? 20 : localHour;
  const nextHour = (fallbackHour + 1) % 24;

  return {
    id: "uur-" + fallbackHour,
    title: "Later die nacht",
    rangeLabel: formatRange(fallbackHour, nextHour),
    mood: "Nog een moment uit dezelfde nacht."
  };
}

function buildPages(items){
  const grouped = groupByChapter(items);
  const result = [{ type: "cover" }];

  if(items.length === 0){
    result.push({ type: "empty" });
    return result;
  }

  grouped.forEach(function(group){
    result.push({
      type: "chapter",
      chapterId: group.chapter.id,
      chapterTitle: group.chapter.title,
      chapterRange: group.chapter.rangeLabel,
      chapterMood: group.chapter.mood,
      photoCount: group.photos.length
    });

    let index = 0;
    let rotation = 0;

    while(index < group.photos.length){
      const remaining = group.photos.length - index;
      const useFeature = remaining >= 3 && rotation % 3 === 0;
      const useDuo = remaining >= 2 && !useFeature;

      if(useFeature){
        result.push({
          type: "photos",
          layout: "feature",
          chapterId: group.chapter.id,
          chapterTitle: group.chapter.title,
          chapterRange: group.chapter.rangeLabel,
          photos: group.photos.slice(index, index + 3)
        });
        index += 3;
      }else if(useDuo){
        result.push({
          type: "photos",
          layout: "duo",
          chapterId: group.chapter.id,
          chapterTitle: group.chapter.title,
          chapterRange: group.chapter.rangeLabel,
          photos: group.photos.slice(index, index + 2)
        });
        index += 2;
      }else{
        result.push({
          type: "photos",
          layout: "solo",
          chapterId: group.chapter.id,
          chapterTitle: group.chapter.title,
          chapterRange: group.chapter.rangeLabel,
          photos: group.photos.slice(index, index + 1)
        });
        index += 1;
      }

      rotation += 1;
    }
  });

  result.push({ type: "end" });
  return result;
}

function groupByChapter(items){
  const groups = [];

  items.forEach(function(item){
    const lastGroup = groups[groups.length - 1];

    if(lastGroup && lastGroup.chapter.id === item.chapter.id){
      lastGroup.photos.push(item);
      return;
    }

    groups.push({
      chapter: item.chapter,
      photos: [item]
    });
  });

  return groups;
}

function renderChapterNav(){
  const chapterPages = pages.filter(function(page){
    return page.type === "chapter";
  });
  chapterNav.innerHTML = "";

  chapterPages.forEach(function(page){
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chapter-button";
    button.textContent = page.chapterTitle;
    button.dataset.chapterId = page.chapterId;
    button.addEventListener("click", function(){
      const targetIndex = pages.findIndex(function(candidate){
        return candidate.type === "chapter" && candidate.chapterId === page.chapterId;
      });
      if(targetIndex >= 0){
        changePage(targetIndex);
      }
    });
    chapterNav.appendChild(button);
  });
}

function changePage(nextIndex){
  if(nextIndex < 0 || nextIndex >= pages.length){
    return;
  }

  activePageIndex = nextIndex;
  renderPage(pages[activePageIndex], activePageIndex);
  updateUiState();
}

function renderPage(page, pageIndex){
  if(!page){
    return;
  }

  if(page.type === "cover"){
    pageFrame.innerHTML =
      '<article class="page page-cover">' +
        '<div class="cover-card">' +
          '<p class="cover-kicker">Fotoboek</p>' +
          '<h1 class="cover-title">' + escapeHtml(PARTY_TITLE) + '</h1>' +
          '<p class="cover-text">' + escapeHtml(PARTY_INTRO) + '</p>' +
          '<div class="cover-meta">' +
            '<span class="cover-pill">' + escapeHtml(PARTY_DATE_LABEL) + '</span>' +
            '<span class="cover-pill">' + photoItems.length + ' foto\'s</span>' +
            '<span class="cover-pill">Uploadvolgorde</span>' +
          '</div>' +
        '</div>' +
      '</article>';
    return;
  }

  if(page.type === "chapter"){
    pageFrame.innerHTML =
      '<article class="page page-chapter">' +
        '<div class="chapter-card">' +
          '<p class="chapter-kicker">Nieuw hoofdstuk</p>' +
          '<h2>' + escapeHtml(page.chapterTitle) + '</h2>' +
          '<div class="chapter-range">' + escapeHtml(page.chapterRange) + '</div>' +
          '<p>' + escapeHtml(page.chapterMood) + '</p>' +
          '<p>' + page.photoCount + ' foto\'s in dit tijdsblok.</p>' +
        '</div>' +
      '</article>';
    return;
  }

  if(page.type === "end"){
    pageFrame.innerHTML =
      '<article class="page page-end">' +
        '<div class="end-card">' +
          '<p class="chapter-kicker">Einde</p>' +
          '<h2>Afterglow</h2>' +
          '<p>Alles staat erin wat voor nu gekozen is. Later kunnen we de covertekst en de laatste polish nog aanscherpen.</p>' +
        '</div>' +
      '</article>';
    return;
  }

  if(page.type === "empty"){
    pageFrame.innerHTML = '<div class="empty-state">Er staan nog geen foto\'s klaar voor het boek.</div>';
    return;
  }

  pageFrame.innerHTML =
    '<article class="page layout-' + page.layout + '">' +
      '<div class="photo-grid">' + renderPhotoLayout(page) + '</div>' +
      '<div class="page-meta">' +
        '<div>' + escapeHtml(page.chapterTitle) + ' <span aria-hidden="true">·</span> ' + escapeHtml(page.chapterRange) + '</div>' +
        '<div class="page-count">Spread ' + (pageIndex + 1) + ' van ' + pages.length + '</div>' +
      '</div>' +
    '</article>';
}

function renderPhotoLayout(page){
  if(page.layout === "feature"){
    const lead = page.photos[0];
    const sideOne = page.photos[1];
    const sideTwo = page.photos[2];

    return (
      renderPhotoCard(lead) +
      '<div class="feature-side">' +
        renderPhotoCard(sideOne) +
        renderPhotoCard(sideTwo) +
      '</div>'
    );
  }

  return page.photos.map(function(photo){
    return renderPhotoCard(photo);
  }).join("");
}

function renderPhotoCard(photo){
  const caption = photo.caption || EMPTY_CAPTION;
  const captionClass = photo.caption ? "caption" : "caption is-empty";

  return (
    '<figure class="photo-card">' +
      '<div class="photo-frame">' +
        '<img src="' + escapeAttribute(photo.url) + '" alt="' + escapeAttribute(caption) + '" loading="lazy" referrerpolicy="no-referrer">' +
      '</div>' +
      '<figcaption class="' + captionClass + '">' + escapeHtml(caption) + '</figcaption>' +
    '</figure>'
  );
}

function updateUiState(){
  prevButton.disabled = activePageIndex === 0;
  nextButton.disabled = activePageIndex === pages.length - 1;
  progressText.textContent = (activePageIndex + 1) + " / " + pages.length;

  const activePage = pages[activePageIndex];
  pageStatus.textContent = describePage(activePage);
  brandSubtitle.textContent = photoItems.length > 0
    ? photoItems.length + " foto's in uploadvolgorde"
    : "Nog geen foto's in het boek";

  document.querySelectorAll(".chapter-button").forEach(function(button){
    const isActive = activePage.chapterId && button.dataset.chapterId === activePage.chapterId;
    button.classList.toggle("active", isActive);
  });
}

function describePage(page){
  if(!page){
    return "";
  }

  if(page.type === "cover"){
    return "Omslag";
  }

  if(page.type === "chapter"){
    return page.chapterTitle + " · " + page.chapterRange;
  }

  if(page.type === "photos"){
    return page.chapterTitle + " · " + page.photos.length + " foto" + (page.photos.length === 1 ? "" : "'s") + " op deze spread";
  }

  if(page.type === "end"){
    return "Afsluiting";
  }

  return "Fotoboek";
}

function getLocalHour(date){
  const parts = new Intl.DateTimeFormat("nl-NL", {
    hour: "2-digit",
    hour12: false,
    timeZone: TIME_ZONE
  }).formatToParts(date);

  const hourPart = parts.find(function(part){
    return part.type === "hour";
  });

  return hourPart ? Number(hourPart.value) : null;
}

function formatRange(startHour, endHour){
  return String(startHour).padStart(2, "0") + ":00-" + String(endHour % 24).padStart(2, "0") + ":00";
}

function parseTimestampFromName(name){
  const match = /^(\d{13})-/.exec(name);
  if(!match){
    return new Date().toISOString();
  }

  return new Date(Number(match[1])).toISOString();
}

function getSupabaseClient(){
  if(supabaseClient){
    return supabaseClient;
  }

  if(!window.supabase || typeof window.supabase.createClient !== "function"){
    throw new Error("Supabase library not available");
  }

  supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
  return supabaseClient;
}

function escapeHtml(value){
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value){
  return escapeHtml(value);
}
