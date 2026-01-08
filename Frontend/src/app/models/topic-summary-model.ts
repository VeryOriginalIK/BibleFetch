import { LocalizedString } from "./localized-string-model";

export interface TopicSummary {
  id: string;
  titles: LocalizedString;
  icon: string;
  category?: string;
  description?: LocalizedString;
  theme_color?: string;
  verseCount?: number;
}
