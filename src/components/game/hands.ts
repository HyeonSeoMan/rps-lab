import type { Choice, Outcome } from "@/lib/rps";
import { CHOICE_LABEL, OUTCOME_LABEL } from "@/lib/announce";

export { CHOICE_LABEL, OUTCOME_LABEL };
export const CHOICE_EMOJI: Record<Choice, string> = { scissors: "✌️", rock: "✊", paper: "✋" };
export const BUTTON_ORDER: readonly Choice[] = ["scissors", "rock", "paper"];
export type { Outcome };
