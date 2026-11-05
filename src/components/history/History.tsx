"use client";

import { useMemo } from "react";
import { getBrowserBattleStore } from "@/lib/browser-store";
import type { QueuedBattleStore } from "@/lib/battle-store";
import { pageCount, total } from "@/lib/stats";
import { useHistory } from "../useHistory";
import Pager from "./Pager";
import RecordList from "./RecordList";
import StatsPanel from "./StatsPanel";
import styles from "./history.module.css";

export default function History({ store }: { store?: QueuedBattleStore }) {
  const resolved = useMemo(() => store ?? getBrowserBattleStore(), [store]);
  const { state, next, prev, retry } = useHistory(resolved);
  const stats = state.phase === "ready" ? state.stats : null;
  const count = state.phase === "ready" ? total(state.stats) : null;

  return (
    <main>
      <StatsPanel stats={stats} />
      <section className={`${styles.card} ${styles.second}`} aria-labelledby="records-title">
        <h2 id="records-title" className={styles.stitle}>
          전체 대결 기록
        </h2>
        <p className={styles.sub}>수동·자동 대결을 구분하지 않고 모두 기록해요.</p>
        <div className={styles.cnt}>
          <span>저장된 대결</span>
          <strong>{count === null ? "—" : `${count}회`}</strong>
        </div>
        {state.phase === "loading" && (
          <>
            <div className={styles.sk} role="status" aria-busy="true" aria-label="기록을 불러오는 중">
              <i />
              <i />
              <i />
              <i />
            </div>
            <p className={styles.hint} style={{ textAlign: "center" }}>
              기록을 불러오는 중이에요…
            </p>
          </>
        )}
        {state.phase === "error" && (
          <div className={`${styles.state} ${styles.errState}`} role="alert">
            <div className={styles.ico} aria-hidden="true">
              ⚠️
            </div>
            <div>
              <b>기록을 불러오지 못했어요</b>
              <br />
              저장소를 읽는 중 문제가 생겼어요.
            </div>
            <button type="button" className={styles.retry} disabled={state.retrying} aria-busy={state.retrying || undefined} onClick={retry}>
              {state.retrying ? "다시 시도하는 중…" : "저장 다시 시도"}
            </button>
          </div>
        )}
        {state.phase === "ready" && count === 0 && (
          <div className={styles.state}>
            <div className={styles.ico} aria-hidden="true">
              🗒️
            </div>
            <div>
              아직 대결 기록이 없어요.
              <br />
              게임에서 대결하면 여기에 쌓여요.
            </div>
          </div>
        )}
        {state.phase === "ready" && count !== 0 && (
          <>
            <RecordList rows={state.rows} />
            <Pager
              pageIndex={state.pageIndex}
              pageCount={pageCount(count ?? 0)}
              hasNext={state.hasNext}
              onPrev={prev}
              onNext={next}
            />
          </>
        )}
      </section>
    </main>
  );
}
