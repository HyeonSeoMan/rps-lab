import type { Choice } from "@/lib/rps";
import { BUTTON_ORDER, CHOICE_EMOJI, CHOICE_LABEL } from "./hands";
import styles from "./game.module.css";

export default function ManualPanel({ onPlay }: { onPlay: (choice: Choice) => void }) {
  return (
    <div className={styles.choices} role="group" aria-label="손 모양 선택">
      {BUTTON_ORDER.map((choice) => (
        <button key={choice} type="button" className={styles.choice} onClick={() => onPlay(choice)}>
          <span aria-hidden="true" className={styles.emoji}>
            {CHOICE_EMOJI[choice]}
          </span>
          {CHOICE_LABEL[choice]}
        </button>
      ))}
    </div>
  );
}
