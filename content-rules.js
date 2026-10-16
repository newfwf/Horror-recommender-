export const CONTENT_CATEGORIES = [
  {
    id: "extreme-gore",
    label: "Extreme gore",
    description: "Explicit, intense depictions of severe bodily injury or mutilation; blood or ordinary violence alone does not qualify.",
    examples: "close-up dismemberment or exposed organs."
  },
  {
    id: "torture",
    label: "Torture",
    description: "Deliberate infliction of severe pain or suffering, including attempts; ordinary injury or violence alone does not qualify.",
    examples: "a captive deliberately beaten or burned for suffering."
  },
  {
    id: "sexual-violence",
    label: "Sexual violence",
    description: "Depicted or credibly threatened non-consensual sexual acts, assault, or coercion; nudity and consensual sex alone do not qualify.",
    examples: "rape, attempted sexual assault, or a credible threat of either."
  },
  {
    id: "animal-harm",
    label: "Animal harm",
    description: "Depicted or credibly threatened injury or death to a non-human animal; an animal's presence or peril alone does not qualify.",
    examples: "an animal deliberately injured or killed on screen."
  },
  {
    id: "child-endangerment",
    label: "Child endangerment",
    description: "A person under 18 is harmed or placed in serious danger; an adult in danger or a child merely appearing does not qualify.",
    examples: "a child threatened, abducted, or seriously injured."
  },
  {
    id: "self-harm-suicide",
    label: "Self-harm or suicide",
    description: "Deliberate self-injury, suicide attempts, or suicide; unrelated distress or accidental injury does not qualify.",
    examples: "a suicide attempt or deliberate self-injury."
  },
  {
    id: "body-horror",
    label: "Body horror",
    description: "Disturbing bodily transformation, mutilation, invasion, or violation; ordinary non-graphic injury alone does not qualify.",
    examples: "grotesque transformation, invasive bodily violation, or mutation."
  },
  {
    id: "disturbing-imagery",
    label: "Disturbing imagery",
    description: "Specifically documented grotesque or traumatic images not adequately described by another category; not a general measure of scariness.",
    examples: "a documented graphic corpse image or other explicitly described traumatic image."
  },
  {
    id: "supernatural",
    label: "Supernatural",
    description: "Horror involving paranormal or supernatural forces.",
    examples: "ghosts, curses, or demonic activity."
  },
  {
    id: "slasher",
    label: "Slasher",
    description: "Horror centered on a killer stalking or attacking victims.",
    examples: "a masked killer pursuing a group of people."
  },
  {
    id: "graphic-violence",
    label: "Graphic violence",
    description: "Explicit depictions of physical violence or injury.",
    examples: "visibly detailed violent injuries."
  },
  {
    id: "extremely-disturbing",
    label: "Extremely disturbing",
    description: "Content specifically tagged as extremely disturbing in the supplied movie data.",
    examples: "material identified by the source tag as extremely disturbing."
  },
  {
    id: "found-footage",
    label: "Found footage",
    description: "Horror presented as recovered or recorded footage.",
    examples: "events shown through a character's camera recordings."
  },
  {
    id: "psychological",
    label: "Psychological",
    description: "Horror primarily using psychological themes or distress.",
    examples: "paranoia, obsession, or psychological manipulation."
  },
  {
    id: "jump-scares",
    label: "Jump scares",
    description: "Sudden startling events used to frighten the viewer.",
    examples: "an abrupt scare paired with a sudden sound or image."
  }
];

export const CONTENT_STATES = [
  "present",
  "assessed-absent",
  "unknown",
  "unassessed"
];

const categoryIds = new Set(
  CONTENT_CATEGORIES.map(category => category.id)
);

const stateSet = new Set(CONTENT_STATES);

export class ContentFilterConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ContentFilterConfigurationError";
  }
}

export function validateExcludedCategories(categories) {
  if (!Array.isArray(categories)) {
    throw new ContentFilterConfigurationError(
      "Content exclusions must be provided as a list of category IDs."
    );
  }

  const seen = new Set();

  for (const category of categories) {
    if (typeof category !== "string" || !categoryIds.has(category)) {
      throw new ContentFilterConfigurationError(
        `Invalid content exclusion category: ${String(category)}.`
      );
    }

    if (seen.has(category)) {
      throw new ContentFilterConfigurationError(
        `Duplicate content exclusion category: ${category}.`
      );
    }

    seen.add(category);
  }

  return [...categories];
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidEvidenceUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const isExampleDomain = /(^|\.)example\.(com|org|net)$/.test(host);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      host.includes(".") &&
      !isExampleDomain &&
      !host.endsWith(".example") &&
      !host.endsWith(".invalid") &&
      !host.endsWith(".test") &&
      host !== "localhost"
    );
  } catch {
    return false;
  }
}

function isValidReviewDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value &&
    value <= new Date().toISOString().slice(0, 10)
  );
}

function validEvidenceEntry(entry, research) {
  if (
    !isRecord(entry) ||
    !isValidEvidenceUrl(entry.url) ||
    typeof entry.note !== "string" ||
    entry.note.trim().length < 8 ||
    entry.note.trim().length > 500
  ) {
    return false;
  }

  if (entry.researchEvidenceId == null) {
    return true;
  }

  if (typeof entry.researchEvidenceId !== "string") {
    return false;
  }

  let current = research?.evidence;

  for (const key of entry.researchEvidenceId.split(".")) {
    if (!isRecord(current) || !Object.hasOwn(current, key)) {
      return false;
    }

    current = current[key];
  }

  return isRecord(current) && typeof current.citation === "string";
}

function validateProvidedTagStates(movie) {
  if (movie.research?.contentTagSource !== "user-provided table") {
    return [];
  }

  const groups = [
    movie.research.contentTags,
    movie.research.unknownContentTags,
    movie.research.absentContentTags
  ];
  const seen = new Set();
  const errors = [];

  for (const tags of groups) {
    if (!Array.isArray(tags)) {
      return [{
        category: null,
        message: "User-provided content tag groups must be lists."
      }];
    }

    for (const category of tags) {
      if (!categoryIds.has(category) || seen.has(category)) {
        errors.push({
          category: categoryIds.has(category) ? category : null,
          message: `Invalid or conflicting user-provided content tag "${String(category)}".`
        });
      }

      seen.add(category);
    }
  }

  return errors;
}

export function validateContentMetadata(movie) {
  const errors = [];

  if (!isRecord(movie)) {
    return [{ category: null, message: "Movie record is not an object." }];
  }

  errors.push(...validateProvidedTagStates(movie));

  if (!Object.hasOwn(movie, "content")) {
    return errors;
  }

  if (!isRecord(movie.content)) {
    return [{
      category: null,
      message: "Content assessments must be an object."
    }];
  }

  for (const [category, assessment] of Object.entries(movie.content)) {
    if (!categoryIds.has(category)) {
      errors.push({
        category: null,
        message: `Unknown content category "${category}".`
      });
      continue;
    }

    if (
      !isRecord(assessment) ||
      !stateSet.has(assessment.state)
    ) {
      errors.push({
        category,
        message: `Invalid assessment or state for "${category}".`
      });
      continue;
    }

    if (assessment.state === "unknown") {
      if (
        typeof assessment.note !== "string" ||
        assessment.note.trim().length < 8
      ) {
        errors.push({
          category,
          message: `Unknown assessment for "${category}" requires an uncertainty note.`
        });
      }

      continue;
    }

    if (assessment.state === "unassessed") {
      continue;
    }

    if (
      !Array.isArray(assessment.evidence) ||
      assessment.evidence.length === 0 ||
      assessment.evidence.some(
        entry => !validEvidenceEntry(entry, movie.research)
      )
    ) {
      errors.push({
        category,
        message: `Assessed state for "${category}" requires valid evidence with a URL and relevance note.`
      });
    }

    if (
      typeof assessment.reviewedBy !== "string" ||
      !/^[a-z0-9][a-z0-9._-]{1,63}$/i.test(assessment.reviewedBy)
    ) {
      errors.push({
        category,
        message: `Assessed state for "${category}" requires a reviewer identifier.`
      });
    }

    if (!isValidReviewDate(assessment.reviewedAt)) {
      errors.push({
        category,
        message: `Assessed state for "${category}" requires a valid, non-future YYYY-MM-DD review date.`
      });
    }
  }

  return errors;
}

export function contentState(movie, category) {
  if (!categoryIds.has(category)) {
    throw new ContentFilterConfigurationError(
      `Invalid content category: ${String(category)}.`
    );
  }

  const errors = validateContentMetadata(movie);

  if (errors.some(error => error.category === null || error.category === category)) {
    return "unknown";
  }

  if (
    isRecord(movie.content) &&
    Object.hasOwn(movie.content, category)
  ) {
    return movie.content[category].state;
  }

  if (movie.research?.contentTagSource === "user-provided table") {
    if (movie.research.contentTags.includes(category)) {
      return "present";
    }

    if (movie.research.unknownContentTags.includes(category)) {
      return "unassessed";
    }

    if (movie.research.absentContentTags.includes(category)) {
      return "assessed-absent";
    }

    return "unassessed";
  }

  return "unassessed";
}

export function passesContentExclusions(
  movie,
  categories,
  { excludeUnknown = true } = {}
) {
  const excludedCategories = validateExcludedCategories(categories);

  if (typeof excludeUnknown !== "boolean") {
    throw new ContentFilterConfigurationError(
      "The unknown-content preference must be a boolean."
    );
  }

  return excludedCategories.every(category => {
    const hasProvidedTagStates =
      movie?.research?.contentTagSource === "user-provided table";

    if (
      (!isRecord(movie?.content) || !Object.hasOwn(movie.content, category)) &&
      !hasProvidedTagStates
    ) {
      return false;
    }

    const errors = validateContentMetadata(movie);

    if (errors.some(error =>
      error.category === null || error.category === category
    )) {
      return false;
    }

    const state = contentState(movie, category);

    if (state === "present") {
      return false;
    }

    if (state === "assessed-absent") {
      return true;
    }

    if (state === "unknown" || state === "unassessed") {
      return !excludeUnknown;
    }

    return false;
  });
}
