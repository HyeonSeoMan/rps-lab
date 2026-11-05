export type Choice = "rock" | "paper" | "scissors";
export type Outcome = "win" | "lose" | "draw";

export const CHOICES: readonly Choice[] = ["rock", "paper", "scissors"];

const BEATS: Record<Choice, Choice> = {
  scissors: "paper",
  rock: "scissors",
  paper: "rock",
};

/** 사용자 관점의 결과를 판정한다. */
export function judge(user: Choice, computer: Choice): Outcome {
  if (user === computer) return "draw";
  return BEATS[user] === computer ? "win" : "lose";
}

/** 주입된 난수 함수(0 이상 1 이하)로 컴퓨터의 선택을 정한다. */
export function pickComputerChoice(random: () => number): Choice {
  const index = Math.min(Math.floor(random() * CHOICES.length), CHOICES.length - 1);
  return CHOICES[index];
}
