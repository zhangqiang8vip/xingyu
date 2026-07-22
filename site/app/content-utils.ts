export type PageSearchParams = Promise<Record<string, string | string[] | undefined>>;

const longDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

const monthDayFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
});

/** Reuse formatters: constructing Intl.DateTimeFormat repeatedly is relatively expensive. */
export function formatLongDate(value: string | null | undefined, fallback = "") {
  return value ? longDateFormatter.format(new Date(value)) : fallback;
}

export function formatShortDate(value: string | null | undefined, fallback = "") {
  return value ? shortDateFormatter.format(new Date(value)) : fallback;
}

export function formatMonthDay(value: string | null | undefined, fallback = "—") {
  return value ? monthDayFormatter.format(new Date(value)) : fallback;
}

export function estimateReadingMinutes(markdown: string) {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~\[\]()!-]/g, " ")
    .replace(/\s+/g, "");
  return Math.max(1, Math.ceil(text.length / 350));
}

export function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}
