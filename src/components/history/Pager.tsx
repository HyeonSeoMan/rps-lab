import styles from "./history.module.css";

type Props = { pageIndex: number; pageCount: number; hasNext: boolean; onPrev: () => void; onNext: () => void };

export default function Pager({ pageIndex, pageCount, hasNext, onPrev, onNext }: Props) {
  return (
    <nav className={styles.pager} aria-label="기록 페이지 이동">
      <button type="button" disabled={pageIndex === 0} onClick={onPrev}>
        이전
      </button>
      <span>
        {pageIndex + 1} / {pageCount}
      </span>
      <button type="button" disabled={!hasNext} onClick={onNext}>
        다음
      </button>
    </nav>
  );
}
