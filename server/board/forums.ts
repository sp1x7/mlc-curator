// The fixed forum structure of the board download area, transcribed from the
// board once.
//
// The snapshot maps every thread through the forum id the list page hands it,
// which keeps the run at one request per forum and leaves the tree walk out.
//
// The category rows (255, 299, ...) are fetched as well: they hold their own
// threads and one request each.

export type Forum = { id: number; name: string };

export type Category = { id: number; name: string; forums: Forum[] };

export const CATEGORIES: Category[] = [
  {
    id: 255,
    name: "Filme",
    forums: [
      { id: 253, name: "DVD/SD" },
      { id: 311, name: "HD/3D" },
      { id: 467, name: "720p" },
      { id: 468, name: "1080p" },
      { id: 481, name: "2160p" },
      { id: 313, name: "Complete Blu-Ray / DVD" },
      { id: 312, name: "3D" },
      { id: 301, name: "Collection" },
      { id: 310, name: "Dokumentationen" },
      { id: 351, name: "nicht Deutsch" },
    ],
  },
  {
    id: 299,
    name: "Serien",
    forums: [
      { id: 439, name: "Folgen" },
      { id: 440, name: "Staffeln" },
      { id: 508, name: "nicht Deutsch" },
    ],
  },
  {
    id: 277,
    name: "Spiele",
    forums: [
      { id: 340, name: "Action, Shooter & Survival" },
      { id: 339, name: "Sport, Simulation, Strategie & Sandbox" },
      { id: 342, name: "Adventures & Rollenspiele" },
      { id: 513, name: "VR Games" },
      { id: 341, name: "Konsole" },
      { id: 474, name: "Mac & Linux" },
      { id: 442, name: "Cracks, Patches & DLC" },
    ],
  },
  {
    id: 260,
    name: "Audio",
    forums: [
      { id: 325, name: "Musik" },
      { id: 441, name: "Charts" },
      { id: 330, name: "Original Sound Track (OST)" },
      { id: 451, name: "Lossless Musik" },
      { id: 500, name: "Hörbuch/Hörspiel" },
      { id: 337, name: "Sonstiges" },
      { id: 449, name: "Producing - Samples, Midi's, etc." },
      { id: 450, name: "Producing - VST/DAW" },
    ],
  },
  {
    id: 263,
    name: "Apps",
    forums: [
      { id: 343, name: "Windows" },
      { id: 345, name: "OS X (Apple)" },
      { id: 344, name: "Linux" },
      { id: 346, name: "Mobile, Navi & KFZ" },
    ],
  },
  {
    id: 296,
    name: "XXX",
    forums: [
      { id: 318, name: "XXX - Filme" },
      { id: 319, name: "XXX - HD/3D Filme" },
      { id: 321, name: "XXX - Clips" },
      { id: 323, name: "XXX - Deutsch" },
      { id: 324, name: "XXX - Sonstiges" },
    ],
  },
  {
    id: 349,
    name: "Sonstiges",
    forums: [
      { id: 350, name: "E-Book / PDF" },
      { id: 503, name: "Video-Tutorials" },
    ],
  },
  {
    id: 361,
    name: "FTP-Downloads",
    forums: [{ id: 473, name: "Leech-Str0s" }],
  },
];

/** Every forum id in board order: category, its forums, next category. */
export function allForumIds(): number[] {
  const ids: number[] = [];
  for (const category of CATEGORIES) {
    ids.push(category.id);
    for (const forum of category.forums) ids.push(forum.id);
  }
  return ids;
}

interface Place {
  category: string;
  subcategory: string | null;
}

// One lookup row per id: a category id carries its name with a null
// subcategory, a forum id carries both names.
const BY_FORUM = new Map<number, Place>();
for (const category of CATEGORIES) {
  BY_FORUM.set(category.id, { category: category.name, subcategory: null });
  for (const forum of category.forums)
    BY_FORUM.set(forum.id, { category: category.name, subcategory: forum.name });
}

/** Category name of a forum id, null for an id off the list. */
export function categoryOf(forumId: number): string | null {
  return BY_FORUM.get(forumId)?.category ?? null;
}

/** Forum name of a forum id, null for a category id and for an id off the
    list. */
export function subcategoryOf(forumId: number): string | null {
  return BY_FORUM.get(forumId)?.subcategory ?? null;
}

/** Forum ids whose threads can name a movie or a series. */
export function linksTitles(forumId: number): boolean {
  const category = categoryOf(forumId);
  return category === "Filme" || category === "Serien";
}
