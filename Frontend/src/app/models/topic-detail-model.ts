import { LocalizedString } from "./localized-string-model";
import { TopicSummary } from "./topic-summary-model";

export interface TopicDetail extends TopicSummary {
  verses: string[];
}
