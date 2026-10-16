"use strict";

import {
  CONTENT_CATEGORIES,
  ContentFilterConfigurationError,
  passesContentExclusions,
  validateContentMetadata,
  validateExcludedCategories
} from "./content-rules.js";

// ----------------------------------------
// MOVIE DATABASE
// ----------------------------------------

const recommendButton = document.querySelector("#recommend-button");
const databaseStatus = document.querySelector("#database-status");
const contentDataStatus = document.querySelector("#content-data-status");
const contentPreferenceStatus = document.querySelector("#content-preference-status");
const genreSelect = document.querySelector("#subgenre");
const contentCategoriesElement = document.querySelector("#content-categories");
const excludeUnknownContentCheckbox = document.querySelector("#exclude-unknown-content");
const unknownContentNotice = document.querySelector("#unknown-content-notice");

async function loadMovies() {
  try {
    const response = await fetch("./movies.json");

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}.`);
    }

    const data = await response.json();
    const ids = new Set();
    const contentErrors = [];

    if (
      !Array.isArray(data) ||
      data.length === 0 ||
      data.some(movie => {
        if (
          !movie ||
          !Number.isInteger(movie.id) ||
          typeof movie.title !== "string" ||
          !movie.title.trim() ||
          !Array.isArray(movie.subgenres) ||
          !Array.isArray(movie.moods) ||
          !["year", "runtime", "scareLevel", "goreLevel"].every(
            field => movie[field] === null || Number.isFinite(movie[field])
          ) ||
          ![true, false, null].includes(movie.requiresSubtitles) ||
          ids.has(movie.id)
        ) {
          return true;
        }

        ids.add(movie.id);
        return false;
      })
    ) {
      throw new Error("The file does not contain valid movie records.");
    }

    data.forEach(movie => {
      const errors = validateContentMetadata(movie);

      if (errors.length > 0) {
        contentErrors.push(
          ...errors.map(error =>
            `${movie.title}${error.category ? ` (${error.category})` : ""}: ${error.message}`
          )
        );
      }
    });

    const genres = [
      ...new Set(
        data.flatMap(movie =>
          movie.subgenres.filter(
            genre => typeof genre === "string" && genre.trim()
          )
        )
      )
    ]
      .sort((a, b) => a.localeCompare(b));

    genreSelect.replaceChildren(
      ...genres.map(genre => {
        const option = document.createElement("option");
        option.value = genre;
        option.textContent = formatPreference(genre);
        return option;
      })
    );

    if (genres.includes("supernatural-horror")) {
      genreSelect.value = "supernatural-horror";
    }

    if (contentErrors.length > 0) {
      contentDataStatus.textContent =
        `Content data needs review. Invalid assessments fail closed when a content filter is selected: ` +
        contentErrors.join(" ");
      contentDataStatus.hidden = false;
    }

    recommendButton.disabled = false;
    return data;
  } catch (error) {
    console.error("Could not load movies.json:", error);
    databaseStatus.textContent =
      `Could not load movies.json: ${error.message} ` +
      "Run this page through a local web server (such as VS Code Live Server).";
    databaseStatus.hidden = false;
    throw error;
  }
}

const movies = await loadMovies();

const STORAGE_KEY = "horrorRecommenderChoicesV2";
const CONTENT_PREFERENCES_KEY = "horrorContentExclusionsV1";
const VALID_CHOICES = ["liked", "disliked", "watched"];

// ----------------------------------------
// DOM ELEMENTS
// ----------------------------------------

const moodSelect = document.querySelector("#mood");
const scareSlider = document.querySelector("#scare-level");
const goreSlider = document.querySelector("#gore-level");
const runtimeSlider = document.querySelector("#max-runtime");
const subtitlesCheckbox = document.querySelector("#subtitles-ok");

const resultsSection = document.querySelector("#results");
const historyText = document.querySelector("#history-text");
const clearHistoryButton = document.querySelector("#clear-history");

const scareValue = document.querySelector("#scare-value");
const goreValue = document.querySelector("#gore-value");
const runtimeValue = document.querySelector("#runtime-value");

// ----------------------------------------
// SAVED CHOICES
// ----------------------------------------

let userChoices = loadChoices();
const initialContentPreferences = loadContentPreferences();
let selectedContentCategories = initialContentPreferences.categories;
let excludeUnknownContent = initialContentPreferences.excludeUnknown;
let lastPreferences = null;

excludeUnknownContentCheckbox.checked = excludeUnknownContent;
updateUnknownContentNotice();
renderContentControls();

function renderContentControls() {
  contentCategoriesElement.replaceChildren(
    ...CONTENT_CATEGORIES.map(category => {
      const label = document.createElement("label");
      label.className = "content-option";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "content-to-avoid";
      checkbox.value = category.id;
      checkbox.setAttribute(
        "aria-describedby",
        `content-description-${category.id}`
      );

      const text = document.createElement("span");
      text.className = "content-option-text";

      const name = document.createElement("strong");
      name.textContent = category.label;

      const description = document.createElement("small");
      description.id = `content-description-${category.id}`;
      description.textContent =
        `${category.description} Examples: ${category.examples}`;

      checkbox.checked = selectedContentCategories.includes(category.id);
      label.append(checkbox, text);
      text.append(name, description);

      checkbox.addEventListener("change", handleContentPreferenceChange);
      return label;
    })
  );
}

function loadContentPreferences() {
  try {
    const saved = localStorage.getItem(CONTENT_PREFERENCES_KEY);

    if (saved === null) {
      return { categories: [], excludeUnknown: true };
    }

    const parsed = JSON.parse(saved);

    if (Array.isArray(parsed)) {
      return {
        categories: validateExcludedCategories(parsed),
        excludeUnknown: true
      };
    }

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      !Object.hasOwn(parsed, "categories") ||
      !Object.hasOwn(parsed, "excludeUnknown") ||
      typeof parsed.excludeUnknown !== "boolean"
    ) {
      throw new ContentFilterConfigurationError(
        "Saved content exclusion preferences have an invalid format."
      );
    }

    return {
      categories: validateExcludedCategories(parsed.categories),
      excludeUnknown: parsed.excludeUnknown
    };
  } catch (error) {
    console.warn("Could not load content exclusions:", error);
    contentPreferenceStatus.textContent =
      "Saved content exclusions were invalid or unavailable. All content categories are selected as a safety fallback; review the selections before searching.";
    contentPreferenceStatus.hidden = false;
    return {
      categories: CONTENT_CATEGORIES.map(category => category.id),
      excludeUnknown: true
    };
  }
}

function saveContentPreferences() {
  try {
    localStorage.setItem(
      CONTENT_PREFERENCES_KEY,
      JSON.stringify({
        categories: selectedContentCategories,
        excludeUnknown: excludeUnknownContent
      })
    );
    contentPreferenceStatus.textContent = "";
    contentPreferenceStatus.hidden = true;
  } catch (error) {
    console.warn("Could not save content exclusions:", error);
    contentPreferenceStatus.textContent =
      "Could not save content exclusions in this browser. Your selections apply for this page only.";
    contentPreferenceStatus.hidden = false;
  }
}

function handleContentPreferenceChange() {
  selectedContentCategories = [
    ...contentCategoriesElement.querySelectorAll(
      'input[name="content-to-avoid"]:checked'
    )
  ].map(checkbox => checkbox.value);

  try {
    validateExcludedCategories(selectedContentCategories);
    saveContentPreferences();

    if (lastPreferences) {
      renderRecommendations(lastPreferences);
    }
  } catch (error) {
    if (!(error instanceof ContentFilterConfigurationError)) {
      throw error;
    }

    contentPreferenceStatus.textContent = error.message;
    contentPreferenceStatus.hidden = false;
  }
}

function updateUnknownContentNotice() {
  unknownContentNotice.hidden = excludeUnknownContent;
}

excludeUnknownContentCheckbox.addEventListener("change", () => {
  excludeUnknownContent = excludeUnknownContentCheckbox.checked;
  updateUnknownContentNotice();
  saveContentPreferences();

  if (lastPreferences) {
    renderRecommendations(lastPreferences);
  }
});

function loadChoices() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      return {};
    }

    const parsed = JSON.parse(saved);

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return {};
    }

    const validChoices = {};

    for (const movie of movies) {
      const choice = parsed[movie.id];

      if (VALID_CHOICES.includes(choice)) {
        validChoices[movie.id] = choice;
      }
    }

    return validChoices;
  } catch (error) {
    console.warn("Could not load saved choices:", error);
    return {};
  }
}

function saveChoices() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(userChoices)
    );
  } catch (error) {
    console.warn("Could not save choices:", error);
  }

  showHistory();
}

// ----------------------------------------
// HELPER FUNCTIONS
// ----------------------------------------

function formatPreference(value) {
  return value
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// ----------------------------------------
// MOVIE SCORING
// ----------------------------------------

function scoreMovie(movie, preferences) {
  let score = 0;
  const reasons = [];

  if (movie.subgenres.includes(preferences.subgenre)) {
    score += 6;

    reasons.push(
      `Matches your ${formatPreference(preferences.subgenre)} preference.`
    );
  }

  if (movie.moods.includes(preferences.mood)) {
    score += 5;

    reasons.push(
      `Fits your ${formatPreference(preferences.mood)} mood.`
    );
  }

  if (movie.scareLevel !== null) {
    const scareDifference = Math.abs(
      movie.scareLevel - preferences.scareLevel
    );

    if (scareDifference === 0) {
      score += 4;
      reasons.push("Its scare level matches your target exactly.");
    } else if (scareDifference === 1) {
      score += 3;
      reasons.push("Its scare level is very close to your target.");
    } else if (scareDifference === 2) {
      score += 2;
      reasons.push("Its scare level is reasonably close to your target.");
    } else if (scareDifference <= 3) {
      score += 1;
    }
  }

  if (userChoices[movie.id] === "liked") {
    score += 1;
    reasons.push("You previously liked this movie.");
  }

  const matchesGenre = movie.subgenres.includes(
    preferences.subgenre
  );

  const matchesMood = movie.moods.includes(
    preferences.mood
  );

  if (!matchesGenre && !matchesMood) {
    reasons.push(
      "Meets your viewing limits, but does not match your selected genre or mood."
    );
  } else if (!matchesGenre) {
    reasons.push(
      "Matches your mood, but not your selected subgenre."
    );
  } else if (!matchesMood) {
    reasons.push(
      "Matches your subgenre, but not your selected mood."
    );
  }

  return {
    movie,
    score,
    reasons
  };
}

// ----------------------------------------
// GET RECOMMENDATIONS
// ----------------------------------------

function getEligibleMovies(
  preferences,
  excludedContent = selectedContentCategories,
  excludeUnknown = excludeUnknownContent
) {
  const contentCategories = validateExcludedCategories(excludedContent);

  return movies.filter(movie => {
    if (
      movie.goreLevel === null ||
      movie.goreLevel > preferences.maxGore
    ) {
      return false;
    }

    if (
      movie.runtime === null ||
      movie.runtime > preferences.maxRuntime
    ) {
      return false;
    }

    if (
      movie.requiresSubtitles &&
      !preferences.subtitlesOk
    ) {
      return false;
    }

    if (
      userChoices[movie.id] === "watched" ||
      userChoices[movie.id] === "disliked"
    ) {
      return false;
    }

    return passesContentExclusions(movie, contentCategories, {
      excludeUnknown
    });
  });
}

function getRecommendations(preferences) {
  return getEligibleMovies(preferences)
    .map(movie => scoreMovie(movie, preferences))
    .sort((a, b) => {
      return (
        b.score - a.score ||
        a.movie.title.localeCompare(b.movie.title)
      );
    })
    .slice(0, 3);
}

// ----------------------------------------
// RENDER RECOMMENDATIONS
// ----------------------------------------

function renderResults(recommendations, preferences) {
  resultsSection.replaceChildren();
  resultsSection.classList.remove("hidden");

  const heading = document.createElement("h2");
  heading.className = "results-heading";
  heading.textContent = "Your nightmare lineup";

  resultsSection.appendChild(heading);

  const contentNotice = document.createElement("p");
  contentNotice.className = "content-notice";
  contentNotice.textContent = "Content information may be incomplete.";
  resultsSection.appendChild(contentNotice);

  if (recommendations.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";

    const title = document.createElement("h2");
    title.textContent = "No matching movies found.";

    const message = document.createElement("p");
    const hasContentExclusions = selectedContentCategories.length > 0;
    const moviesWithoutContentExclusions = hasContentExclusions
      ? getEligibleMovies(preferences, [])
      : [];

    message.textContent = hasContentExclusions &&
      moviesWithoutContentExclusions.length > 0
      ? excludeUnknownContent
        ? "No movies currently pass your content exclusions. Movies marked as containing the selected content, as well as movies with unknown or unassessed content status, are excluded. You can review your selections or check back after more films have been assessed."
        : "No movies currently pass your content exclusions. Movies marked as containing the selected content are excluded. You can review your selections or check back after more films have been assessed."
      : "No movies currently meet all viewing limits and saved choices. Selected content exclusions may further narrow the results. You can change your search preferences or clear saved choices.";

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.textContent = "Clear saved choices";
    resetButton.addEventListener("click", clearChoices);

    emptyState.append(title, message, resetButton);
    resultsSection.appendChild(emptyState);

    return;
  }

  const intro = document.createElement("p");
  intro.className = "results-intro";
  intro.textContent =
    `Here are your ${recommendations.length} best matches, ranked by preference score.`;

  resultsSection.appendChild(intro);

  recommendations.forEach(({ movie, score, reasons }) => {
    const card = document.createElement("article");
    card.className = "movie-card";

    const scoreBadge = document.createElement("span");
    scoreBadge.className = "match-score";
    scoreBadge.textContent = `Match score: ${score}`;

    const title = document.createElement("h2");
    title.textContent =
      `${movie.title} (${movie.year ?? "year unknown"})`;

    const meta = document.createElement("p");
    meta.className = "meta";
    meta.textContent =
      `${movie.runtime ?? "Runtime unknown"} minutes · ` +
      `Scare ${movie.scareLevel ?? "unknown"}/10 · ` +
      `Gore ${movie.goreLevel ?? "unknown"}/10`;

    const summary = document.createElement("p");
    summary.className = "summary";
    summary.textContent = movie.summary;

    const reasonList = document.createElement("ul");
    reasonList.className = "reasons";

    reasons.forEach(reason => {
      const item = document.createElement("li");
      item.textContent = reason;
      reasonList.appendChild(item);
    });

    const actions = document.createElement("div");
    actions.className = "movie-actions";

    const currentChoice = userChoices[movie.id] || "";

    const options = [
      { value: "liked", label: "👍 Liked" },
      { value: "disliked", label: "👎 Disliked" },
      { value: "watched", label: "👁 Watched" }
    ];

    options.forEach(({ value, label }) => {
      const button = document.createElement("button");

      button.type = "button";
      button.textContent =
        currentChoice === value
          ? `${label} ✓`
          : label;

      button.dataset.id = String(movie.id);
      button.dataset.choice = value;

      button.setAttribute(
        "aria-pressed",
        String(currentChoice === value)
      );

      if (currentChoice === value) {
        button.classList.add(value);
      }

      actions.appendChild(button);
    });

    card.append(
      scoreBadge,
      title,
      meta,
      summary,
      reasonList,
      actions
    );

    resultsSection.appendChild(card);
  });
}

// ----------------------------------------
// SAVED CHOICES DISPLAY
// ----------------------------------------

function showHistory() {
  historyText.replaceChildren();

  const groups = [
    { key: "liked", label: "Liked" },
    { key: "disliked", label: "Disliked" },
    { key: "watched", label: "Watched" }
  ];

  const hasChoices = Object.keys(userChoices).length > 0;

  if (!hasChoices) {
    historyText.textContent = "No movies rated yet.";
    return;
  }

  groups.forEach(({ key, label }) => {
    const matchingMovies = movies.filter(
      movie => userChoices[movie.id] === key
    );

    const paragraph = document.createElement("p");
    const heading = document.createElement("strong");

    heading.textContent = `${label}: `;
    paragraph.appendChild(heading);

    paragraph.appendChild(
      document.createTextNode(
        matchingMovies.length > 0
          ? matchingMovies.map(movie => movie.title).join(", ")
          : "None"
      )
    );

    historyText.appendChild(paragraph);
  });
}

// ----------------------------------------
// GET CURRENT PREFERENCES
// ----------------------------------------

function getPreferences() {
  return {
    subgenre: genreSelect.value,
    mood: moodSelect.value,
    scareLevel: Number(scareSlider.value),
    maxGore: Number(goreSlider.value),
    maxRuntime: Number(runtimeSlider.value),
    subtitlesOk: subtitlesCheckbox.checked
  };
}

// ----------------------------------------
// SLIDER LABELS
// ----------------------------------------

scareSlider.addEventListener("input", () => {
  scareValue.textContent = scareSlider.value;
});

goreSlider.addEventListener("input", () => {
  goreValue.textContent = goreSlider.value;
});

runtimeSlider.addEventListener("input", () => {
  runtimeValue.textContent = runtimeSlider.value;
});

// ----------------------------------------
// RECOMMENDATION BUTTON
// ----------------------------------------

recommendButton.addEventListener("click", () => {
  lastPreferences = getPreferences();

  renderRecommendations(lastPreferences);
});

function renderRecommendations(preferences) {
  try {
    validateExcludedCategories(selectedContentCategories);
    contentPreferenceStatus.textContent = "";
    contentPreferenceStatus.hidden = true;
    renderResults(getRecommendations(preferences), preferences);
  } catch (error) {
    if (!(error instanceof ContentFilterConfigurationError)) {
      throw error;
    }

    contentPreferenceStatus.textContent = error.message;
    contentPreferenceStatus.hidden = false;
    resultsSection.replaceChildren();
    resultsSection.classList.add("hidden");
  }
}

// ----------------------------------------
// MOVIE ACTIONS
// ----------------------------------------

resultsSection.addEventListener("click", event => {
  const button = event.target.closest(
    "button[data-id][data-choice]"
  );

  if (!button || !resultsSection.contains(button)) {
    return;
  }

  const movieId = Number(button.dataset.id);
  const choice = button.dataset.choice;

  const movieExists = movies.some(
    movie => movie.id === movieId
  );

  if (!movieExists || !VALID_CHOICES.includes(choice)) {
    return;
  }

  if (userChoices[movieId] === choice) {
    delete userChoices[movieId];
  } else {
    userChoices[movieId] = choice;
  }

  saveChoices();

  if (lastPreferences) {
    renderRecommendations(lastPreferences);
  }
});

// ----------------------------------------
// CLEAR SAVED CHOICES
// ----------------------------------------

function clearChoices() {
  userChoices = {};

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn("Could not clear saved choices:", error);
  }

  showHistory();

  if (lastPreferences) {
    renderRecommendations(lastPreferences);
  }
}

clearHistoryButton.addEventListener("click", clearChoices);

// ----------------------------------------
// INITIALIZE
// ----------------------------------------

showHistory();