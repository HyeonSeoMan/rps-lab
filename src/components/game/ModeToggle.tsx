import styles from "./game.module.css";

type Props = { mode: "manual" | "auto"; disabled: boolean; onChange: (mode: "manual" | "auto") => void };

export default function ModeToggle({ mode, disabled, onChange }: Props) {
  return (
    <div className={styles.seg} role="group" aria-label="대결 모드">
      <button type="button" aria-pressed={mode === "manual"} disabled={disabled} onClick={() => onChange("manual")}>
        직접 대결
      </button>
      <button type="button" aria-pressed={mode === "auto"} disabled={disabled} onClick={() => onChange("auto")}>
        자동 대결
      </button>
    </div>
  );
}
